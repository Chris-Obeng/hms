/* RoomLine service worker — plain, dependency-free.
 * Handles web push, notification clicks, offline fallback and light
 * static caching. Served from the root scope by definition.
 */

const VERSION = "v3";
const CACHE_STATIC = `rl-static-${VERSION}`;
const CACHE_IMAGES = `rl-images-${VERSION}`;
const CACHE_AVAILABILITY = `rl-availability-${VERSION}`;
const CACHE_NAVIGATION = `rl-navigation-${VERSION}`;
const OFFLINE_URL = "/offline";

const STATIC_ASSET = /\.(?:js|css|woff2?)$/i;
const IMAGE_ASSET = /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i;
// Only explicitly-public availability reads may be cached; authenticated API data is never cached.
const PUBLIC_AVAILABILITY = /^\/api\/booking\/[^/]+\/availability\/?$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAVIGATION).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([CACHE_STATIC, CACHE_IMAGES, CACHE_AVAILABILITY, CACHE_NAVIGATION]);
      const names = await caches.keys();
      await Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })()
  );
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

function isExpired(response, maxAgeSeconds) {
  if (!response) return true;
  const dateHeader = response.headers.get("date");
  if (!dateHeader || !maxAgeSeconds) return false;
  return (Date.now() - new Date(dateHeader).getTime()) / 1000 > maxAgeSeconds;
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
    trimCache(cacheName, 128);
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const cache = caches.open(cacheName).then((c) => c.put(request, response.clone()));
        trimCache(cacheName, 64);
        return response;
      }
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

async function networkFirst(request, cacheName, { timeoutMs = 0, maxAgeSeconds = 0 } = {}) {
  let timer;
  const timeout = timeoutMs
    ? new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      })
    : null;
  try {
    const response = timeout ? await Promise.race([fetch(request), timeout]) : await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
      trimCache(cacheName, 16);
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached && !isExpired(cached, maxAgeSeconds)) return cached;
    return cached || Response.error();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cachedNavigation = await caches.match(request);
          if (cachedNavigation) return cachedNavigation;
          const offline = await caches.match(OFFLINE_URL);
          return offline || Response.error();
        }
      })()
    );
    return;
  }

  if (PUBLIC_AVAILABILITY.test(url.pathname)) {
    event.respondWith(networkFirst(request, CACHE_AVAILABILITY, { timeoutMs: 10000, maxAgeSeconds: 120 }));
    return;
  }
  if (STATIC_ASSET.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_STATIC));
    return;
  }
  if (IMAGE_ASSET.test(url.pathname)) {
    event.respondWith(cacheFirst(request, CACHE_IMAGES));
  }
});

/* ── Web Push ─────────────────────────────────────────────────────── */

self.addEventListener("push", (event) => {
  if (!event.data) return;
  event.waitUntil((async () => {
    let data;
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
    await self.registration.showNotification(data.title || "RoomLine", {
      body: data.body || data.message || "New hotel notification",
      icon: data.icon || "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      tag: data.tag || data.notificationId || "roomline-notification",
      renotify: true,
      data: { url: data.url || "/dashboard", notificationId: data.notificationId },
    });
  })());
});

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

// Browsers expire push subscriptions silently; re-subscribe and sync the
// new credentials so delivery keeps working without user action.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    try {
      const configRes = await fetch("/api/push/subscriptions");
      if (!configRes.ok) return;
      const { applicationServerKey } = await configRes.json();
      if (!applicationServerKey) return;

      if (event.oldSubscription) {
        await fetch("/api/push/subscriptions", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: event.oldSubscription.endpoint }),
        });
      }

      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(applicationServerKey),
      });

      await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      }).then((saveRes) => {
        if (!saveRes.ok) throw new Error(`Subscription save failed: ${saveRes.status}`);
      });
    } catch {
      // Nothing actionable inside a SW; next app visit re-syncs via settings.
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/dashboard";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const client = clients.find((item) => "focus" in item);
    if (client) return client.focus().then(() => client.navigate(target));
    return self.clients.openWindow(target);
  }));
});
