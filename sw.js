/* Service worker: la app funciona sin conexión.
   Cambia VERSION al publicar cambios para que el iPhone descargue la nueva versión. */
const VERSION = 'cf-v4';
const ASSETS = [
  './', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'icons/logo.svg', 'icons/icon-32.png', 'icons/icon-120.png', 'icons/icon-152.png',
  'icons/icon-167.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Primero internet (así siempre tienes la última versión) y, si no hay conexión, la copia guardada */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(cache =>
      fetch(req)
        .then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(async () => (await cache.match(req, { ignoreSearch: true })) ||
          (req.mode === 'navigate' ? cache.match('index.html') : Response.error()))
    )
  );
});
