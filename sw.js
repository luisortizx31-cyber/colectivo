/* Service worker: deja la app funcionando sin internet.
   IMPORTANTE: cada vez que cambies index.html, styles.css o app.js, sube el número de VERSION
   para que los teléfonos descarguen la versión nueva. */
const VERSION = 'colectivo-v2';
const ARCHIVOS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(ARCHIVOS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Responde al instante desde el caché y, si hay internet, lo actualiza por detrás.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(guardado => {
      const red = fetch(req)
        .then(res => {
          if (res.ok) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
          return res;
        })
        .catch(() => guardado);
      return guardado || red;
    })
  );
});
