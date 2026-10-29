// Service worker: aplikacija radi i bez mreže (zadnja učitana verzija), podaci uvijek prvo sa mreže.
const V = 'fm-v19';
const VIEWS = ['pregled', 'tim', 'kapiten', 'transferi', 'raspored', 'uzivo', 'rival', 'liga', 'karijera', 'trofeji', 'vodic', 'kutak'].map((v) => '/js/views/' + v + '.js');
const SHELL = ['/', '/css/app.css', '/js/boot.js', '/js/app.js', '/js/api.js', '/js/model.js', '/js/state.js', '/js/ui.js', '/js/dd.js', '/js/i18n.js', '/img/brand/mark.svg', '/img/wave-1.svg', '/img/wave-2.svg', '/img/shard.svg', ...VIEWS, '/fonts/manrope-latin.woff2', '/fonts/barlow-condensed-800.woff2'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // SquadJury (/jury, njegov API i linkovi za dijeljenje) ima svoj service worker
  if (/^\/(jury|t|r|l|u|embed)(\/|$)/.test(u.pathname) || (u.pathname.startsWith('/api/') && !/^\/api\/(bootstrap|fixtures|entry|live|league|element|team)(\/|$)/.test(u.pathname))) return;
  if (u.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match('/'))));
});
