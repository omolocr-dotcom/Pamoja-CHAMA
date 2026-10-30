/* Shared helpers for the member app, the developer console and the sponsor page.
   Nothing here decides who may do what, scores a group or approves a loan: the server does all of that. */
(function (w) {
  'use strict';
  var cfg = w.PAMOJA_CONFIG || {};
  function Safe(s) { this.s = s; }
  Safe.prototype.toString = function () { return this.s; };
  var MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return MAP[c]; }); }
  function out(v) { return Array.isArray(v) ? v.map(out).join('') : v instanceof Safe ? v.s : esc(v); }
  /* html`...` escapes every inserted value, so a name or notice can never inject code. Use raw() only for our own markup. */
  function html(st) { var v = [].slice.call(arguments, 1), r = ''; for (var i = 0; i < st.length; i++) r += st[i] + (i < v.length ? out(v[i]) : ''); return new Safe(r); }
  function render(el, safe) { el.innerHTML = String(safe); }
  var store = {
    get: function (k) { try { return w.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { w.localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { w.localStorage.removeItem(k); } catch (e) {} }
  };
  function money(n) { return 'KES ' + Number(n || 0).toLocaleString('en-US'); }
  function dt(s) { return s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: 'numeric' }) : ''; }

  function api(method, path, body) {
    if (/PLACEHOLDER/.test(cfg.API_BASE || '')) return Promise.reject(new Error('The server address is not set yet. Open config.js and set API_BASE.'));
    var t = store.get('pamoja_token');
    var headers = { 'Content-Type': 'application/json' };
    if (t) headers.Authorization = 'Bearer ' + t;
    return fetch((cfg.API_BASE || '') + '/api' + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .catch(function () { throw new Error('No connection. Check your internet and try again.'); })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (j) {
          if (res.status === 401 && t) { signOutLocal(); w.dispatchEvent(new Event('pamoja:signedout')); }
          if (!res.ok) throw new Error((j && j.error) || 'Something went wrong');
          return j;
        });
      });
  }
  function signOutLocal() {
    store.del('pamoja_token'); store.del('pamoja_gid');
    try { if (w.navigator.serviceWorker && w.navigator.serviceWorker.controller) w.navigator.serviceWorker.controller.postMessage('CLEAR_API'); } catch (e) {}
  }

  var toastEl;
  function toast(msg, isErr) {
    if (!w.document) return;
    if (!toastEl) { toastEl = w.document.createElement('div'); toastEl.setAttribute('role', 'status'); w.document.body.appendChild(toastEl); }
    toastEl.className = 'toast' + (isErr ? ' err' : ''); toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.hidden = true; }, 4000);
  }
  function busy(form, on) { [].forEach.call(form.querySelectorAll('button'), function (b) { b.disabled = on; }); }
  function on(root, type, sel, fn) { root.addEventListener(type, function (e) { var t = e.target.closest ? e.target.closest(sel) : null; if (t && root.contains(t)) fn(e, t); }); }

  function navBar() {
    return html`<div class="navb"><button type="button" data-nav="back">\u2039 Back</button><button type="button" data-nav="home">Home</button><button type="button" data-nav="fwd">Forward \u203a</button></div>`;
  }
  if (w.document) w.document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-nav]'); if (!b) return;
    var k = b.getAttribute('data-nav');
    if (k === 'back') w.history.back(); else if (k === 'fwd') w.history.forward(); else w.location.hash = '#/home';
  });

  /* Sign in with an email address and a 6-digit email code. opts: {title, hint, onSuccess(res)} */
  function loginView(root, opts) {
    var email = '';
    function step1() {
      render(root, html`<div class="login card"><img class="logo big" src="logo.png" alt="PAMOJA logo"><h1>${opts.title}</h1><p class="sub">${opts.hint}</p><form id="f1"><label for="em">Email address</label><input id="em" name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" maxlength="254" required><button class="btn">Send me a code</button></form></div>`);
      root.querySelector('#f1').onsubmit = function (e) {
        e.preventDefault(); email = String(new FormData(e.target).get('email') || '').trim().toLowerCase(); busy(e.target, true);
        api('POST', '/auth/request-otp', { email: email }).then(step2).catch(function (x) { toast(x.message, 1); busy(e.target, false); });
      };
    }
    function step2() {
      render(root, html`<div class="login card"><h1>Enter your code</h1><p class="sub">We sent a 6-digit code to ${email}. It works for 5 minutes.</p><form id="f2"><label for="cd">Code</label><input id="cd" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required><button class="btn">Sign in</button> <button class="btn alt" type="button" id="back">Change email</button></form></div>`);
      root.querySelector('#back').onclick = step1;
      root.querySelector('#f2').onsubmit = function (e) {
        e.preventDefault(); busy(e.target, true);
        api('POST', '/auth/verify', { email: email, code: new FormData(e.target).get('code') })
          .then(function (res) { store.set('pamoja_token', res.token); opts.onSuccess(res); })
          .catch(function (x) { toast(x.message, 1); busy(e.target, false); });
      };
    }
    step1();
  }
  w.PAMOJA = { api: api, html: html, raw: function (s) { return new Safe(s); }, esc: esc, render: render, store: store, money: money, dt: dt, toast: toast, busy: busy, on: on, navBar: navBar, loginView: loginView, signOutLocal: signOutLocal, Safe: Safe, cfg: cfg };
})(window);
