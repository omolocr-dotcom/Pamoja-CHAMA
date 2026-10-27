/* PAMOJA developer console. Separate from the member app: members never load this file.
   The server authorizes only email addresses listed in DEV_ADMIN_EMAILS on the server. */
(function (w) {
  'use strict';
  var P = w.PAMOJA, api = P.api, html = P.html, money = P.money, dt = P.dt, toast = P.toast;
  var app = w.document.getElementById('app');
  var routes = {}, forms = {}, acts = {}, S = { user: null, last: null };
  var list = function (arr, fn, empty) { return arr.length ? arr.map(fn) : html`<p class="sub">${empty || 'Nothing here yet.'}</p>`; };

  function boot() {
    if (!P.store.get('pamoja_token')) return showLogin();
    api('GET', '/me').then(function (r) { start(r.user); }).catch(showLogin);
  }
  function showLogin() { P.loginView(app, { title: 'PAMOJA developer console', hint: 'For authorized developers only. Sign in with your developer email address.', onSuccess: function (r) { start(r.user); } }); }
  function start(user) {
    if (!user.is_dev) { P.signOutLocal(); showLogin(); return toast('This email address is not authorized for developer access.', 1); }
    S.user = user; if (!w.location.hash) w.location.hash = '#/groups'; else route();
  }
  w.addEventListener('pamoja:signedout', showLogin);

  var TABS = [['groups', 'Groups'], ['sponsors', 'Sponsors'], ['inbox', 'Inbox'], ['reports', 'Reports']];
  var PARENT = { thread: 'inbox', report: 'reports' };
  function shell(name, body) {
    var tab = PARENT[name] || name;
    return html`<div class="app wide dev"><header class="hd"><div class="brand"><img class="logo" src="logo-96.png" alt=""><div><small>App developer</small><h1>PAMOJA console</h1></div></div><div class="who"><span class="av">D</span><div><b>${S.user.name || S.user.phone}</b><span><button class="btn alt" data-act="signout">Sign out</button></span></div></div></header>${P.navBar()}<main>${body}</main><nav class="tabs" aria-label="Main">${TABS.map(function (t) { return html`<a href="#/${t[0]}" class="${t[0] === tab ? 'on' : ''}">${t[1]}</a>`; })}</nav></div>`;
  }
  function route() {
    if (!S.user) return;
    var name = w.location.hash.replace(/^#\//, '').split('/')[0] || 'groups'; if (!routes[name]) name = 'groups';
    Promise.resolve().then(routes[name]).then(function (b) { P.render(app, shell(name, b)); w.scrollTo(0, 0); })
      .catch(function (e) { P.render(app, shell(name, html`<div class="card bad">${e.message}</div>`)); });
  }
  w.addEventListener('hashchange', route);
  var arg = function (i) { return w.location.hash.split('/')[i]; };

  /* ---------- Sponsor windows: only the developer adds, edits or times these ---------- */
  var WIN = ['', 'Window 1 (sponsor)', 'Window 2 (sponsor)', 'Window 3 (advert)'];
  var hms = function (ms) { var s = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(function (x) { return String(x).padStart(2, '0'); }).join(':'); };
  var timeText = function (x) { var now = Date.now(); if (x.status === 'Active') return 'drops off in ' + hms(Date.parse(x.ends_at) - now); if (x.status === 'Waiting') return 'starts in ' + hms(Date.parse(x.starts_at) - now); return ''; };
  function adRow(x) {
    return html`<div class="note"><b>${x.advertiser}</b> (${x.type}): ${x.body}<br><span class="${x.status === 'Active' ? 'good' : x.status === 'Waiting' ? 'warn' : 'bad'}">${x.status}</span> \u00b7 screen time ${x.screen_seconds}s \u00b7 <span data-starts="${x.starts_at}" data-ends="${x.ends_at}" data-st="${x.status}">${timeText(x)}</span><br>Taps: ${x.clicks} (${x.people} people, ${x.groups_reached} groups)
      <form data-form="adrestart" class="row"><input type="hidden" name="id" value="${x.id}"><input name="minutes" type="number" min="1" value="60" aria-label="Minutes on show"><button class="btn alt">Restart</button></form>
      <div class="row wrap"><button class="btn alt" data-act="ad-stop" data-id="${x.id}">Stop</button><button class="btn del" data-act="ad-remove" data-id="${x.id}">Remove</button></div></div>`;
  }
  function adForm(n) {
    return html`<form data-form="adadd"><h3>Add to the queue</h3><input type="hidden" name="slot" value="${n}"><label>Bank or advertiser<input name="advertiser" required maxlength="100"></label>
      <label>Type<select name="type"><option value="text">Text</option><option value="voice">Text with voice</option><option value="video">Video</option></select></label>
      <label>Message<textarea name="body" rows="2" maxlength="500" required></textarea></label><label>Button text<input name="button_text" maxlength="40" placeholder="Learn more"></label>
      <label>Link (https only)<input name="link_url" placeholder="https://"></label><label>Video link (https only, for video)<input name="video_url" placeholder="https://"></label>
      <div class="row wrap"><label>Screen time (seconds)<input name="screen_seconds" type="number" min="3" max="120" value="8"></label><label>Overall time on show (minutes)<input name="total_minutes" type="number" min="1" value="60"></label><label>Start in (minutes)<input name="start_in_minutes" type="number" min="0" value="0"></label></div><button class="btn">Add</button></form>`;
  }
  routes.sponsors = function () {
    return api('GET', '/dev/ads').then(function (rows) {
      return html`<h2>Sponsor windows</h2><div class="note">Every group sees these on Home. Windows 1 and 2 always stay on screen and show an open-space note when empty. Window 3 is hidden from users unless a message is active. Each message has a screen time and an overall time on show, and only you see the timers.</div>
        ${[1, 2, 3].map(function (n) { var l = rows.filter(function (x) { return x.slot === n; }), live = l.some(function (x) { return x.status === 'Active'; });
          return html`<div class="card"><div class="row"><h3>${WIN[n]}</h3><b class="${live ? 'good' : 'bad'}">${live ? 'Active' : 'Inactive'}</b></div><div class="sub">${n === 3 ? 'Users cannot see this window while it is inactive.' : 'Stays on Home. Users see an open-space note while it is inactive.'}</div>${l.length ? l.map(adRow) : html`<p class="sub">Queue is empty.</p>`}${adForm(n)}</div>`; })}`;
    });
  };
  forms.adadd = function (fd) {
    var b = { slot: Number(fd.get('slot')), advertiser: fd.get('advertiser'), type: fd.get('type'), body: fd.get('body'), button_text: fd.get('button_text'), link_url: fd.get('link_url'), video_url: fd.get('video_url'), screen_seconds: Number(fd.get('screen_seconds')), total_minutes: Number(fd.get('total_minutes')), start_in_minutes: Number(fd.get('start_in_minutes')) };
    return api('POST', '/dev/ads', b).then(function () { toast('Added to the queue'); });
  };
  forms.adrestart = function (fd) { return api('POST', '/dev/ads/' + fd.get('id') + '/restart', { total_minutes: Number(fd.get('minutes')) }).then(function () { toast('Restarted. Timers reset.'); }); };
  acts['ad-stop'] = function (el) { return api('POST', '/dev/ads/' + el.dataset.id + '/stop', {}).then(function () { toast('Stopped and hidden from users'); }); };
  acts['ad-remove'] = function (el) { return api('POST', '/dev/ads/' + el.dataset.id + '/remove', {}).then(function () { toast('Removed'); }); };
  w.setInterval(function () {
    if (!w.document.querySelectorAll) return;
    [].forEach.call(w.document.querySelectorAll('[data-ends]'), function (el) {
      var now = Date.now(), s = Date.parse(el.getAttribute('data-starts')), e = Date.parse(el.getAttribute('data-ends')), st = el.getAttribute('data-st');
      if (st === 'Active') el.textContent = e > now ? 'drops off in ' + hms(e - now) : 'time is up';
      else if (st === 'Waiting') el.textContent = s > now ? 'starts in ' + hms(s - now) : 'starting now';
    });
  }, 1000);

  /* ---------- Groups and cloning ---------- */
  routes.groups = function () {
    return api('GET', '/dev/groups').then(function (gs) {
      var f = function (n, l, extra) { return html`<label>${l}<input name="${n}" ${extra || ''}></label>`; };
      return html`<h2>Groups</h2>${list(gs, function (x) { return html`<div class="card"><div class="row"><b>${x.name}</b><span class="pill">${x.code}</span></div><div class="sub">${x.town}, ${x.county} \u00b7 ${x.members} members \u00b7 ${x.status}</div>
        <form data-form="rename" class="row"><input type="hidden" name="id" value="${x.id}"><input name="name" value="${x.name}" required><button class="btn alt">Change name</button></form></div>`; })}
      <form class="card" data-form="clone"><h2>Clone the app for a new group</h2><p class="note">Only you can write or change a group name. The clone starts empty. Each group is independent.</p>
        ${f('name', 'Group name')}${f('county', 'County')}${f('town', 'City, town or village')}${f('postal', 'Postal address')}${f('street', 'Street address')}
        <label>Near to<select name="near_type"><option>Church</option><option>Mosque</option><option>School</option><option>Road</option><option>Market</option><option>Other</option></select></label>${f('near_name', 'Name of the place it is near')}${f('opposite', 'Opposite to')}
        <h3>Group leaders</h3>${f('chair_name', 'Chairperson name')}${f('chair_phone', 'Chairperson phone')}${f('sec_name', 'Secretary name')}${f('sec_phone', 'Secretary phone')}${f('treas_name', 'Treasurer name')}${f('treas_phone', 'Treasurer phone')}
        <div class="row wrap"><button class="btn" name="accept" value="1">Accept</button><button class="btn del" name="accept" value="0">Not accepted</button></div>
        <p class="note">Accept clones the app and texts each leader the app link. Not accepted texts each leader what is still needed.</p></form>
      ${S.last ? html`<div class="card"><b>${S.last}</b></div>` : ''}`;
    });
  };
  forms.rename = function (fd) { return api('PATCH', '/dev/groups/' + fd.get('id'), { name: fd.get('name') }).then(function () { toast('Group name changed'); }); };
  forms.clone = function (fd, submitter) {
    var v = function (k) { return fd.get(k); };
    var accept = submitter && submitter.value === '1';
    var body = { accept: accept, group: { name: v('name'), county: v('county'), town: v('town'), postal: v('postal'), street: v('street'), near_type: v('near_type'), near_name: v('near_name'), opposite: v('opposite') },
      leaders: { chair: { name: v('chair_name'), phone: v('chair_phone') }, sec: { name: v('sec_name'), phone: v('sec_phone') }, treas: { name: v('treas_name'), phone: v('treas_phone') } } };
    return api('POST', '/dev/groups/clone', body).then(function (r) {
      S.last = r.status === 'accepted' ? 'Accepted. Group code ' + r.code + '. 3 email sent.' : 'Not accepted. ' + r.sms_sent + ' email sent. Still missing: ' + (r.missing.join(', ') || 'nothing');
      toast(S.last);
    });
  };

  /* ---------- Inbox: leaders and developer only ---------- */
  routes.inbox = function () {
    return api('GET', '/dev/inbox').then(function (t) {
      return html`<h2>Leader inbox</h2><div class="note">A private channel with group leaders. Ordinary members never see it.</div>
      <form class="card" data-form="broadcast"><h3>Announce to all leaders</h3><textarea name="body" rows="2" required></textarea><button class="btn">Send to all groups</button></form>
      ${list(t, function (x) { return html`<div class="card"><div class="row"><b>${x.name}</b><span class="${x.unread ? 'warn' : 'sub'}">${x.unread ? x.unread + ' new' : 'No new messages'}</span></div><div class="sub">${x.last_message || 'No messages yet'}</div><a class="btn alt" href="#/thread/${x.group_id}">Open</a></div>`; })}`;
    });
  };
  routes.thread = function () {
    var gid = arg(2);
    return api('GET', '/dev/groups/' + gid + '/messages').then(function (m) {
      return html`<h2>Conversation</h2><a class="btn alt" href="#/inbox">\u2039 Inbox</a>${list(m, function (x) { return html`<div class="card"><div class="row"><b>${x.from_dev ? 'You' : x.author}</b><span class="pill">${x.topic}</span></div><div>${x.body}</div><div class="sub">${dt(x.created_at)}</div></div>`; })}
      <form class="card" data-form="reply"><input type="hidden" name="gid" value="${gid}"><label>Reply<textarea name="body" rows="3" required></textarea></label><button class="btn">Send to the leaders</button></form>`;
    });
  };
  forms.reply = function (fd) { return api('POST', '/dev/groups/' + fd.get('gid') + '/messages', { body: fd.get('body') }).then(function () { toast('Sent'); }); };
  forms.broadcast = function (fd) { return api('POST', '/dev/broadcast', { body: fd.get('body') }).then(function () { toast('Sent to the leaders of every group'); }); };

  /* ---------- Report vault ---------- */
  routes.reports = function () {
    return Promise.all([api('GET', '/dev/reports'), api('GET', '/dev/report-requests'), api('GET', '/dev/shares')]).then(function (r) {
      return html`<h2>Report Vault</h2><div class="note">Reports are made automatically for every finished month, quarter and year, then locked. Only you can open this page.</div>
      <form class="card" data-form="run"><h3>Make a report now</h3><div class="row wrap"><select name="type"><option>Monthly</option><option>Quarterly</option><option>Yearly</option></select><input name="period" placeholder="2026-09, 2026-Q3 or 2025" required></div><button class="btn">Make report</button></form>
      ${list(r[0], function (x) { return html`<div class="card row"><span><b>${x.type} \u00b7 ${x.label}</b><br><span class="sub">Made ${dt(x.generated_at)}</span></span><a class="btn" href="#/report/${x.id}">Open</a></div>`; }, 'No reports yet.')}
      <h2>Leader requests</h2>${list(r[1], function (q) { return html`<div class="card"><div class="row"><b>${q.group_name}</b><span class="${q.status === 'shared' ? 'good' : 'warn'}">${q.status}</span></div><div class="sub">Asked for ${q.type} ${q.label}</div>${q.status === 'pending' ? html`<button class="btn" data-act="rq-ok" data-id="${q.id}">Approve and share</button>` : ''}</div>`; }, 'No requests.')}
      <h2>Shared with sponsors</h2>${list(r[2], function (s) { return html`<div class="card"><div class="row"><b>${s.sponsor}</b><span class="${s.revoked ? 'bad' : 'good'}">${s.revoked ? 'Withdrawn' : 'Active'}</span></div><div class="sub">${s.purpose} \u00b7 ${s.scope === 'members' ? 'with consenting members' : 'group summary only'} \u00b7 expires ${dt(s.expires_at)}</div>${s.revoked ? '' : html`<button class="btn del" data-act="revoke" data-id="${s.id}">Withdraw link</button>`}</div>`; }, 'Nothing shared yet.')}`;
    });
  };
  forms.run = function (fd) { return api('POST', '/dev/reports/run', { type: fd.get('type'), period: fd.get('period') }).then(function (r) { toast(r.created ? 'Report made: ' + r.label : 'That report already exists and is locked.'); }); };
  acts['rq-ok'] = function (el) { return api('POST', '/dev/report-requests/' + el.dataset.id + '/approve', {}).then(function () { toast('Shared with the group leaders'); }); };
  acts.revoke = function (el) { return api('POST', '/dev/shares/' + el.dataset.id + '/revoke', {}).then(function () { toast('Link withdrawn'); }); };

  routes.report = function () {
    var id = arg(2);
    return api('GET', '/dev/reports/' + id).then(function (r) {
      var p = r.payload, cls = function (g) { return g.score >= 80 ? 'good' : g.score >= 60 ? 'warn' : 'bad'; };
      return html`<a class="btn alt" href="#/reports">\u2039 Report Vault</a><h2>${p.type} \u00b7 ${p.label}</h2><div class="note">Health = 35% collection + 30% on-time repayment + 10% loans not at risk, scaled to 100. Worked out by the server. Attendance and insurance are not counted yet.</div>
      <div class="scroll"><table class="tb"><tr><th>Group</th><th>Members</th><th>Score</th><th>Collected</th><th>At risk</th><th>Bank</th></tr>${p.groups.map(function (g) { return html`<tr><td>${g.name}</td><td>${g.members}</td><td class="${cls(g)}">${g.score} ${g.grade}</td><td>${g.collection_pct}%</td><td>${g.portfolio_at_risk_pct}%</td><td>${money(g.bank_balance)}</td></tr>`; })}</table></div>
      ${p.groups.map(function (g) { return html`<details class="card"><summary><b>${g.name}</b> \u00b7 <span class="${cls(g)}">${g.score} ${g.grade}</span></summary><div class="sub">Expected ${money(g.expected)} \u00b7 Collected ${money(g.collected)}<br>Loans issued ${money(g.loans_issued)} \u00b7 Balance ${money(g.loan_balance)}<br>On-time repayment ${g.on_time_repayment_pct}% \u00b7 At risk ${g.portfolio_at_risk_pct}%<br>Consent to share: ${g.share_consent ? 'Yes' : 'No, summary only'}</div><div class="note"><b>Sponsor fit:</b> ${g.sponsor_fit}</div>
        <div class="scroll"><table class="tb"><tr><th>Member</th><th>Role</th><th>Paid</th><th>Paid %</th><th>Loan balance</th><th>Loan</th><th>Score</th><th>Consent</th></tr>${g.member_rows.map(function (m) { return html`<tr><td>${m.name}</td><td>${m.role}</td><td>${money(m.paid)}</td><td>${m.coll_pct}%</td><td>${money(m.loan_balance)}</td><td>${m.loan_status}</td><td>${m.score}</td><td>${m.consent ? 'Yes' : 'No'}</td></tr>`; })}</table></div></details>`; })}
      <form class="card" data-form="share"><h3>Share with a sponsor</h3><input type="hidden" name="id" value="${id}"><label>Sponsor<input name="sponsor" required placeholder="e.g. Savannah Bank"></label>
        <label>Purpose<select name="purpose"><option>Grant</option><option>Group loan</option><option>Personal loans</option><option>Project sponsorship</option></select></label><label>What they see<select name="scope"><option value="summary">Group summary only</option><option value="members">Summary + members who agreed</option></select></label>
        <p class="sub">Groups to include</p>${p.groups.map(function (g) { return html`<label><input type="checkbox" name="g" value="${g.group_id}" checked> ${g.name}</label>`; })}
        <button class="btn">Create secure link</button><p class="note">The link expires in 30 days and can be withdrawn. A group that has not agreed is shared as summary only, and members who have not agreed never appear.</p></form>
      ${S.last ? html`<div class="card"><b>Link for the sponsor</b><p class="sub">${S.last}</p></div>` : ''}`;
    });
  };
  forms.share = function (fd) {
    var ids = fd.getAll('g').map(Number);
    return api('POST', '/dev/reports/' + fd.get('id') + '/share', { sponsor: fd.get('sponsor'), purpose: fd.get('purpose'), scope: fd.get('scope'), group_ids: ids }).then(function (r) {
      S.last = new URL('shared.html', w.location.href).href + '#' + r.token; toast('Secure link created');
    });
  };
  acts.signout = function () { P.signOutLocal(); S.user = null; w.location.hash = ''; showLogin(); };

  P.on(app, 'submit', 'form[data-form]', function (e, f) {
    e.preventDefault(); var fn = forms[f.dataset.form]; if (!fn) return; P.busy(f, true);
    Promise.resolve().then(function () { return fn(new FormData(f), e.submitter); }).then(function () { route(); }).catch(function (x) { toast(x.message, 1); P.busy(f, false); });
  });
  P.on(app, 'click', '[data-act]', function (e, b) {
    var fn = acts[b.dataset.act]; if (!fn) return; e.preventDefault(); b.disabled = true;
    Promise.resolve().then(function () { return fn(b); }).then(function () { if (b.dataset.act !== 'signout') route(); }).catch(function (x) { toast(x.message, 1); b.disabled = false; });
  });
  w.PAMOJA_DEV = { S: S, routes: routes, forms: forms, setUser: function (u) { S.user = u; } };
  boot();
})(window);
