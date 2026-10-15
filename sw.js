// Keeps the board working with the network off — a theatre's wifi is not a
// dependency worth having. Network first, so a deploy is picked up on the next
// load; the cache answers when the network does not, or is too slow to wait for.

const CACHE = 'soundboard-v3';

// How long the board waits on the network before it takes its own copy. Weak
// wifi that neither answers nor fails would otherwise hold up every load.
// Once it has been that slow, the copy answers at once for a while, so a page
// that needs a dozen files does not wait out the patience a dozen times.
const PATIENCE = 3000;
const SLOW_SPELL = 30000;
let slowUntil = 0;

const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './css/fonts.css',
  './fonts/ibm-plex-sans-latin.woff2',
  './fonts/ibm-plex-sans-condensed-400-latin.woff2',
  './fonts/ibm-plex-sans-condensed-600-latin.woff2',
  './fonts/ibm-plex-sans-condensed-700-latin.woff2',
  './fonts/ibm-plex-mono-400-latin.woff2',
  './fonts/ibm-plex-mono-500-latin.woff2',
  './fonts/ibm-plex-sans-latin-ext.woff2',
  './fonts/ibm-plex-sans-condensed-400-latin-ext.woff2',
  './fonts/ibm-plex-sans-condensed-600-latin-ext.woff2',
  './fonts/ibm-plex-sans-condensed-700-latin-ext.woff2',
  './fonts/ibm-plex-mono-400-latin-ext.woff2',
  './fonts/ibm-plex-mono-500-latin-ext.woff2',
  './js/app.js',
  './js/engine.js',
  './js/library.js',
  './js/model.js',
  './js/store.js',
  './js/editor.js',
  './js/ui.js',
  './js/gels.js',
  './js/bundled.js',
  './sounds/gunshot.mp3',
  './sounds/crickets ambiance.wav',
  './sounds/sexy.mp3',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // Straight from the server: a copy the HTTP cache kept from an older
      // deploy is not one to keep for the next show.
      .then((c) => c.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
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
  e.respondWith(answer(req));
});

async function answer(req) {
  // Revalidate rather than trust the HTTP cache: a stale module next to a
  // fresh one is how a deploy breaks an app that was working a minute ago.
  const asked = Date.now();
  const network = fetch(new Request(req, { cache: 'no-cache' })).then((res) => {
    if (Date.now() - asked < PATIENCE) slowUntil = 0;   // the wifi is back
    // Only a whole, good answer from this site replaces the copy: an error
    // page or a café's login page kept in its place would be what the board
    // loads offline.
    if (res.status === 200 && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  });

  const patience = Date.now() < slowUntil ? 0 : PATIENCE;
  const slow = new Promise((resolve) => setTimeout(resolve, patience, 'slow'));
  const first = await Promise.race([network.catch(() => null), slow]);
  if (first === 'slow' && patience) slowUntil = Date.now() + SLOW_SPELL;
  if (first instanceof Response && first.ok) return first;

  // The network failed, answered with an error, or is taking too long: the
  // copy, if there is one. With none, the network's answer is all there is.
  const kept = await caches.match(req);
  if (kept) return kept;
  if (first instanceof Response) return first;
  if (first === 'slow') {
    try {
      return await network;
    } catch {
      /* failed after all */
    }
  }
  // A page the board does not know still opens the board; anything else
  // (a module, a sound) fails as itself rather than as a page of HTML.
  if (req.mode === 'navigate') {
    const page = await caches.match('./index.html');
    if (page) return page;
  }
  return Response.error();
}
