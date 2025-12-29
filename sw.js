// TrackerID service worker (app shell cache)
const CACHE = "trackerid-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./parks.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k))));
    self.clients.claim();
  })());
});

// Stale-while-revalidate for same-origin GET
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then((res) => {
      // cache successful responses
      if (res && res.status === 200) cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    // Prefer cached, update in background
    if (cached) {
      event.waitUntil(fetchPromise);
      return cached;
    }

    const net = await fetchPromise;
    return net || new Response("Offline", { status: 503, statusText: "Offline" });
  })());
});
