/* PAMOJA service worker: the member app opens and reads offline. Bump VERSION on every release.
   It never saves the developer console, and it never saves or replays payments or any other write. */
const VERSION = 'pamoja-v5';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const BASE = self.registration.scope;
const u = (p) => new URL(p, BASE).href;
const PRECACHE = ['./', 'index.html', 'client.html', 'style.css', 'config.js', 'common.js', 'client.js', 'pwa.js', 'manifest.json',
  'logo.png', 'logo-96.png', 'favicon-32.png', 'icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png'].map(u);
const NEVER = ['developer.html', 'developer.js', 'shared.html', 'shared.js'].map(u);

self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE))); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'CLEAR_API') e.waitUntil(caches.delete(RUNTIME)); // when someone signs out, forget their saved group data
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER.some((n) => url.href.split('#')[0].split('?')[0] === n)) return;

  if (url.pathname.includes('/api/')) {
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const c = res.clone(); caches.open(RUNTIME).then((x) => x.put(req, c)); } return res; })
      .catch(() => caches.match(req).then((hit) => hit || new Response(JSON.stringify({ error: 'You are offline.' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { const c = res.clone(); caches.open(SHELL).then((x) => x.put(req, c)); return res; }).catch(() => caches.match(req).then((hit) => hit || caches.match(u('client.html')))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => {
    const fresh = fetch(req).then((res) => { if (res.ok) { const c = res.clone(); caches.open(SHELL).then((x) => x.put(req, c)); } return res; }).catch(() => hit);
    return hit || fresh;
  }));
});
