// Service worker: the app shell loads instantly on repeat visits.
// Our JS and CSS are network first, fonts and images cache first; the API and share pages always go to the network.
const VERSION = 'sj-v23';
const SHELL = ['/jury/', '/jury/css/app.css?v=13', '/jury/js/app.js?v=13', '/jury/img/logo/logo.svg', '/jury/img/logo/mark.svg', '/jury/img/logo/logo-white.svg', '/jury/fonts/archivo-latin-var.woff2', '/jury/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/u/') || url.pathname.startsWith('/t/') || url.pathname.startsWith('/r/') || url.pathname.startsWith('/l/') || url.pathname.startsWith('/embed/')) return;
  // Page navigations: network first, so a new version shows up; the cached shell when offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/jury/')));
    return;
  }
  // Our own code (JS and CSS): network first, so every file comes from the same deploy.
  // Cache first here once mixed an old i18n.js with a new intro.js after a deploy.
  if (/\.(js|css)$/.test(url.pathname) && !url.pathname.startsWith('/jury/vendor/')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
          return res;
        })
        .catch(() => caches.match(e.request)),
    );
    return;
  }
  // Fonts, images and the OCR engine never change under the same name: cache first.
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit ||
      fetch(e.request).then((res) => {
        if (res.ok && /\.(woff2|svg|png|gz|js)$/.test(url.pathname)) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      }),
    ),
  );
});
