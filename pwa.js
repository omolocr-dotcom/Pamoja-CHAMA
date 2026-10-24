/* Registers the offline service worker, offers "Install", and says when an update is ready. */
(function () {
  'use strict';
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var w = reg.installing; if (!w) return;
          w.addEventListener('statechange', function () {
            if (w.state === 'installed' && navigator.serviceWorker.controller) bar('A new version of PAMOJA is ready.', 'Update', function () { w.postMessage('SKIP_WAITING'); location.reload(); });
          });
        });
      }).catch(function () {});
    });
  }
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e;
    bar('Install PAMOJA on your phone for quick access.', 'Install', function () { deferred.prompt(); deferred.userChoice.then(function () { deferred = null; hide(); }); });
  });
  window.addEventListener('appinstalled', function () { hide(); });
  var el;
  function hide() { if (el) { el.remove(); el = null; } }
  function bar(text, label, fn) {
    hide(); el = document.createElement('div'); el.setAttribute('role', 'status'); el.className = 'toast';
    el.style.display = 'flex'; el.style.gap = '10px'; el.style.alignItems = 'center'; el.style.justifyContent = 'space-between';
    var s = document.createElement('span'); s.textContent = text;
    var b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.onclick = fn;
    var x = document.createElement('button'); x.className = 'btn alt'; x.textContent = '\u00d7'; x.setAttribute('aria-label', 'Dismiss'); x.onclick = hide;
    el.appendChild(s); el.appendChild(b); el.appendChild(x); document.body.appendChild(el);
  }
})();
