// Canvas Companion service worker
// Bump this version any time app-shell files change, so old caches get replaced.
const CACHE_NAME = "canvas-companion-v2";

const APP_SHELL = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// Requests to these paths always need a live network round-trip (auth, sync,
// live Canvas data) — never serve them from cache while online.
const API_PATHS = ["/tasks", "/assignments", "/login", "/register", "/me", "/import", "/share", "/shared"];

function isApiRequest(pathname) {
  return API_PATHS.some(path => pathname === path || pathname.startsWith(path + "/"));
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (isApiRequest(url.pathname)) {
    // Network-first: fall back to a cached copy only if the network is down,
    // so a student can still see their last-synced assignments offline.
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App shell: cache-first so the page loads instantly and works offline.
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
