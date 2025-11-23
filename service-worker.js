/* service-worker PRO - RecargasPaCuba
   - Precaching seguro
   - Runtime caching por tipo
   - Cache versioning y limpieza automática
   - SkipWaiting + clients.claim
   - Push handler (stub)
   - Safe fallbacks offline
*/

/* CACHE NAME - versión única por deploy usando timestamp para forzar actualización */
const CACHE_PREFIX = "rpc-pro-";
const CACHE_VERSION = Date.now().toString();
const PRECACHE = `${CACHE_PREFIX}static-${CACHE_VERSION}`;
const RUNTIME = `${CACHE_PREFIX}runtime-${CACHE_VERSION}`;

/* LISTA DE ASSETS A PRECACHEAR (essentials) */
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  // Logo para login (no tocar)
  "./icon-256.png",

  // App icons (asegúrate que existan en el repo)
  "./app-icon-96.png",
  "./app-icon-128.png",
  "./app-icon-144.png",
  "./app-icon-152.png",
  "./app-icon-192.png",
  "./app-icon-256.png",
  "./app-icon-384.png",
  "./app-icon-512.png",
  "./app-icon-1024.png",

  // archivos CSS/JS críticos que quieras precachear (ajusta si hace falta)
  // "./styles.css",
  // "./main.js",
];

/* LÍMITES y POLÍTICAS */
const IMAGE_CACHE_NAME = `${CACHE_PREFIX}images-${CACHE_VERSION}`;
const IMAGE_MAX_ENTRIES = 60;
const IMAGE_MAX_AGE = 60 * 24 * 60 * 60; // 60 days in seconds

const API_CACHE_NAME = `${CACHE_PREFIX}api-${CACHE_VERSION}`;
const STATIC_RUNTIME_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

/* UTIL - limpia entradas antiguas en caches específicos (por tamaño) */
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    // elimina los más antiguos
    const deleteCount = keys.length - maxItems;
    for (let i = 0; i < deleteCount; i++) {
      await cache.delete(keys[i]);
    }
  }
}

/* INSTALL - precache */
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" })));
    })
  );
});

/* ACTIVATE - limpia caches viejas y toma control inmediato */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (!key.startsWith(CACHE_PREFIX + "") || (key !== PRECACHE && key !== RUNTIME && !key.includes(CACHE_VERSION))) {
            // Para mayor seguridad borra caches que no coincidan con el prefijo o la versión actual
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );
      // reclamar clientes
      await self.clients.claim();
    })()
  );
});

/* FETCH - estrategia mixta */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorar requests a otros orígenes (excepto para imágenes externas si quieres)
  if (url.origin !== self.location.origin) {
    // Si es petición a CDN de imágenes o fuentes, puedes implementar reglas aquí
    // Por defecto dejamos pasar
    return;
  }

  // Navegación -> Network First (fallback cache)
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(req);
          const cache = await caches.open(RUNTIME);
          cache.put(req, networkResponse.clone());
          return networkResponse;
        } catch (err) {
          // fallback: index.html desde precache
          const cached = await caches.match("./index.html");
          return cached || new Response("Offline", { status: 503, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  // Imagenes -> Cache First with expiration
  if (req.destination === "image") {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const response = await fetch(req);
          // solo cachear respuestas ok
          if (response && response.status === 200) {
            cache.put(req, response.clone());
            // trimming en background
            trimCache(IMAGE_CACHE_NAME, IMAGE_MAX_ENTRIES);
          }
          return response;
        } catch (err) {
          // fallback a icono dentro del precache (icon-256.png)
          return caches.match("./icon-256.png");
        }
      })
    );
    return;
  }

  // API / JSON -> Network First (cache fallback)
  if (req.destination === "document" || req.headers.get("accept")?.includes("application/json") || url.pathname.startsWith("/api")) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(req);
          // guardar solo si ok
          if (response && response.status === 200) {
            const cache = await caches.open(API_CACHE_NAME);
            cache.put(req, response.clone());
          }
          return response;
        } catch (err) {
          const cached = await caches.match(req);
          return cached || new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "Content-Type": "application/json" } });
        }
      })()
    );
    return;
  }

  // CSS/JS/STATIC -> Stale-While-Revalidate
  if (req.destination === "style" || req.destination === "script" || req.destination === "font") {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const cached = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(req, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => null);
        return cached || (await fetchPromise) || new Response("", { status: 503 });
      })
    );
    return;
  }

  // Default: try cache then network
  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req).then((networkResponse) => {
        return caches.open(RUNTIME).then((cache) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(req, networkResponse.clone());
          }
          return networkResponse;
        });
      });
    })
  );
});

/* ESCUCHA mensajes desde la app (por ejemplo para forzar actualización) */
self.addEventListener("message", (event) => {
  if (!event.data) return;
  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data.type === "CLEAR_RUNTIME_CACHE") {
    caches.keys().then((keys) => {
      keys.forEach((k) => {
        if (k.startsWith(CACHE_PREFIX) && !k.includes(CACHE_VERSION)) {
          caches.delete(k);
        }
      });
    });
  }
});

/* PUSH - handler básico (necesitas servidor Push separado para usarlo) */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : { title: "RecargasPaCuba", body: "Tienes una nueva notificación" };
  } catch (e) {
    payload = { title: "RecargasPaCuba", body: event.data?.text() || "Tienes una nueva notificación" };
  }
  const title = payload.title || "RecargasPaCuba";
  const options = {
    body: payload.body || "",
    icon: "/app-icon-192.png",
    badge: "/app-icon-96.png",
    data: payload.data || {}
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* Notification click */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      if (clientList.length > 0) {
        const client = clientList[0];
        return client.focus();
      }
      return clients.openWindow("/");
    })
  );
});

/* Background sync basic stub (requires registration from app code) */
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-offline-queue") {
    event.waitUntil(
      // Aquí podrías procesar la cola offline
      Promise.resolve()
    );
  }
});

/* helper to log active caches (debug) */
async function debugCaches() {
  const keys = await caches.keys();
  console.log("Active caches:", keys);
}

/* Fin del service-worker PRO */
