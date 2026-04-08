const CACHE_NAME = "notty-v1";

// Static assets to precache on install
const PRECACHE = ["/", "/icon512_rounded.png", "/icon512_maskable.png"];

self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE)));
    self.skipWaiting();
});

self.addEventListener("activate", (e) => {
    // Evict old caches
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (e) => {
    const url = new URL(e.request.url);

    // API + WebSocket requests: network only, never cache
    if (url.pathname.startsWith("/api/") || e.request.headers.get("upgrade") === "websocket") {
        return;
    }

    // Fonts: cache-first (they never change)
    if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
        e.respondWith(
            caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
                return res;
            }))
        );
        return;
    }

    // Static assets: stale-while-revalidate
    // Serve from cache immediately, update cache in background
    e.respondWith(
        caches.match(e.request).then((cached) => {
            const fetchPromise = fetch(e.request).then((res) => {
                if (res.ok) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
                }
                return res;
            }).catch(() => {
                if (e.request.mode === "navigate") {
                    return caches.match("/");
                }
                return new Response("", { status: 503, statusText: "Offline" });
            });

            return cached || fetchPromise;
        })
    );
});
