// Keeps the board working with the network off — a theatre's wifi is not a
// dependency worth having. Network first, so a deploy is picked up on the next
// load; the cache answers only when the network does not.

const CACHE = 'soundboard-v1';

const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/engine.js',
  './js/library.js',
  './js/model.js',
  './js/store.js',
  './js/editor.js',
  './js/ui.js',
  './js/gels.js',
  './icon.svg',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  );
});
