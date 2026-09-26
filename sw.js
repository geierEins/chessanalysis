// Minimal service worker - exists only to satisfy the browser's PWA
// "installable" criteria (a registered SW with a fetch handler). It does NOT
// cache anything: this app pulls live data from the Chess.com API and needs
// its (large) Stockfish engine files fetched fresh, so offline caching would
// do more harm than good here.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
