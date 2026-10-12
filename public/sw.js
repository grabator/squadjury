// Service worker: the app shell loads instantly on repeat visits.
// Static files are cache first; the API, images and share pages always go to the network.
const VERSION = 'sj-v3';
const SHELL = ['/', '/css/app.css?v=3', '/js/app.js?v=3', '/img/logo/logo.svg', '/img/logo/mark.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/u/') || url.pathname.startsWith('/t/')) return;
  // Page navigations: network first, so a new version shows up; the cached shell when offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/')));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit ||
      fetch(e.request).then((res) => {
        if (res.ok && /\.(js|css|woff2|svg|png|gz)$/.test(url.pathname)) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      }),
    ),
  );
});
