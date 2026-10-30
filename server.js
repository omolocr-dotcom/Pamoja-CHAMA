'use strict';
/* PAMOJA server: allow-listed static frontend + PostgreSQL-backed email OTP API. */
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC = new Set(['404.html','apple-touch-icon.png','client.html','client.js','common.js','config.js','developer.html','developer.js','favicon-32.png','icon-192.png','icon-512.png','index.html','logo-96.png','logo.png','manifest.json','maskable-512.png','pwa.js','shared.html','shared.js','style.css','sw.js']);
const missing = [...PUBLIC].filter(f => !fs.existsSync(path.join(ROOT, f)));
if (missing.length) { console.error('Missing public files:', missing.join(', ')); process.exit(1); }
if (process.argv.includes('--check')) { console.log('Public files present; API configuration is checked at runtime.'); process.exit(0); }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is required. Configure it in the hosting environment.'); process.exit(1); }
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) { console.error('SESSION_SECRET must be at least 32 characters.'); process.exit(1); }
if (!process.env.OTP_PEPPER || process.env.OTP_PEPPER.length < 32) { console.error('OTP_PEPPER must be at least 32 characters.'); process.exit(1); }
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: true }, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
const app = express();
app.disable('x-powered-by'); app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], mediaSrc: ["'self'", 'https:'], connectSrc: ["'self'", 'https:', 'http://localhost:*', 'http://127.0.0.1:*'], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"] } } }));
const corsOrigin = process.env.CORS_ORIGIN;
app.use((req,res,next) => { if (corsOrigin && req.headers.origin === corsOrigin) { res.setHeader('Access-Control-Allow-Origin', corsOrigin); res.setHeader('Vary','Origin'); res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, DELETE, OPTIONS'); } if (req.method === 'OPTIONS') return res.sendStatus(204); next(); });
app.use(express.json({ limit: '32kb', strict: true }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many authentication requests. Please wait and try again.' } });
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many code attempts. Please wait and request a new code.' } });
const mailReady = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_FROM);
const transporter = mailReady ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 465), secure: String(process.env.SMTP_SECURE || 'true') === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 }) : null;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const otpHash = (email, code) => sha(`${email}:${code}:${process.env.OTP_PEPPER}`);
const normalizeEmail = e => String(e || '').trim().toLowerCase();
const validEmail = e => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const devEmails = new Set(String(process.env.DEV_ADMIN_EMAILS || '').split(',').map(normalizeEmail).filter(validEmail));
function signToken(payload) { const data = Buffer.from(JSON.stringify(payload)).toString('base64url'); const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(data).digest('base64url'); return `${data}.${sig}`; }
function verifyToken(token) { const parts = String(token || '').split('.'); if (parts.length !== 2) return null; const expected = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(parts[0]).digest(); let got; try { got = Buffer.from(parts[1], 'base64url'); } catch { return null; } if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null; try { const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; } }
async function auth(req,res,next) { try { const token = (req.headers.authorization || '').replace(/^Bearer\s+/i,''); const p = verifyToken(token); if (!p) return res.status(401).json({error:'Please sign in again.'}); const q = await pool.query('SELECT s.id AS session_id,u.id,u.email,u.full_name,u.phone,u.role,u.is_active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2 AND s.token_hash=$3 AND s.revoked_at IS NULL AND s.expires_at>NOW() AND u.is_active=TRUE', [p.sid,p.uid,sha(token)]); if (!q.rowCount) return res.status(401).json({error:'Session expired. Please sign in again.'}); req.user=q.rows[0]; req.token=token; next(); } catch(e) { next(e); } }
function developerOnly(req,res,next) { if (req.user.role !== 'developer' || !devEmails.has(req.user.email)) return res.status(403).json({error:'Developer access is not authorized for this account.'}); next(); }
app.get('/health', async (req,res) => { try { await pool.query('SELECT 1'); res.set('Cache-Control','no-store').json({ok:true,app:'PAMOJA API',database:'connected'}); } catch { res.status(503).set('Cache-Control','no-store').json({ok:false,app:'PAMOJA API',database:'unavailable'}); } });
app.get('/healthz', (req,res) => res.redirect(307,'/health'));
app.post('/api/auth/request-otp', authLimiter, async (req,res,next) => {
  try {
    if (!mailReady) return res.status(503).json({error:'Email sign-in is not configured on the server yet.'});
    const email=normalizeEmail(req.body && req.body.email); if (!validEmail(email)) return res.status(400).json({error:'Enter a valid email address.'});
    const recent=await pool.query("SELECT COUNT(*)::int AS n FROM otp_challenges WHERE email=$1 AND created_at>NOW()-INTERVAL '15 minutes'",[email]); if (recent.rows[0].n>=4) return res.status(429).json({error:'Too many codes requested for this email. Try again later.'});
    let u=await pool.query('SELECT id,role,is_active FROM users WHERE email=$1',[email]);
    if (!u.rowCount) { const role=devEmails.has(email)?'developer':'member'; u=await pool.query('INSERT INTO users(email,role) VALUES($1,$2) RETURNING id,role,is_active',[email,role]); }
    if (!u.rows[0].is_active) return res.status(403).json({error:'This account is disabled. Contact your group administrator.'});
    // Role is only promoted for addresses explicitly allow-listed by the operator.
    if (devEmails.has(email) && u.rows[0].role !== 'developer') await pool.query("UPDATE users SET role='developer',updated_at=NOW() WHERE id=$1",[u.rows[0].id]);
    const code=String(crypto.randomInt(0,1000000)).padStart(6,'0');
    await pool.query('UPDATE otp_challenges SET consumed_at=NOW() WHERE email=$1 AND consumed_at IS NULL',[email]);
    await pool.query("INSERT INTO otp_challenges(email,code_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '5 minutes')",[email,otpHash(email,code)]);
    try { await transporter.sendMail({from:process.env.EMAIL_FROM,to:email,subject:'Your PAMOJA sign-in code',text:`Your PAMOJA verification code is ${code}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`,html:`<p>Your PAMOJA verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>This code expires in 5 minutes. If you did not request it, ignore this email.</p>`}); }
    catch(e) { await pool.query('UPDATE otp_challenges SET consumed_at=NOW() WHERE email=$1 AND consumed_at IS NULL',[email]); console.error('SMTP delivery failed:',e.message); return res.status(502).json({error:'We could not send the email right now. Please try again later.'}); }
    res.set('Cache-Control','no-store').json({ok:true,message:'If the address can sign in, a verification code has been sent.',expires_in:300,email});
  } catch(e) { next(e); }
});
app.post('/api/auth/verify', verifyLimiter, async (req,res,next) => {
  const client=await pool.connect(); try {
    const email=normalizeEmail(req.body && req.body.email); const code=String(req.body && req.body.code || '').trim(); if (!validEmail(email) || !/^\d{6}$/.test(code)) return res.status(400).json({error:'Enter the email address and 6-digit code.'});
    await client.query('BEGIN');
    const q=await client.query('SELECT * FROM otp_challenges WHERE email=$1 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE',[email]);
    if (!q.rowCount) { await client.query('ROLLBACK'); return res.status(401).json({error:'That code is invalid or expired. Request a new one.'}); }
    const challenge=q.rows[0]; if (new Date(challenge.expires_at)<=new Date() || challenge.attempts>=5) { await client.query('UPDATE otp_challenges SET consumed_at=NOW() WHERE id=$1',[challenge.id]); await client.query('COMMIT'); return res.status(401).json({error:'That code is invalid or expired. Request a new one.'}); }
    if (challenge.code_hash !== otpHash(email,code)) { await client.query('UPDATE otp_challenges SET attempts=attempts+1,consumed_at=CASE WHEN attempts+1>=5 THEN NOW() ELSE consumed_at END WHERE id=$1',[challenge.id]); await client.query('COMMIT'); return res.status(401).json({error:'That code is incorrect or expired.'}); }
    const uq=await client.query('SELECT * FROM users WHERE email=$1 AND is_active=TRUE FOR UPDATE',[email]); if (!uq.rowCount) { await client.query('ROLLBACK'); return res.status(403).json({error:'This account is unavailable.'}); }
    const user=uq.rows[0]; if (devEmails.has(email) && user.role!=='developer') { user.role='developer'; await client.query("UPDATE users SET role='developer',email_verified_at=COALESCE(email_verified_at,NOW()),updated_at=NOW() WHERE id=$1",[user.id]); } else { await client.query('UPDATE users SET email_verified_at=COALESCE(email_verified_at,NOW()),updated_at=NOW() WHERE id=$1',[user.id]); }
    await client.query('UPDATE otp_challenges SET consumed_at=NOW() WHERE id=$1',[challenge.id]);
    const sid=crypto.randomUUID(); const exp=Date.now()+7*24*60*60*1000; const token=signToken({sid,uid:user.id,exp});
    await client.query('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL \'7 days\')',[sid,user.id,sha(token)]);
    await client.query('INSERT INTO audit_log(actor_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4)',[user.id,'auth.login','user',user.id]);
    await client.query('COMMIT'); res.set('Cache-Control','no-store').json({token,user:{id:user.id,email:user.email,full_name:user.full_name,phone:user.phone,is_dev:user.role==='developer',role:user.role}});
  } catch(e) { try { await client.query('ROLLBACK'); } catch {} next(e); } finally { client.release(); }
});
app.post('/api/auth/logout', auth, async (req,res,next) => { try { await pool.query('UPDATE sessions SET revoked_at=NOW() WHERE id=$1',[req.user.session_id]); res.json({ok:true}); } catch(e){next(e);} });
app.get('/api/me', auth, async (req,res,next) => { try { const q=await pool.query("SELECT g.id AS group_id,g.name AS group_name,g.description,gm.member_role AS role,gm.status FROM groups g JOIN group_members gm ON gm.group_id=g.id WHERE gm.user_id=$1 AND gm.status='active' ORDER BY g.name",[req.user.id]); const user={id:req.user.id,email:req.user.email,name:req.user.full_name,full_name:req.user.full_name,phone:req.user.phone,is_dev:req.user.role==='developer',role:req.user.role}; res.set('Cache-Control','no-store').json({user:user,memberships:q.rows}); } catch(e){next(e);} });
app.post('/api/join', auth, async (req,res,next) => { const code=String(req.body && req.body.group_code || '').trim().toUpperCase(); const name=String(req.body && req.body.name || '').trim(); if(!code || !name || name.length>80) return res.status(400).json({error:'Enter your name and group code.'}); const c=await pool.connect(); try { await c.query('BEGIN'); const g=await c.query('SELECT id FROM groups WHERE upper(group_code)=upper($1) FOR UPDATE',[code]); if(!g.rowCount){await c.query('ROLLBACK');return res.status(404).json({error:'That group code was not found.'});} await c.query("UPDATE users SET full_name=$1,updated_at=NOW() WHERE id=$2",[name,req.user.id]); const exists=await c.query('SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2',[g.rows[0].id,req.user.id]); if(!exists.rowCount) await c.query("INSERT INTO group_members(group_id,user_id,member_role,status) VALUES($1,$2,'Member','active')",[g.rows[0].id,req.user.id]); await c.query('INSERT INTO audit_log(actor_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4)',[req.user.id,'group.join','group',g.rows[0].id]); await c.query('COMMIT'); res.status(201).json({ok:true,group_id:g.rows[0].id}); } catch(e){try{await c.query('ROLLBACK')}catch{} next(e)} finally{c.release()} });
app.get('/api/groups', auth, async (req,res,next) => { try { const q=await pool.query('SELECT g.id,g.name,g.description,gm.member_role FROM groups g JOIN group_members gm ON gm.group_id=g.id WHERE gm.user_id=$1 ORDER BY g.created_at DESC',[req.user.id]); res.json({groups:q.rows}); } catch(e){next(e);} });
app.post('/api/groups', auth, async (req,res,next) => { const name=String(req.body && req.body.name || '').trim(); if (!name || name.length>120) return res.status(400).json({error:'Group name is required (maximum 120 characters).'}); const c=await pool.connect(); try { await c.query('BEGIN'); const g=await c.query('INSERT INTO groups(name,description,created_by) VALUES($1,$2,$3) RETURNING *',[name,String(req.body.description||'').slice(0,2000),req.user.id]); await c.query("INSERT INTO group_members(group_id,user_id,member_role) VALUES($1,$2,'Chairperson')",[g.rows[0].id,req.user.id]); await c.query('INSERT INTO audit_log(actor_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4)',[req.user.id,'group.create','group',g.rows[0].id]); await c.query('COMMIT'); res.status(201).json({group:g.rows[0]}); } catch(e){try{await c.query('ROLLBACK')}catch{} next(e)} finally{c.release()} });
app.get('/api/dev/groups', auth, developerOnly, async (req,res,next) => { try { const q=await pool.query('SELECT g.*,COUNT(gm.user_id)::int AS member_count FROM groups g LEFT JOIN group_members gm ON gm.group_id=g.id GROUP BY g.id ORDER BY g.created_at DESC'); res.json({groups:q.rows}); } catch(e){next(e);} });
app.get('/api/dev/inbox', auth, developerOnly, (req,res)=>res.json({messages:[]}));
// Explicitly report unfinished feature APIs instead of returning misleading fake data.
const notReady = ['/api/money','/api/loans','/api/notices','/api/members','/api/dev/ads','/api/dev/reports','/api/dev/report-requests','/api/dev/shares'];
app.use('/api', auth, (req,res) => { res.status(501).json({error:'This PAMOJA feature API has not been migrated to the new database yet.',feature:'backend-migration-incomplete',path:req.path}); });
app.use((req,res,next) => { if (req.method!=='GET' && req.method!=='HEAD') return res.status(405).send('Method not allowed'); let pathname; try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{return res.status(400).send('Bad request')} const rel=path.posix.normalize(pathname==='/'?'/index.html':pathname).replace(/^\/+/, ''); if(!PUBLIC.has(rel)) return res.status(404).sendFile(path.join(ROOT,'404.html')); const file=path.join(ROOT,rel); res.set('Cache-Control',/\.(html|js|css)$/.test(rel)||rel==='manifest.json'?'no-cache':'public, max-age=604800'); if(rel==='sw.js')res.set({'Cache-Control':'no-cache, no-store, must-revalidate','Service-Worker-Allowed':'/'}); if(rel==='developer.html')res.set('X-Robots-Tag','noindex, nofollow'); res.sendFile(file); });
app.use((err,req,res,next)=>{ console.error('Request failed:',err && err.message); if(res.headersSent)return next(err); res.status(500).json({error:'Unexpected server error.'}); });
app.listen(PORT,'0.0.0.0',()=>console.log(`PAMOJA server listening on ${PORT}`));
process.on('SIGTERM',()=>pool.end().finally(()=>process.exit(0)));
