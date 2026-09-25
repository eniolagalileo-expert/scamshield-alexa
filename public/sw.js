// Keeps the app shell available offline so ScamShield opens even on a bad connection.
// Checks themselves always need the network; messages are never cached.
const SHELL = "scamshield-shell-v1";
const FILES = ["/", "/site.css", "/site.js", "/mcp-client.js", "/icons/shield.svg", "/icons/icon-192.png", "/privacy.html", "/terms.html"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/mcp")) return;
  // Network first, so updates show up right away; fall back to the cached shell when offline.
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("/"))));
});
