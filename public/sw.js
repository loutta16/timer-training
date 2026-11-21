// sw.js — Service worker: guarda los archivos para usar la app sin conexión.
// Al publicar cambios, subir VERSION para que los celulares descarguen lo nuevo.
const VERSION = 'tt-v0.3.0';

const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/timer.js',
  'js/secuencias.js',
  'js/audio.js',
  'js/storage.js',
  'js/presets.js',
  'fonts/archivo.woff2',
  'icons/icon.svg',
  'icons/favicon-32.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Primero la caché (rápido y offline); en segundo plano se actualiza desde la red.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const enCache = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' ? await cache.match('index.html') : undefined);

    const desdeRed = fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      })
      .catch(() => undefined);

    if (enCache) {
      e.waitUntil(desdeRed);
      return enCache;
    }
    return (await desdeRed) || new Response('Sin conexión', { status: 503 });
  })());
});
