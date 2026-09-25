// Keeps the app shell available offline so ScamShield opens even on a bad connection.
// Checks themselves always need the network; messages are never cached.
const SHELL = "scamshield-shell-v2";
const FILES = ["/", "/site.css", "/site.js", "/mcp-client.js", "/icons/shield.svg", "/icons/icon-192.png", "/privacy.html", "/terms.html"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== "scamshield-share").map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
// Shared from the phone's share menu: text goes to /?text=..., a screenshot is kept (only on this
// device) for the page to read, then deleted.
async function receiveShare(request) {
  const form = await request.formData();
  const image = form.get("image");
  if (image && image.size) {
    const cache = await caches.open("scamshield-share");
    await cache.put("/shared-image", new Response(image, { headers: { "Content-Type": image.type || "image/png" } }));
    return Response.redirect("/?image=1", 303);
  }
  const text = ["title", "text", "url"].map((k) => form.get(k)).filter(Boolean).join(" ").slice(0, 4000);
  return Response.redirect(text ? `/?text=${encodeURIComponent(text)}` : "/", 303);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === "POST" && url.origin === location.origin && url.pathname === "/share") {
    return e.respondWith(receiveShare(e.request).catch(() => Response.redirect("/", 303)));
  }
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/mcp")) return;
  // Network first, so updates show up right away; fall back to the cached shell when offline.
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("/"))));
});
