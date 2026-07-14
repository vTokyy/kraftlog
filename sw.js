/* ===== Kraftlog — Service Worker =====
 * Cacht die komplette App beim ersten Besuch → danach läuft sie vollständig offline,
 * auch wenn der Hosting-Server nicht erreichbar ist.
 * VERSION wird von build.py (--bump) synchron zu den ?v=N-Einbindungen gehalten:
 * neue Version → neuer Cache → alte Caches werden beim Aktivieren gelöscht.
 */
const VERSION = '9';
const CACHE = 'kraftlog-v' + VERSION;
const DATEIEN = [
  './',
  './index.html',
  './style.css?v=' + VERSION,
  './exercises.js?v=' + VERSION,
  './icons.js?v=' + VERSION,
  './charts.js?v=' + VERSION,
  './timer.js?v=' + VERSION,
  './app.js?v=' + VERSION,
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(DATEIEN))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(treffer => {
      if (treffer) return treffer;
      return fetch(e.request).catch(() => {
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        throw new Error('offline und nicht im Cache: ' + e.request.url);
      });
    })
  );
});
