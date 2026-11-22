/**
 * Service worker: guarda los archivos de la app para que abra SIN internet.
 * Con internet: siempre trae la versión más nueva (y la guarda).
 * Sin internet: usa la copia guardada.
 * Al publicar una fase nueva, cambie VERSION y agregue los archivos nuevos a ARCHIVOS.
 */
const VERSION = 'ferreteria-v3.0.0';
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/config.js',
  './js/db.js',
  './js/api.js',
  './js/sesion.js',
  './js/sync.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'actualizar') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // Solo archivos de la app (la API de Google no pasa por aquí)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch(req, { signal: ctrl.signal, cache: 'no-cache' });
      clearTimeout(t);
      if (resp.ok) cache.put(req, resp.clone());
      return resp;
    } catch (err) {
      const guardado = await cache.match(req, { ignoreSearch: true }) ||
        (req.mode === 'navigate' ? await cache.match('./index.html') : null);
      if (guardado) return guardado;
      return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
