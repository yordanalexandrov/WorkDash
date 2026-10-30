// Service worker for the installed dashboard (PWA): keeps the app shell available and handles notification clicks.
// Data (/api/*) is never cached: the dashboard must show what the server knows now.

const CACHE = "workdash-shell-v1";
const SHELL = ["/", "/style.css", "/app.js", "/manifest.webmanifest", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Network first, so a rebuilt dashboard shows up on the next load; the cache is only a fallback.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? Response.error())),
  );
});

// A notification may carry `data.url` (e.g. the PR) to open; otherwise focus the dashboard window or open one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      if (target) return self.clients.openWindow(target);
      const dashboard = windows.find((client) => new URL(client.url).origin === self.location.origin);
      return dashboard ? dashboard.focus() : self.clients.openWindow("/");
    }),
  );
});
