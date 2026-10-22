const CACHE_NAME = "caderneta-shell-v6";
const APP_SHELL = ["/", "/index.html", "/app-config.js", "/api-bridge.js", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("caderneta-shell-") && key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  if (request.destination === "image" && url.protocol === "https:" && url.origin !== self.location.origin) {
    event.respondWith(fetch(request).then(response => {
      if (response.ok || response.type === "opaque") {
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone())));
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || Response.error())));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put("/index.html", copy));
      return response;
    }).catch(() => caches.match("/index.html")));
    return;
  }
  event.respondWith(fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request)));
});
