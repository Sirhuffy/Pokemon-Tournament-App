/* Pokemon Tournament Companion — service worker
   Versioned cache: bump CACHE_VERSION to force clients to refresh. */

const CACHE_VERSION = "ptc-v2";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./data/tournament-rules.json",
  "./data/pokemon-core.json",
  "./data/moves.json",
  "./data/learnsets.json",
  "./data/encounters.json",
  "./data/natures.json",
  "./data/items.json",
  "./data/machines.json"
];

// Install: precache the shell + data so the app is fully usable offline.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // addAll fails the install if any single file 404s; use individual
      // adds so optional/empty files don't break the install.
      return Promise.all(
        CORE_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn("[SW] skipping", url, err.message))
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate: drop any old cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for HTML/JSON (so updates show up), cache-first
// for everything else (CSS/JS/images).
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // pass through cross-origin

  const isDynamic = req.destination === "document" || url.pathname.endsWith(".json");

  if (isDynamic) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match("./index.html")))
    );
  } else {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        return res;
      }))
    );
  }
});
