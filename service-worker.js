// service-worker.js (copiar/pegar tal cual)
const CACHE_NAME = 'rpc-cache-v1';
const ASSETS = [
  './',               // permite navegación SPA desde subruta
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './service-worker.js'
];

// Instalación: precacheo
self.addEventListener('install', event => {
  self.skipWaiting(); // toma el control inmediatamente
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .catch(err => {
        console.warn('SW precache error:', err);
      })
  );
});

// Activación: limpiar caches viejos y reclamar clientes
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.map(key => (key !== CACHE_NAME) ? caches.delete(key) : null)
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first, luego red; guarda en cache respuestas válidas
self.addEventListener('fetch', event => {
  // solo GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Return cached response immediately
        return cachedResponse;
      }

      // No está en cache -> ir a red
      return fetch(event.request)
        .then(networkResponse => {
          // si la respuesta no es válida, se devuelve tal cual (no se cachea)
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
            return networkResponse;
          }

          // clone para guardar en cache
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              // intenta cachear la request (evita errores silenciosos)
              cache.put(event.request, responseClone).catch(err => {
                // algunas requests (cross-origin) pueden fallar al cachear; no es crítico
                // console.warn('No se pudo cachear:', event.request.url, err);
              });
            });

          return networkResponse;
        })
        .catch(() => {
          // Si falla la red, intento devolver index.html (SPA offline)
          return caches.match('./index.html');
        });
    })
  );
});

// Permite forzar skipWaiting desde la página:
// navigator.serviceWorker.controller.postMessage({type: 'SKIP_WAITING'})
self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
