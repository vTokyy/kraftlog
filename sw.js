/* ===== Kraftlog — Service Worker =====
 * Cacht die komplette App beim ersten Besuch → danach läuft sie vollständig offline,
 * auch wenn der Hosting-Server nicht erreichbar ist.
 * VERSION wird von build.py (--bump) synchron zu den ?v=N-Einbindungen gehalten:
 * neue Version → neuer Cache → alte Caches werden beim Aktivieren gelöscht.
 */
const VERSION = '27';
const CACHE = 'kraftlog-v' + VERSION;
const DATEIEN = [
  './',
  './index.html',
  './style.css?v=' + VERSION,
  './exercises.js?v=' + VERSION,
  './icons.js?v=' + VERSION,
  './coach.js?v=' + VERSION,
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

/* Pausen-Push: der Worker sendet Declarative-Web-Push-Nachrichten (web_push: 8030).
 * Ab iOS 18.4 zeigt Safari die Meldung direkt aus dem Payload an, ohne diesen
 * Handler zu wecken — er bleibt als Fallback für ältere Geräte (iOS 16.4–18.3)
 * und zeigt dann den mitgeschickten Inhalt an.
 * (iOS verlangt, dass jeder Push eine sichtbare Benachrichtigung erzeugt.) */
self.addEventListener('push', e => {
  let titel = 'Pause vorbei';
  let text = 'Weiter geht’s mit dem nächsten Satz.';
  try {
    const d = e.data ? e.data.json() : null;
    if (d && d.notification) {
      if (d.notification.title) titel = d.notification.title;
      if (d.notification.body) text = d.notification.body;
    }
  } catch (_) { /* payloadlos oder kein JSON: Standardtext */ }
  e.waitUntil(self.registration.showNotification(titel, {
    body: text,
    tag: 'kraftlog-pause'
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(liste => {
    if (liste.length) return liste[0].focus();
    return clients.openWindow('./');
  }));
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
