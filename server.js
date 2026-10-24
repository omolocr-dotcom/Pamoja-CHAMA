'use strict';
/* PAMOJA website server for cloud hosts that run an app (such as Chajio).
   It only hands out the website files listed below. No database, no secrets, no packages to install.
   - Listens on the port the host gives it in the PORT setting (default 3000), on all addresses.
   - Health check address:  /health   (answers 200 as soon as it is running)
   - "node server.js --check" tells you which website files are missing from the repository.
   - Never serves this file, package.json or the Dockerfile. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC = new Set(["404.html", "apple-touch-icon.png", "client.html", "client.js", "common.js", "config.js", "developer.html", "developer.js", "favicon-32.png", "icon-192.png", "icon-512.png", "index.html", "logo-96.png", "logo.png", "manifest.json", "maskable-512.png", "pwa.js", "shared.html", "shared.js", "style.css", "sw.js"]);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const missing = [...PUBLIC].filter((f) => !fs.existsSync(path.join(ROOT, f)));
if (missing.length) {
  console.error('\nPAMOJA cannot start: these website files are missing from the repository:\n  ' + missing.join('\n  ') + '\n\nUpload every file to the top level of the repository. This version has no folders.');
  process.exit(1);
}
if (process.argv.includes('--check')) { console.log('All ' + PUBLIC.size + ' website files are present.'); process.exit(0); }

function cacheFor(rel) { return /\.(html|js|css)$/.test(rel) || rel === 'manifest.json' ? 'no-cache' : 'public, max-age=604800'; }
function send(res, status, body, type, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' }, extra || {}));
  res.end(body);
}
function notFound(req, res) {
  fs.readFile(path.join(ROOT, '404.html'), (e, b) => send(res, 404, req.method === 'HEAD' ? '' : (e ? 'Not found' : b), e ? 'text/plain; charset=utf-8' : TYPES['.html'], { 'Cache-Control': 'no-cache' }));
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain; charset=utf-8', { Allow: 'GET, HEAD' });
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { return send(res, 400, 'Bad request', 'text/plain; charset=utf-8'); }
  if (p === '/health' || p === '/healthz') return send(res, 200, req.method === 'HEAD' ? '' : JSON.stringify({ ok: true, app: 'PAMOJA web' }), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
  const rel = path.posix.normalize(p === '/' ? '/index.html' : p).replace(/^\/+/, '');
  if (!PUBLIC.has(rel)) return notFound(req, res);          // only the exact files in the list above, nothing else
  const file = path.join(ROOT, rel);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(req, res);
    const headers = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cacheFor(rel), 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
    if (rel === 'sw.js') { headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'; headers['Service-Worker-Allowed'] = '/'; }
    if (rel === 'developer.html') headers['X-Robots-Tag'] = 'noindex, nofollow';
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => console.log('PAMOJA web is running on port ' + PORT + '. Health check: /health'));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
