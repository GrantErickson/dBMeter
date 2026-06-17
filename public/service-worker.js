// Bump this whenever the precache list or strategy changes — the activate
// handler deletes every cache that doesn't match, which is how clients pick
// up a new deploy.
const CACHE_NAME = "dbmeter-v2";

// App shell. Only files that actually exist in the production build belong
// here — Vite bundles src/* into hashed /assets/* files, so the raw source
// paths must NOT be precached (cache.addAll rejects the whole batch on a
// single 404). Hashed assets are picked up at runtime by the fetch handler.
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.svg",
  "/icons/icon.svg",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // allSettled (not addAll) so one missing optional asset can't abort the
      // whole install. Request with cache:"reload" to dodge the HTTP cache.
      Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })),
        ),
      ).then(() => self.skipWaiting()),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GETs; let the browser deal with everything else
  // (POSTs, cross-origin CDN/analytics, etc.).
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Navigations: network-first so a fresh deploy is seen immediately, with the
  // cached app shell as the offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/index.html")),
        ),
    );
    return;
  }

  // Static assets (hashed JS/CSS, icons, fonts): cache-first, then fill the
  // cache on the way back from the network.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
