/* PAMOJA member and leader app. This file only shows what the server sends and sends the person's choices back.
   Scores, loan health, approval order and permissions are all decided by the server. Buttons are hidden by role
   only for tidiness: the server refuses anything the role may not do. */
(function (w) {
  'use strict';
  var P = w.PAMOJA, api = P.api, html = P.html, raw = P.raw, money = P.money, dt = P.dt, toast = P.toast;
  var app = w.document.getElementById('app');
  var LEAD = ['Chairperson', 'Deputy Chairperson', 'Secretary', 'Treasurer', 'Admin', 'Organizing Secretary', 'Operations'];
  var S = { user: null, groups: [], gid: null, mem: null };
  var is = function () { return [].slice.call(arguments).indexOf(S.mem.role) >= 0; };
  var isL = function () { return LEAD.indexOf(S.mem.role) >= 0; };
  var g = function (p) { return '/g/' + S.gid + p; };
  var list = function (arr, fn, empty) { return arr.length ? arr.map(fn) : html`<p class="sub">${empty || 'Nothing here yet.'}</p>`; };
  var routes = {}, forms = {}, acts = {};

  /* ---------- start up ---------- */
  function boot() {
    if (!P.store.get('pamoja_token')) return showLogin();
    api('GET', '/me').then(function (r) { setSession(r.user, r.memberships); }).catch(function () { showLogin(); });
  }
  function showLogin() {
    P.loginView(app, { title: 'PAMOJA', hint: 'Sign in with your email address. We will email you a code.', onSuccess: function (r) { setSession(r.user, r.memberships); } });
  }
  function setSession(user, groups, gid) {
    S.user = user; S.groups = groups.filter(function (m) { return m.status === 'active'; });
    var want = gid || Number(P.store.get('pamoja_gid'));
    var m = S.groups.filter(function (x) { return x.group_id === want; })[0] || (S.groups.length === 1 ? S.groups[0] : null);
    if (!S.groups.length) return showJoin();
    if (!m) return showChooser();
    S.gid = m.group_id; S.mem = m; P.store.set('pamoja_gid', m.group_id);
    if (!w.location.hash) w.location.hash = '#/home'; else route();
  }
  function showChooser() {
    P.render(app, html`<div class="login card"><h1>Choose your group</h1>${S.groups.map(function (m) { return html`<p><button class="btn" data-pick="${m.group_id}">${m.group_name} (${m.role})</button></p>`; })}<p><button class="btn alt" data-act="join">Join another group</button></p></div>`);
  }
  function showJoin() {
    P.render(app, html`<div class="login card"><h1>Join your group</h1><p class="sub">Ask your Chairperson or Secretary for the group code.</p>
      <form data-form="join"><label>Your name<input name="name" required maxlength="80"></label><label>Group code<input name="group_code" required placeholder="e.g. UMOJA-24"></label>
      <label>Your position<select name="leader_role"><option value="">Ordinary member</option><option>Chairperson</option><option>Deputy Chairperson</option><option>Secretary</option><option>Treasurer</option><option>Organizing Secretary</option><option>Operations</option></select></label>
      <p class="note">A leader position must be approved by the Chairperson.</p><button class="btn">Join</button></form><p><button class="btn alt" data-act="signout">Sign out</button></p></div>`);
  }
  w.addEventListener('pamoja:signedout', showLogin);

  /* ---------- shell and router ---------- */
  var TABS = [['home', 'Home'], ['money', 'Money'], ['loans', 'Loans'], ['more', 'More']];
  var PARENT = { members: 'more', meetings: 'more', minutes: 'more', welfare: 'more', expenses: 'more', projects: 'more', devline: 'more', audit: 'more', reports: 'more', settings: 'more' };
  function shell(name, body) {
    var tab = PARENT[name] || name, who = S.user.name || S.user.phone;
    return html`<div class="app"><header class="hd"><div class="brand"><img class="logo" src="logo-96.png" alt=""><div><small>${S.mem.group_name}</small><h1>PAMOJA</h1></div></div><div class="who"><span class="av">${String(who).charAt(0).toUpperCase()}</span><div><b>${who}</b><span>${S.mem.role}</span></div></div></header>${P.navBar()}<main>${body}</main><nav class="tabs" aria-label="Main">${TABS.map(function (t) { return html`<a href="#/${t[0]}" class="${t[0] === tab ? 'on' : ''}">${t[1]}</a>`; })}</nav></div>`;
  }
  function route() {
    if (!S.mem) return;
    var name = (w.location.hash.replace(/^#\//, '').split('/')[0]) || 'home';
    var fn = routes[name] || routes.home; name = routes[name] ? name : 'home';
    Promise.resolve().then(fn).then(function (body) { P.render(app, shell(name, body)); w.scrollTo(0, 0); })
      .catch(function (e) { P.render(app, shell(name, html`<div class="card bad">${e.message}</div>`)); });
  }
  w.addEventListener('hashchange', route);
  var redo = function () { route(); };

  /* ---------- Sponsor windows (Home). The developer controls them; the server only sends messages that are showing now. ---------- */
  var AD = { slots: {}, idx: {}, at: {} };
  var okUrl = function (u) { return /^https:\/\//i.test(u || ''); };
  function adMsg(m, n, i) {
    return html`<div class="row"><b>${m.advertiser}</b><span class="pill">${m.type === 'video' ? 'Video' : m.type === 'voice' ? 'Voice' : 'Sponsored'}</span></div><div class="ad-body">${m.body}</div>${m.type === 'video' && okUrl(m.video_url) ? html`<video class="ad-video" src="${m.video_url}" controls muted playsinline preload="metadata"></video>` : ''}<div class="row wrap">${m.type === 'voice' ? html`<button class="btn alt" data-act="ad-voice" data-id="${m.id}">Play voice</button>` : html`<span></span>`}<button class="btn alt" data-act="ad-open" data-id="${m.id}">${m.button_text || 'Learn more'}</button></div>${n > 1 ? html`<div class="sub">${i + 1} of ${n}</div>` : ''}`;
  }
  function adSection(r) {
    AD.slots = {}; (r.slots || []).forEach(function (x) { AD.slots[x.slot] = x.messages; });
    return [1, 2, 3].map(function (n) {
      var l = AD.slots[n] || [];
      if (!l.length) return n === 3 ? '' : html`<div class="card ad empty"><div class="sub">Sponsor space ${n} is open. Banks and institutions can advertise here.</div></div>`;
      var i = (AD.idx[n] || 0) % l.length;
      return html`<div class="card ad"><div data-adslot="${n}">${adMsg(l[i], l.length, i)}</div></div>`;
    });
  }
  /* Each message stays for its own screen time, then the next one pops up. */
  w.setInterval(function () {
    if (!w.document.querySelectorAll) return;
    [].forEach.call(w.document.querySelectorAll('[data-adslot]'), function (el) {
      var s = el.getAttribute('data-adslot'), l = AD.slots[s] || [], now = Date.now();
      if (AD.at[s] === undefined) AD.at[s] = now;
      if (l.length < 2) return;
      var i = (AD.idx[s] || 0) % l.length;
      if (now - AD.at[s] >= l[i].screen_seconds * 1000) { i = (i + 1) % l.length; AD.idx[s] = i; AD.at[s] = now; el.innerHTML = String(adMsg(l[i], l.length, i)); }
    });
  }, 1000);
  var adById = function (id) { var f = null; Object.keys(AD.slots).forEach(function (s) { AD.slots[s].forEach(function (m) { if (String(m.id) === String(id)) f = m; }); }); return f; };
  acts['ad-voice'] = function (el) { var m = adById(el.dataset.id); if (m && w.speechSynthesis) { w.speechSynthesis.cancel(); w.speechSynthesis.speak(new w.SpeechSynthesisUtterance(m.advertiser + '. ' + m.body)); } };
  acts['ad-open'] = function (el) {
    var m = adById(el.dataset.id); if (!m) return;
    return api('POST', '/ads/' + m.id + '/click', { group_id: S.gid }).then(function () {
      if (okUrl(m.link_url) && w.open) w.open(m.link_url, '_blank', 'noopener,noreferrer'); else toast('Interest sent to ' + m.advertiser);
    });
  };

  /* ---------- Home: notice board ---------- */
  var STAGE = { published: ['Published', 'good'], sec: ['Waiting for the Secretary', 'warn'], chair: ['Waiting for the Chairperson', 'warn'], rejected: ['Not approved', 'bad'] };
  routes.home = function () {
    return Promise.all([api('GET', g('/notices')), api('GET', '/ads').catch(function () { return { slots: [] }; })]).then(function (r) {
      var n = r[0];
      return html`${adSection(r[1])}<h2>Notice board</h2><form class="card" data-form="notice"><textarea name="body" rows="2" maxlength="1000" required placeholder="${S.mem.role === 'Member' ? 'Send a notice through the Secretary' : 'Post a notice'}"></textarea><button class="btn">${S.mem.role === 'Chairperson' ? 'Post' : 'Send for approval'}</button></form>
      ${list(n, function (x) { var st = STAGE[x.stage] || [x.stage, '']; var mine = (x.stage === 'sec' && is('Secretary')) || (x.stage === 'chair' && is('Chairperson'));
        return html`<div class="card"><div>${x.body}</div><div class="row sub"><span>${x.author} \u00b7 ${dt(x.created_at)}</span><span class="${st[1]}">${st[0]}</span></div>${mine ? html`<div class="row wrap"><button class="btn" data-act="notice-ok" data-id="${x.id}">Approve</button><button class="btn del" data-act="notice-no" data-id="${x.id}">Reject</button></div>` : ''}</div>`; }, 'No notices yet.')}`;
    });
  };
  forms.notice = function (fd) { return api('POST', g('/notices'), { body: fd.get('body') }).then(function (r) { toast(r.stage === 'published' ? 'Posted' : 'Sent. It needs approval before members see it.'); }); };
  acts['notice-ok'] = function (el) { return api('POST', g('/notices/' + el.dataset.id + '/decide'), { approve: true }).then(function () { toast('Approved'); }); };
  acts['notice-no'] = function (el) { return api('POST', g('/notices/' + el.dataset.id + '/decide'), { approve: false }).then(function () { toast('Rejected'); }); };

  /* ---------- Money ---------- */
  routes.money = function () {
    var fin = is('Treasurer', 'Chairperson');
    return Promise.all([api('GET', g('/finance/summary')), api('GET', g('/who-paid')), api('GET', g('/payments/mine')), api('GET', g('/receipts')), api('GET', g('/members')), api('GET', g('/loans')), fin ? api('GET', g('/payments/pending')) : Promise.resolve([]), api('GET', g('/funerals'))])
      .then(function (r) {
        var sum = r[0], who = r[1], mine = r[2], rc = r[3], mem = r[4], loans = r[5].filter(function (l) { return l.status === 'dispatched' && l.borrower === S.user.name; }), pend = r[6], fun = r[7].filter(function (f) { return f.status === 'open'; });
        var acct = (S.mem.code || '') + '-' + String(S.user.name || 'ME').split(' ')[0].toUpperCase();
        return html`<h2>Group money</h2>
        <div class="stats"><div class="card"><b class="good">${money(sum.money_in)}</b><span class="sub">In, ${sum.month}</span></div><div class="card"><b class="bad">${money(sum.money_out)}</b><span class="sub">Out, ${sum.month}</span></div><div class="card"><b>${money(sum.balance)}</b><span class="sub">Balance</span></div><div class="card"><b>${money(sum.loans_to_members)}</b><span class="sub">Owed by members</span></div></div>
        <div class="sub">Group loan health: <b class="${sum.loan_health === 'Good' ? 'good' : 'bad'}">${sum.loan_health}</b>${sum.pending_warning ? html` \u00b7 <b class="warn">Many payments are waiting to be confirmed</b>` : ''}</div>
        <div class="card"><h3>Pay by M-Pesa Paybill</h3><div class="stats"><div class="card"><span class="sub">Paybill number</span><b>${P.cfg.PAYBILL_NUMBER}</b></div><div class="card"><span class="sub">Account number</span><b>${acct}</b></div></div>
          <p class="sub">1. Open M-Pesa, then Lipa na M-Pesa, then Pay Bill.<br>2. Enter the Paybill and account number.<br>3. Enter the amount and your PIN.<br>4. Send the M-Pesa code and your M-Pesa name below.</p>
          <form data-form="pay"><label>Paying for<select name="for_membership_id"><option value="">Myself</option>${mem.filter(function (m) { return m.membership_id !== S.mem.membership_id; }).map(function (m) { return html`<option value="${m.membership_id}">${m.name}</option>`; })}</select></label>
          <label>What for<select name="type"><option>Contribution</option><option>Funeral fund</option><option>Loan repayment</option><option>Other</option></select></label>
          <label>Loan (only for loan repayment)<select name="loan_id"><option value="">None</option>${loans.map(function (l) { return html`<option value="${l.id}">${money(l.amount)} \u00b7 ${l.purpose}</option>`; })}</select></label>
          <label>Funeral (only for funeral fund)<select name="funeral_id"><option value="">Latest open funeral</option>${fun.map(function (f) { return html`<option value="${f.id}">${f.name}</option>`; })}</select></label>
          <label>Amount paid (KES)<input name="amount" type="number" min="1" step="1" required></label>
          <label>M-Pesa code<input name="mpesa_code" maxlength="10" required placeholder="e.g. SJK4L9X2QP"></label>
          <label>Your M-Pesa name<input name="mpesa_name" required maxlength="80"></label><button class="btn">Send to Treasurer</button></form>
          <p class="note">The Treasurer confirms your payment against the Paybill statement. Your receipt appears below once confirmed.</p></div>
        ${mine.length ? html`<h2>My payments waiting</h2>${mine.map(function (p) { return html`<div class="card row"><span>${money(p.amount)} \u00b7 ${p.type}<br><span class="sub">${p.mpesa_code}${p.reject_reason ? ' \u00b7 ' + p.reject_reason : ''}</span></span><span class="${p.status === 'rejected' ? 'bad' : 'warn'}">${p.status === 'rejected' ? 'Not accepted' : 'Waiting'}</span></div>`; })}` : ''}
        ${fin ? html`<h2>Payments to confirm (${pend.length})</h2>${list(pend, function (p) { return html`<div class="card"><b>${p.payer}</b>${p.payer !== p.beneficiary ? ' paying for ' + p.beneficiary : ''} \u00b7 ${money(p.amount)} \u00b7 ${p.type}<div class="sub">Code ${p.mpesa_code} \u00b7 M-Pesa name ${p.mpesa_name}</div>${p.match_note ? html`<div class="note">${p.match_note}</div>` : ''}<div class="row wrap"><button class="btn" data-act="pay-ok" data-id="${p.id}">Confirm</button></div><form data-form="payno"><input type="hidden" name="id" value="${p.id}"><input name="reason" placeholder="Reason, if you reject" required><button class="btn del">Reject</button></form></div>`; }, 'All caught up.')}` : ''}
        <h2>Who has paid ${who.month}</h2><div class="card"><b>${who.paid_count} of ${who.total} paid</b><div class="bar"><i style="width:${who.total ? Math.round(who.paid_count / who.total * 100) : 0}%"></i></div>${who.members.map(function (m) { return html`<div>${m.paid ? html`<b class="good">\u2713</b>` : '\u25cb'} ${m.name}</div>`; })}</div>
        <h2>Receipts</h2>${list(rc, function (x) { return html`<div class="card"><b>${money(x.amount)} \u00b7 ${x.type}</b><div class="sub">${x.receipt_no} \u00b7 ${dt(x.decided_at)}<br>Paid by ${x.paid_by}${x.paid_by !== x.paid_for ? ' for ' + x.paid_for : ''} \u00b7 confirmed by ${x.confirmed_by}</div></div>`; }, 'No receipts yet.')}`;
      });
  };
  forms.pay = function (fd) {
    var b = { type: fd.get('type'), amount: Number(fd.get('amount')), mpesa_code: fd.get('mpesa_code'), mpesa_name: fd.get('mpesa_name') };
    if (fd.get('for_membership_id')) b.for_membership_id = Number(fd.get('for_membership_id'));
    if (fd.get('loan_id')) b.loan_id = Number(fd.get('loan_id'));
    if (fd.get('funeral_id')) b.funeral_id = Number(fd.get('funeral_id'));
    return api('POST', g('/payments'), b).then(function (r) { toast(r.auto_matched ? 'Sent. Safaricom already shows this payment.' : 'Sent to the Treasurer to confirm.'); });
  };
  acts['pay-ok'] = function (el) { return api('POST', g('/payments/' + el.dataset.id + '/decide'), { accept: true }).then(function () { toast('Confirmed. Receipt made.'); }); };
  forms.payno = function (fd) { return api('POST', g('/payments/' + fd.get('id') + '/decide'), { accept: false, reason: fd.get('reason') }).then(function () { toast('Rejected'); }); };

  /* ---------- Loans ---------- */
  routes.loans = function () {
    return Promise.all([api('GET', g('/loans')), api('GET', g('/loans/caps')), api('GET', g('/members'))]).then(function (r) {
      var caps = {}; r[1].forEach(function (c) { caps[c.kind] = c.amount; });
      return html`<h2>Loans</h2><div class="note">Caps are agreed by members in a meeting. Normal: ${caps.normal ? money(caps.normal) : 'not set'}. Emergency: ${caps.emergency ? money(caps.emergency) : 'not set'}.</div>
      ${is('Chairperson') ? html`<form class="card" data-form="caps"><h3>Set loan caps</h3><label>Normal (KES)<input name="normal" type="number" min="0" value="${caps.normal || ''}"></label><label>Emergency (KES)<input name="emergency" type="number" min="0" value="${caps.emergency || ''}"></label><button class="btn">Save caps</button></form>` : ''}
      ${list(r[0], function (l) { var cur = l.steps.filter(function (s) { return s.state !== 1; })[0];
        return html`<div class="card"><div class="row"><b>${l.borrower}</b><span class="${l.status === 'dispatched' ? 'good' : l.status === 'declined' ? 'bad' : 'warn'}">${l.status === 'in_approval' ? 'In approval' : l.status === 'dispatched' ? 'Dispatched' : 'Declined'}</span></div>
        <div class="sub">${l.kind} loan \u00b7 ${money(l.amount)} \u00b7 ${l.purpose}</div>
        ${l.status === 'dispatched' ? html`<div class="sub">Repaid ${money(l.repaid)} \u00b7 Balance ${money(l.balance)} \u00b7 Loan health <b class="${l.health === 'bad' ? 'bad' : 'good'}">${l.health === 'cleared' ? 'Cleared' : l.health === 'bad' ? 'Bad' : 'Good'}</b> (worked out by the server)</div>` : ''}
        ${l.steps.map(function (s) { return html`<div class="row sub"><span>${s.label}: ${s.approver}</span><span class="${s.state === 1 ? 'good' : s.state === -1 ? 'bad' : ''}">${s.state === 1 ? 'Approved' : s.state === -1 ? 'Declined' : (cur === s && l.status === 'in_approval' ? 'Waiting' : 'Not yet')}</span></div>`; })}
        ${l.waiting_on_you ? html`<div class="row wrap"><button class="btn" data-act="loan-ok" data-id="${l.id}">${cur && cur.label === 'Treasurer' ? 'Approve and dispatch' : 'Approve'}</button><button class="btn del" data-act="loan-no" data-id="${l.id}">Decline</button></div>` : ''}</div>`; }, 'No loans to show.')}
      <form class="card" data-form="loan"><h3>Request a loan</h3><label>Type<select name="kind"><option value="normal">Normal</option><option value="emergency">Emergency</option></select></label><label>Amount (KES)<input name="amount" type="number" min="1" required></label><label>Purpose<input name="purpose" required maxlength="200"></label>
      <label>Guarantor (optional)<select name="guarantor_membership_id"><option value="">None</option>${r[2].filter(function (m) { return m.membership_id !== S.mem.membership_id; }).map(function (m) { return html`<option value="${m.membership_id}">${m.name}</option>`; })}</select></label><button class="btn">Send request</button></form>`;
    });
  };
  forms.loan = function (fd) { var b = { kind: fd.get('kind'), amount: Number(fd.get('amount')), purpose: fd.get('purpose') }; if (fd.get('guarantor_membership_id')) b.guarantor_membership_id = Number(fd.get('guarantor_membership_id')); return api('POST', g('/loans'), b).then(function () { toast('Loan request sent to the first approver.'); }); };
  forms.caps = function (fd) { return api('PUT', g('/loans/caps'), { normal: Number(fd.get('normal')) || 0, emergency: Number(fd.get('emergency')) || 0 }).then(function () { toast('Caps saved'); }); };
  acts['loan-ok'] = function (el) { return api('POST', g('/loans/' + el.dataset.id + '/decide'), { approve: true }).then(function (r) { toast(r.status === 'dispatched' ? 'Approved and dispatched' : 'Approved. It moves to the next approver.'); }); };
  acts['loan-no'] = function (el) { return api('POST', g('/loans/' + el.dataset.id + '/decide'), { approve: false }).then(function () { toast('Declined'); }); };

  /* ---------- More ---------- */
  routes.more = function () {
    var t = [['members', 'Members', 'Leaders first']], extra = [];
    t.push(['meetings', 'Meetings', 'Check in, plan']); t.push(['minutes', 'Minutes', 'Current and archive']); t.push(['welfare', 'Welfare', 'Funeral fund, cover']); t.push(['expenses', 'Expenses', 'With approval']); t.push(['projects', 'Projects', 'Group projects']);
    if (isL()) t.push(['devline', 'Developer line', 'Leaders only']);
    if (is('Chairperson', 'Admin')) t.push(['audit', 'Audit trail', 'Who did what']);
    if (is('Chairperson', 'Treasurer', 'Admin')) t.push(['reports', 'Group reports', 'Request, view']);
    t.push(['settings', 'Settings', 'Privacy, sign out']);
    return html`<h2>More</h2><div class="tiles">${t.map(function (x) { return html`<a href="#/${x[0]}"><b>${x[1]}</b><span>${x[2]}</span></a>`; })}</div>`;
  };

  routes.members = function () {
    var admin = is('Admin', 'Chairperson');
    return Promise.all([api('GET', g('/members')), admin ? api('GET', g('/leader-requests')) : Promise.resolve([])]).then(function (r) {
      return html`<h2>Members</h2>${list(r[0], function (m) { return html`<div class="card row"><span><b>${m.name}</b><br><span class="sub">${m.role}${m.phone ? ' \u00b7 ' + m.phone : ''}</span></span>${admin && m.role !== 'Chairperson' ? html`<button class="btn del" data-act="mem-rm" data-id="${m.membership_id}">Remove</button>` : ''}</div>`; })}
      ${r[1].length ? html`<h2>Leader requests</h2>${r[1].map(function (q) { return html`<div class="card"><b>${q.name}</b> asks to be ${q.role}<div class="row wrap"><button class="btn" data-act="lr-ok" data-id="${q.id}">Approve</button><button class="btn del" data-act="lr-no" data-id="${q.id}">Decline</button></div></div>`; })}` : ''}
      ${admin ? html`<form class="card" data-form="addmem"><h3>Add a member</h3><label>Name<input name="name" required></label><label>Phone<input name="phone" inputmode="tel" required></label><button class="btn">Add and send invitation</button></form>
      <form class="card" data-form="import"><h3>Import a list</h3><label>One person per line: name, phone<textarea name="lines" rows="4"></textarea></label><button class="btn">Import</button></form>` : ''}
      ${is('Chairperson') ? html`<form class="card" data-form="role"><h3>Change a role</h3><label>Member<select name="mid">${r[0].map(function (m) { return html`<option value="${m.membership_id}">${m.name}</option>`; })}</select></label><label>New role<select name="role"><option>Member</option><option>Chairperson</option><option>Deputy Chairperson</option><option>Secretary</option><option>Treasurer</option><option>Admin</option><option>Organizing Secretary</option><option>Operations</option></select></label><button class="btn">Change role</button></form>` : ''}`;
    });
  };
  forms.addmem = function (fd) { return api('POST', g('/members'), { name: fd.get('name'), phone: fd.get('phone') }).then(function () { toast('Added. An invitation will be sent when email invitations are enabled.'); }); };
  forms.import = function (fd) { return api('POST', g('/members/import'), { lines: fd.get('lines') }).then(function (r) { toast(r.added + ' added' + (r.skipped.length ? ', ' + r.skipped.length + ' skipped' : '')); }); };
  forms.role = function (fd) { return api('POST', g('/members/' + fd.get('mid') + '/role'), { role: fd.get('role') }).then(function () { toast('Role changed'); }); };
  acts['mem-rm'] = function (el) { if (!w.confirm('Remove this member from the group?')) return; return api('POST', g('/members/' + el.dataset.id + '/remove'), {}).then(function () { toast('Removed'); }); };
  acts['lr-ok'] = function (el) { return api('POST', g('/leader-requests/' + el.dataset.id + '/decide'), { approve: true }).then(function () { toast('Leader approved'); }); };
  acts['lr-no'] = function (el) { return api('POST', g('/leader-requests/' + el.dataset.id + '/decide'), { approve: false }).then(function () { toast('Declined'); }); };

  routes.expenses = function () {
    return api('GET', g('/expenses')).then(function (e) {
      return html`<h2>Expenses</h2>${list(e, function (x) { return html`<div class="card"><div class="row"><b>${x.what}</b><span class="${x.status === 'spent' ? 'good' : x.status === 'declined' ? 'bad' : 'warn'}">${x.status === 'awaiting_chair' ? 'Waiting for the Chairperson' : x.status === 'spent' ? 'Spent' : 'Declined'}</span></div><div class="sub">${money(x.amount)} \u00b7 by ${x.submitted_by}${x.approved_by ? ' \u00b7 approved by ' + x.approved_by : ''}</div>${x.status === 'awaiting_chair' && is('Chairperson') ? html`<div class="row wrap"><button class="btn" data-act="ex-ok" data-id="${x.id}">Approve</button><button class="btn del" data-act="ex-no" data-id="${x.id}">Decline</button></div>` : ''}</div>`; }, 'No expenses yet.')}
      ${is('Treasurer') ? html`<form class="card" data-form="expense"><h3>Add an expense</h3><label>What for<input name="what" required></label><label>Amount (KES)<input name="amount" type="number" min="1" required></label><p class="note">Large amounts also need the Chairperson to approve.</p><button class="btn">Submit</button></form>` : ''}`;
    });
  };
  forms.expense = function (fd) { return api('POST', g('/expenses'), { what: fd.get('what'), amount: Number(fd.get('amount')) }).then(function (r) { toast(r.status === 'spent' ? 'Recorded' : 'Sent to the Chairperson to approve.'); }); };
  acts['ex-ok'] = function (el) { return api('POST', g('/expenses/' + el.dataset.id + '/decide'), { approve: true }).then(function () { toast('Approved'); }); };
  acts['ex-no'] = function (el) { return api('POST', g('/expenses/' + el.dataset.id + '/decide'), { approve: false }).then(function () { toast('Declined'); }); };

  routes.projects = function () {
    return api('GET', g('/projects')).then(function (p) {
      return html`<h2>Group projects</h2>${list(p, function (x) { return html`<div class="card"><div class="row"><h3>${x.name}</h3><span class="${x.status === 'Completed' ? 'good' : x.status === 'Stalled' ? 'bad' : 'warn'}">${x.status}</span></div><div class="sub">${x.description}</div><div class="sub">${x.location}${x.overseers ? ' \u00b7 Overseen by ' + x.overseers : ''}</div><details><summary>Read more</summary><div class="sub">Funding needed: ${money(x.funding_needed)}<br>Source: ${x.source || '-'}<br>Completion: ${x.completion || '-'}<br>Revenue: ${x.revenue_note || '-'}<br>Latest: ${x.latest_update || '-'}</div></details></div>`; }, 'No projects yet.')}
      ${is('Admin', 'Chairperson') ? html`<form class="card" data-form="project"><h3>Add a project page</h3><label>Name<input name="name" required></label><label>Description<input name="description"></label><label>Location<input name="location"></label><label>Members overseeing<input name="overseers"></label><label>Status<select name="status"><option>Ongoing</option><option>Stalled</option><option>Completed</option></select></label><label>Funding needed (KES)<input name="funding_needed" type="number" min="0"></label><label>Source<select name="source"><option>Group funds</option><option>Loan</option><option>Grant</option><option>Funds drive</option></select></label><button class="btn">Add project</button></form>` : ''}`;
    });
  };
  forms.project = function (fd) { var b = {}; fd.forEach(function (v, k) { b[k] = v; }); b.funding_needed = Number(b.funding_needed) || 0; return api('POST', g('/projects'), b).then(function () { toast('Project added'); }); };

  routes.devline = function () {
    return api('GET', g('/dev-line')).then(function (m) {
      return html`<h2>Developer line</h2><div class="note">A private channel between your group leaders and the app developer. Ordinary members cannot see it.</div>
      ${list(m, function (x) { return html`<div class="card ${x.from_dev ? '' : ''}"><div class="row"><b>${x.from_dev ? 'App developer' : x.author}</b><span class="pill">${x.topic}</span></div><div>${x.body}</div><div class="sub">${dt(x.created_at)}</div></div>`; }, 'No messages yet.')}
      <form class="card" data-form="devmsg"><label>Topic<select name="topic"><option>Support</option><option>Report request</option><option>Billing</option><option>Feature request</option><option>Urgent</option></select></label><label>Message<textarea name="body" rows="3" required></textarea></label><button class="btn">Send</button></form>`;
    });
  };
  forms.devmsg = function (fd) { return api('POST', g('/dev-line'), { topic: fd.get('topic'), body: fd.get('body') }).then(function () { toast('Sent to the app developer'); }); };

  routes.audit = function () {
    return api('GET', g('/audit')).then(function (a) { return html`<h2>Audit trail</h2>${list(a, function (x) { return html`<div class="card"><b>${x.action}</b><div>${x.detail}</div><div class="sub">${x.actor || 'System'} \u00b7 ${dt(x.created_at)}</div></div>`; })}`; });
  };

  routes.reports = function () {
    return Promise.all([api('GET', g('/reports')), api('GET', g('/report-catalog'))]).then(function (r) {
      return html`<h2>Group reports</h2><p class="sub">The app developer prepares these. Ask for one and it appears here once shared.</p>
      ${list(r[0], function (x) { return html`<div class="card row"><span>${x.type} \u00b7 ${x.label}</span><a class="btn alt" href="#/report/${x.id}">Open</a></div>`; }, 'No report shared with you yet.')}
      <form class="card" data-form="repreq"><h3>Request a report</h3><select name="report_id">${r[1].map(function (x) { return html`<option value="${x.id}">${x.type} \u00b7 ${x.label}</option>`; })}</select><button class="btn">Request</button></form>`;
    });
  };
  routes.report = function () {
    var id = w.location.hash.split('/')[2];
    return api('GET', g('/reports/' + id)).then(function (p) {
      var gr = p.groups[0];
      return html`<h2>${p.type} \u00b7 ${p.label}</h2><div class="card"><b class="${gr.score >= 80 ? 'good' : gr.score >= 60 ? 'warn' : 'bad'}">Health ${gr.score} (${gr.grade})</b><div class="sub">Collected ${money(gr.collected)} of ${money(gr.expected)} (${gr.collection_pct}%)<br>On-time repayment ${gr.on_time_repayment_pct}% \u00b7 Loans at risk ${gr.portfolio_at_risk_pct}%<br>Bank balance ${money(gr.bank_balance)} \u00b7 Expenses ${money(gr.expenses)}</div><div class="note">Scores are worked out by the server, not on your phone.</div></div>
      <div class="scroll"><table class="tb"><tr><th>Member</th><th>Role</th><th>Paid</th><th>Paid %</th><th>Loan balance</th><th>Loan</th><th>Score</th></tr>${gr.member_rows.map(function (m) { return html`<tr><td>${m.name}</td><td>${m.role}</td><td>${money(m.paid)}</td><td>${m.coll_pct}%</td><td>${money(m.loan_balance)}</td><td>${m.loan_status}</td><td>${m.score}</td></tr>`; })}</table></div>`;
    });
  };
  forms.repreq = function (fd) { return api('POST', g('/report-requests'), { report_id: Number(fd.get('report_id')) }).then(function () { toast('Request sent to the app developer'); }); };

  routes.settings = function () {
    return html`<h2>Settings</h2><div class="card"><h3>Sharing with sponsors</h3><p class="sub">Banks and sponsors may see your records in a group report only if you agree. You can change this at any time.</p>
      <div class="row wrap"><button class="btn" data-act="consent-yes">I agree</button><button class="btn alt" data-act="consent-no">I do not agree</button></div></div>
      ${is('Chairperson') ? html`<div class="card"><h3>Group sharing</h3><p class="sub">Allow the group's member records to be shared with sponsors (only for members who also agree).</p><div class="row wrap"><button class="btn" data-act="gconsent-yes">Allow</button><button class="btn alt" data-act="gconsent-no">Do not allow</button></div></div>` : ''}
      <div class="card"><div class="row wrap"><button class="btn alt" data-act="switch">Switch group</button><button class="btn del" data-act="signout">Sign out</button></div></div>`;
  };
  acts['consent-yes'] = function () { return api('POST', g('/me/consent'), { share: true }).then(function () { toast('Saved'); }); };
  acts['consent-no'] = function () { return api('POST', g('/me/consent'), { share: false }).then(function () { toast('Saved'); }); };
  acts['gconsent-yes'] = function () { return api('PATCH', g('/consent'), { share: true }).then(function () { toast('Saved'); }); };
  acts['gconsent-no'] = function () { return api('PATCH', g('/consent'), { share: false }).then(function () { toast('Saved'); }); };
  acts.switch = function () { P.store.del('pamoja_gid'); S.mem = null; S.gid = null; w.location.hash = ''; showChooser(); };
  acts.signout = function () { P.signOutLocal(); S.mem = null; w.location.hash = ''; showLogin(); };
  acts.join = function () { showJoin(); };

  forms.join = function (fd) {
    return api('POST', '/join', { group_code: fd.get('group_code'), name: fd.get('name'), leader_role: fd.get('leader_role') }).then(function (r) {
      toast(r.leader_request ? 'Joined. Your ' + r.leader_request + ' role waits for the Chairperson.' : 'Welcome!');
      return api('GET', '/me').then(function (me) { setSession(me.user, me.memberships, r.group_id); return 'skip'; });
    });
  };


  /* ---------- Meetings ---------- */
  var PLANNERS = ['Chairperson', 'Secretary', 'Admin', 'Organizing Secretary'];
  routes.meetings = function () {
    return api('GET', g('/meetings')).then(function (m) {
      var up = m.filter(function (x) { return x.status === 'upcoming'; }), held = m.filter(function (x) { return x.status === 'held'; });
      return html`<h2>Meetings</h2>${list(up, function (x) { return html`<div class="card"><h3>${x.when_text}</h3><div class="sub">${x.kind === 'online' ? 'Online' : 'Venue'}: ${x.place}<br>Agenda: ${x.agenda || 'to follow'}<br>Checked in so far: ${x.attended}</div>
        ${x.pin ? html`<div class="note">Announce this PIN at the meeting: <b>${x.pin}</b></div>` : ''}
        ${x.checked_in ? html`<p class="good">You are checked in.</p>` : html`<form data-form="checkin"><input type="hidden" name="id" value="${x.id}"><label>PIN from the Chairperson<input name="pin" inputmode="numeric" maxlength="4" required></label><button class="btn">Check in</button></form>`}
        ${x.pin && is('Chairperson', 'Secretary') ? html`<button class="btn alt" data-act="mtg-close" data-id="${x.id}">Close the meeting</button>` : ''}</div>`; }, 'No meeting planned yet.')}
        ${held.length ? html`<h2>Last meeting</h2><div class="card">${held[0].when_text} \u00b7 ${held[0].place}<div class="sub">${held[0].attended} members checked in</div></div>` : ''}
        ${is.apply(null, PLANNERS) ? html`<form class="card" data-form="meeting"><h3>Plan a meeting</h3><label>Day and time<input name="when_text" required placeholder="Sat 24 Oct, 2 pm"></label><label>Type<select name="kind"><option value="offline">At a venue</option><option value="online">Online</option></select></label><label>Venue, or online link and details<input name="place" required></label><label>Agenda<input name="agenda"></label><button class="btn">Send to the Notice Board</button></form>` : ''}`;
    });
  };
  forms.meeting = function (fd) { return api('POST', g('/meetings'), { when_text: fd.get('when_text'), kind: fd.get('kind'), place: fd.get('place'), agenda: fd.get('agenda') }).then(function () { toast('Meeting planned and posted to the Notice Board'); }); };
  forms.checkin = function (fd) { return api('POST', g('/meetings/' + fd.get('id') + '/checkin'), { pin: fd.get('pin') }).then(function () { toast('You are checked in'); }); };
  acts['mtg-close'] = function (el) { return api('POST', g('/meetings/' + el.dataset.id + '/close'), {}).then(function () { toast('Meeting closed'); }); };

  /* ---------- Minutes: current for 3 months, then archived, never deleted ---------- */
  var minuteCard = function (x) { return html`<div class="card"><b>${x.held_on}</b>${x.approvals ? html`<div class="sub">${x.approvals}</div>` : ''}${x.motions.length ? html`<div class="sub">Motions passed: ${x.motions.join('; ')}</div>` : ''}${x.actions.length ? html`<div class="sub">Action items: ${x.actions.join('; ')}</div>` : ''}${x.body ? html`<details><summary>Full minutes</summary><p>${x.body}</p></details>` : ''}</div>`; };
  routes.minutes = function () {
    return api('GET', g('/minutes')).then(function (m) {
      var cur = m.filter(function (x) { return !x.archived; }), old = m.filter(function (x) { return x.archived; });
      return html`<h2>Current minutes</h2>${list(cur, minuteCard, 'No minutes in the last 3 months.')}
        <h2>Archive</h2><p class="sub">Minutes older than 3 months. They are kept for good and cannot be deleted.</p>${list(old, minuteCard, 'Nothing archived yet.')}
        ${is('Secretary', 'Chairperson') ? html`<form class="card" data-form="minutes"><h3>Add minutes</h3><label>Meeting date<input name="held_on" type="date" required></label><label>Approvals (for example: last 3 minutes approved)<input name="approvals"></label><label>Motions passed (one per line)<textarea name="motions" rows="2"></textarea></label><label>Action items (one per line)<textarea name="actions" rows="2"></textarea></label><label>Full minutes (optional)<textarea name="body" rows="4"></textarea></label><button class="btn">Save minutes</button></form>` : ''}`;
    });
  };
  var lines = function (v) { return String(v || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); };
  forms.minutes = function (fd) { return api('POST', g('/minutes'), { held_on: fd.get('held_on'), approvals: fd.get('approvals'), motions: lines(fd.get('motions')), actions: lines(fd.get('actions')), body: fd.get('body') }).then(function () { toast('Minutes saved'); }); };

  /* ---------- Welfare: funeral fund and insurance cover ---------- */
  routes.welfare = function () {
    return Promise.all([api('GET', g('/funerals')), api('GET', g('/welfare/shield'))]).then(function (r) {
      var sh = r[1], me = sh.mine, tone = me.status === 'Fully insured' ? 'good' : me.status === 'Partial' ? 'warn' : 'bad';
      return html`<h2>Funeral fund</h2>${list(r[0], function (f) { return html`<div class="card"><div class="row"><h3>${f.name}</h3><span class="${f.status === 'open' ? 'warn' : 'sub'}">${f.status === 'open' ? 'Open' : 'Closed'}</span></div><div class="sub">${f.relationship || ''}${f.funeral_date ? ' \u00b7 ' + f.funeral_date : ''}</div><div class="bar"><i style="width:${f.pct}%"></i></div><div class="sub">Budget ${money(f.budget)} \u00b7 In ${money(f.raised)} \u00b7 Balance ${money(f.balance)}</div>${f.status === 'open' ? html`<a class="btn" href="#/money">Pay by Paybill</a>` : ''}${f.status === 'open' && is('Chairperson', 'Treasurer') ? html` <button class="btn alt" data-act="fun-close" data-id="${f.id}">Close fund</button>` : ''}</div>`; }, 'No funeral fund is open.')}
        ${is('Chairperson', 'Secretary', 'Treasurer', 'Admin') ? html`<form class="card" data-form="funeral"><h3>Open a funeral fund</h3><label>Name of the deceased<input name="name" required></label><label>Relationship to the group<input name="relationship"></label><label>Funeral date<input name="funeral_date" type="date"></label><label>Budget (KES)<input name="budget" type="number" min="1" required></label><button class="btn">Open fund</button></form>` : ''}
        <h2>My cover</h2><div class="card"><div class="row"><b class="${tone}">${me.status}</b><span class="sub">NSSF ${me.nssf ? '\u2713' : '\u2717'} \u00b7 SHA ${me.sha ? '\u2713' : '\u2717'}</span></div>${me.sha_number ? html`<div class="sub">SHA number ${me.sha_number}${me.sha_expiry ? ' \u00b7 expires ' + me.sha_expiry : ''}${me.sha_days_left !== null ? html` \u00b7 <b class="${me.sha_days_left <= 30 ? 'warn' : 'good'}">${me.sha_days_left} days left</b>` : ''}</div>` : ''}
        <form data-form="cover"><label><input type="checkbox" name="nssf" ${me.nssf ? 'checked' : ''}> I have NSSF</label><label><input type="checkbox" name="sha" ${me.sha ? 'checked' : ''}> I have SHA</label><label>SHA number<input name="sha_number" value="${me.sha_number || ''}"></label><label>SHA expiry date<input name="sha_expiry" type="date" value="${me.sha_expiry || ''}"></label><button class="btn">Save my cover</button></form></div>
        ${sh.group ? html`<h2>Group cover</h2><div class="card"><div><b class="good">${sh.group.fully}</b> fully insured \u00b7 <b class="warn">${sh.group.partial}</b> partial \u00b7 <b class="bad">${sh.group.uninsured}</b> uninsured</div>${sh.group.members.map(function (m) { return html`<div class="row sub"><span>${m.name}</span><span>${m.status}</span></div>`; })}</div>` : ''}`;
    });
  };
  forms.funeral = function (fd) { return api('POST', g('/funerals'), { name: fd.get('name'), relationship: fd.get('relationship'), funeral_date: fd.get('funeral_date'), budget: Number(fd.get('budget')) }).then(function () { toast('Funeral fund opened'); }); };
  forms.cover = function (fd) { return api('PUT', g('/welfare/cover'), { nssf: !!fd.get('nssf'), sha: !!fd.get('sha'), sha_number: fd.get('sha_number'), sha_expiry: fd.get('sha_expiry') }).then(function () { toast('Cover saved'); }); };
  acts['fun-close'] = function (el) { return api('POST', g('/funerals/' + el.dataset.id + '/close'), {}).then(function () { toast('Fund closed'); }); };

  /* ---------- one place for all clicks and form submits ---------- */
  P.on(app, 'submit', 'form[data-form]', function (e, f) {
    e.preventDefault(); var fn = forms[f.dataset.form]; if (!fn) return;
    P.busy(f, true);
    Promise.resolve().then(function () { return fn(new FormData(f)); }).then(function (r) { if (r !== 'skip') redo(); }).catch(function (x) { toast(x.message, 1); P.busy(f, false); });
  });
  P.on(app, 'click', '[data-act]', function (e, b) {
    var fn = acts[b.dataset.act]; if (!fn) return; e.preventDefault(); b.disabled = true;
    Promise.resolve().then(function () { return fn(b); }).then(function () { if (/^ad-/.test(b.dataset.act)) b.disabled = false; else if (b.dataset.act !== 'signout' && b.dataset.act !== 'switch' && b.dataset.act !== 'join') redo(); }).catch(function (x) { toast(x.message, 1); b.disabled = false; });
  });
  P.on(app, 'click', '[data-pick]', function (e, b) { setSession(S.user, S.groups, Number(b.dataset.pick)); });

  w.PAMOJA_CLIENT = { S: S, routes: routes, forms: forms, acts: acts, setSession: function (u, gs, gid) { S.user = u; S.groups = gs; var m = gs.filter(function (x) { return x.group_id === gid; })[0]; S.gid = gid; S.mem = m; } };
  boot();
})(window);
