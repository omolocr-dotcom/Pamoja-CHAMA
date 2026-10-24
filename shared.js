/* Page a sponsor opens from the link the developer sends. Read-only. The server decides what the sponsor may see. */
(function (w) {
  'use strict';
  var P = w.PAMOJA, html = P.html, money = P.money, app = w.document.getElementById('app');
  var token = (w.location.hash || '').replace('#', '');
  function show(body) { P.render(app, html`<div class="app wide"><header class="hd"><div class="brand"><img class="logo" src="logo-96.png" alt=""><div><small>Shared report</small><h1>PAMOJA</h1></div></div></header><main>${body}</main></div>`); }
  if (!/^[a-f0-9]{48}$/.test(token)) return show(html`<div class="card bad">This link is not complete. Please ask for a new one.</div>`);
  P.api('GET', '/shared/' + token).then(function (r) {
    var p = r.report, cls = function (g) { return g.score >= 80 ? 'good' : g.score >= 60 ? 'warn' : 'bad'; };
    show(html`<h2>${p.type} \u00b7 ${p.label}</h2><div class="sub">Shared for: ${r.purpose}. This link stops working on ${new Date(r.expires_at).toLocaleDateString('en-GB')}.</div>
      ${p.groups.map(function (g) { return html`<div class="card"><div class="row"><h3>${g.name}</h3><b class="${cls(g)}">${g.score} ${g.grade}</b></div><div class="sub">${g.members} members \u00b7 Collected ${g.collection_pct}% \u00b7 On-time repayment ${g.on_time_repayment_pct}% \u00b7 Loans at risk ${g.portfolio_at_risk_pct}%<br>Loans issued ${money(g.loans_issued)} \u00b7 Balance ${money(g.loan_balance)} \u00b7 Bank ${money(g.bank_balance)}</div><div class="note">${g.sponsor_fit}</div>
        ${g.member_rows ? html`<div class="scroll"><table class="tb"><tr><th>Member</th><th>Role</th><th>Paid %</th><th>Loan balance</th><th>Loan</th><th>Score</th></tr>${g.member_rows.map(function (m) { return html`<tr><td>${m.name}</td><td>${m.role}</td><td>${m.coll_pct}%</td><td>${money(m.loan_balance)}</td><td>${m.loan_status}</td><td>${m.score}</td></tr>`; })}</table></div><div class="sub">${g.members_not_shown} member(s) did not agree to share their records.</div>` : html`<div class="sub">${g.members_note || 'Group figures only.'}</div>`}</div>`; })}`);
  }).catch(function (e) { show(html`<div class="card bad">${e.message}</div>`); });
})(window);
