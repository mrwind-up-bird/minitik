/**
 * Minitik Service Worker
 *
 * Caching strategies:
 *   - Static assets (JS/CSS/fonts/images): cache-first
 *   - API routes (/api/*): network-first with short-lived cache fallback
 *   - Navigation / HTML pages: stale-while-revalidate
 *
 * Background sync: queued actions are replayed when connectivity returns.
 * Push notifications: handles incoming push events and click routing.
 */

const CACHE_VERSION = "v1";
const STATIC_CACHE = `minitik-static-${CACHE_VERSION}`;
const API_CACHE = `minitik-api-${CACHE_VERSION}`;
const PAGE_CACHE = `minitik-pages-${CACHE_VERSION}`;

const STATIC_EXTENSIONS = [
  ".js",
  ".css",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".ico",
];

// Maximum age for API cache fallback responses (seconds)
const API_CACHE_MAX_AGE_S = 60;

// Sync tag used for background sync registration
const BACKGROUND_SYNC_TAG = "minitik-bg-sync";

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  // Activate immediately — do not wait for existing tabs to close
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll([
        "/",
        "/offline",
        "/manifest.json",
      ]).catch(() => {
        // Non-fatal: shell pages may not exist at install time
      })
    )
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      const keepCaches = new Set([STATIC_CACHE, API_CACHE, PAGE_CACHE]);
      return Promise.all(
        keys
          .filter((k) => !keepCaches.has(k))
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip non-GET methods (POST/PUT/DELETE handled by background sync)
  if (request.method !== "GET") return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API_CACHE, API_CACHE_MAX_AGE_S));
  } else {
    event.respondWith(staleWhileRevalidate(request, PAGE_CACHE));
  }
});

function isStaticAsset(url) {
  const ext = url.pathname.slice(url.pathname.lastIndexOf("."));
  return STATIC_EXTENSIONS.includes(ext) || url.pathname.startsWith("/_next/static/");
}

/** Cache-first: return cached response, fall back to network and cache result. */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineFallback(request);
  }
}

/** Network-first: try network, fall back to cached if recent enough. */
async function networkFirst(request, cacheName, maxAgeSeconds) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      const dateHeader = cached.headers.get("date");
      if (dateHeader) {
        const ageSeconds = (Date.now() - new Date(dateHeader).getTime()) / 1000;
        if (ageSeconds < maxAgeSeconds) return cached;
      } else {
        return cached;
      }
    }
    return offlineFallback(request);
  }
}

/** Stale-while-revalidate: return cache immediately, then update in background. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchAndUpdate = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  if (cached) {
    // Kick off revalidation in background without awaiting
    fetchAndUpdate;
    return cached;
  }

  return (await fetchAndUpdate) ?? offlineFallback(request);
}

async function offlineFallback(request) {
  if (request.headers.get("accept")?.includes("text/html")) {
    const cached = await caches.match("/offline");
    if (cached) return cached;
  }
  return new Response(JSON.stringify({ error: "offline" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Background Sync ──────────────────────────────────────────────────────────

self.addEventListener("sync", (event) => {
  if (event.tag === BACKGROUND_SYNC_TAG) {
    event.waitUntil(replayQueuedActions());
  }
});

async function replayQueuedActions() {
  const clients = await self.clients.matchAll({ type: "window" });
  // Notify all open tabs to trigger their sync logic
  for (const client of clients) {
    client.postMessage({ type: "SW_SYNC_READY" });
  }
}

// ─── Push Notifications ───────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Minitik", body: event.data.text() };
  }

  const {
    type = "default",
    title = "Minitik",
    body = "",
    url = "/",
    data = {},
  } = payload;

  const iconMap = {
    content_published: "/icons/icon-192.png",
    analytics_update: "/icons/icon-192.png",
    account_disconnected: "/icons/icon-192.png",
    schedule_reminder: "/icons/icon-192.png",
    default: "/icons/icon-192.png",
  };

  const badgeMap = {
    content_published: "/icons/badge-72.png",
    analytics_update: "/icons/badge-72.png",
    account_disconnected: "/icons/badge-72.png",
    schedule_reminder: "/icons/badge-72.png",
    default: "/icons/badge-72.png",
  };

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: iconMap[type] ?? iconMap.default,
      badge: badgeMap[type] ?? badgeMap.default,
      tag: `${type}-${Date.now()}`,
      data: { url, type, ...data },
      vibrate: [100, 50, 100],
      requireInteraction: type === "account_disconnected",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing tab at target URL if available
      for (const client of clients) {
        if (client.url === new URL(targetUrl, self.location.origin).href && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// ─── Message Handler ──────────────────────────────────────────────────────────

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "CACHE_BUST") {
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    );
  }
});
