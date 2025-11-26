/* SERVICE WORKER CORREGIDO PARA QUE EL PANEL ADMIN SIEMPRE CARGUE FRESCO
   - EXCLUYE /admin/ DEL CACHE
   - NO GUARDA HTML DEL ADMIN
   - ACTUALIZA SIEMPRE DASHBOARD
*/

const CACHE_PREFIX = "rpc-pro-";
const CACHE_VERSION = Date.now().toString();
const PRECACHE = `${CACHE_PREFIX}static-${CACHE_VERSION}`;
const RUNTIME = `${CACHE_PREFIX}runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-256.png",
  "./app-icon-96.png",
  "./app-icon-128.png",
  "./app-icon-144.png",
  "./app-icon-152.png",
  "./app-icon-192.png",
  "./app-icon-256.png",
  "./app-icon-384.png",
  "./app-icon-512.png",
  "./app-icon-1024.png"
];

// 🚫 NO CACHEAR NADA DEL PANEL ADMIN
function isAdminRequest(url) {
  return url.pathname.startsWith("/admin/");
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PRECACHE).then((cache) =>
      cache.addAll(PRECACHE_URLS.map((u) => new Request(u, { cache: "reload" })))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (!key.includes(CACHE_VERSION)) {
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ❗ 1. NO CACHEAR /admin/*
  if (isAdminRequest(url)) {
    return event.respondWith(fetch(req)); // SIEMPRE desde la red
  }

  // ❗ 2. NAVEGACIÓN DE LA APP (NO ADMIN)
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(req);
          const cache = await caches.open(RUNTIME);
          cache.put(req, net.clone());
          return net;
        } catch (e) {
          const cached = await caches.match("./index.html");
          return cached;
        }
      })()
    );
    return;
  }

  // ❗ 3. ASSETS COMUNES
  event.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req).then((network) => {
          if (network && network.status === 200) {
            caches.open(RUNTIME).then((cache) => cache.put(req, network.clone()));
          }
          return network;
        })
      );
    })
  );
});
