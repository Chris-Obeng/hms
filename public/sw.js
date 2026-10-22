/* RoomLine service worker — plain, dependency-free.
 * Handles web push, notification clicks, offline fallback and light
 * static caching. Served from the root scope by definition.
 */

const VERSION = "v6";
const CACHE_STATIC = `rl-static-${VERSION}`;
const CACHE_IMAGES = `rl-images-${VERSION}`;
const CACHE_AVAILABILITY = `rl-availability-${VERSION}`;
const CACHE_NAVIGATION = `rl-navigation-${VERSION}`;
const OFFLINE_URL = "/offline";
const NETWORK_TIMEOUT_MS = 8000;
const CACHED_AT_HEADER = "x-roomline-cached-at";
const ROOMLINE_CACHE = /^rl-(?:static|images|availability|navigation)-v\d+$/;
const IS_LOCAL_DEVELOPMENT = /^(?:localhost|127\.0\.0\.1|\[::1\])$/i.test(
  new URL(self.location.origin).hostname
);

const STATIC_ASSET = /\.(?:m?js|css|woff2?|ttf|otf|eot)$/i;
const IMAGE_ASSET = /\.(?:png|jpe?g|svg|gif|webp|avif|ico)$/i;
const AUDIO_ASSET = /\.(?:mp3|wav|ogg|m4a|aac|flac)$/i;
const NON_DOCUMENT_ASSET = /\.(?:json|webmanifest|txt|xml|map|pdf|mp4|webm)$/i;
// Only explicitly-public availability reads may be cached; authenticated API data is never cached.
const PUBLIC_AVAILABILITY = /^\/api\/booking\/[^/]+\/availability\/?$/;
const cacheWrites = new Map();

function isOfflineResponse(response) {
  return Boolean(
    response?.ok &&
    !response.redirected &&
    /^text\/html(?:\s*;|$)/i.test(response.headers.get("content-type") || "") &&
    response.headers.get("x-roomline-offline") === "1"
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const request = new Request(OFFLINE_URL, {
        credentials: "omit",
        cache: "reload",
        redirect: "error",
      });
      const response = await fetchWithTimeout(request);
      if (!isOfflineResponse(response)) throw new Error("Invalid RoomLine offline document");

      // Do not replace the previous offline document or activate until a fresh,
      // public, standalone HTML response has been fetched and stored successfully.
      const cache = await caches.open(CACHE_NAVIGATION);
      await cache.put(OFFLINE_URL, response);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([CACHE_STATIC, CACHE_IMAGES, CACHE_AVAILABILITY, CACHE_NAVIGATION]);
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => ROOMLINE_CACHE.test(name) && !keep.has(name)).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

async function fetchWithTimeout(request, timeoutMs = NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("RoomLine network timeout"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([fetch(request, { signal: controller.signal }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function readCache(cacheName, request) {
  try {
    const cache = await caches.open(cacheName);
    return await cache.match(request);
  } catch {
    // Storage may be unavailable; a cache failure must not block the network.
    return undefined;
  }
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

function isExpired(response, maxAgeSeconds) {
  if (!response || !Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0) return true;
  const cachedAt = response.headers.get(CACHED_AT_HEADER);
  const timestamp = cachedAt === null
    ? Date.parse(response.headers.get("date") || "")
    : (/^\d+$/.test(cachedAt) ? Number(cachedAt) : NaN);
  const age = Date.now() - timestamp;
  return !Number.isFinite(timestamp) || age < 0 || age >= maxAgeSeconds * 1000;
}

function isCacheableResponse(response) {
  return response.status === 200 &&
    !response.redirected &&
    !response.headers.has("set-cookie") &&
    !/(?:^|,)\s*(?:private|no-store)\b/i.test(response.headers.get("cache-control") || "") &&
    !/^(?:text\/html|text\/x-component)(?:\s*;|$)/i.test(response.headers.get("content-type") || "");
}

async function writeCache(cacheName, request, response, maxEntries, timestamp = false) {
  if (!isCacheableResponse(response)) return;
  let copy = response.clone();
  if (timestamp) {
    const headers = new Headers(copy.headers);
    headers.set(CACHED_AT_HEADER, String(Date.now()));
    copy = new Response(copy.body, { status: copy.status, statusText: copy.statusText, headers });
  }

  // Serialize each cache's put + trim so concurrent fetches cannot race its bound.
  const write = (cacheWrites.get(cacheName) || Promise.resolve())
    .then(async () => {
      const cache = await caches.open(cacheName);
      await cache.put(request, copy);
      await trimCache(cacheName, maxEntries);
    })
    .catch(() => {});
  cacheWrites.set(cacheName, write);
  return write;
}

function respondWithLifetime(event, strategy) {
  const background = [];
  const keepAlive = (task) => {
    const settled = task.catch(() => {});
    background.push(settled);
    return settled;
  };
  const response = strategy(event.request, keepAlive);
  event.respondWith(response);
  // Register synchronously, then wait for every write/revalidation scheduled by
  // the strategy, even when a cached response has already reached the browser.
  event.waitUntil(response.catch(() => {}).then(() => Promise.all(background)));
}

async function cacheFirst(request, cacheName, keepAlive) {
  const cached = await readCache(cacheName, request);
  if (cached) return cached;
  const response = await fetchWithTimeout(request);
  keepAlive(writeCache(cacheName, request, response, 128));
  return response;
}

async function staleWhileRevalidate(request, cacheName, keepAlive) {
  const network = fetchWithTimeout(request).catch(() => undefined);
  keepAlive(network.then((response) => {
    if (response) return writeCache(cacheName, request, response, 64);
  }));
  const cached = await readCache(cacheName, request);
  return cached || (await network) || Response.error();
}

async function networkFirst(request, cacheName, keepAlive, { timeoutMs = NETWORK_TIMEOUT_MS, maxAgeSeconds = 120 } = {}) {
  try {
    const response = await fetchWithTimeout(request, timeoutMs);
    keepAlive(writeCache(cacheName, request, response, 16, true));
    return response;
  } catch {
    const cached = await readCache(cacheName, request);
    if (cached && !isExpired(cached, maxAgeSeconds)) return cached;
    return Response.error();
  }
}

function isRscRequest(request, url) {
  return request.headers.has("rsc") ||
    request.headers.has("next-router-state-tree") ||
    request.headers.has("next-router-prefetch") ||
    (request.headers.get("accept") || "").includes("text/x-component") ||
    url.searchParams.has("_rsc");
}

function isCredentialFree(request, url) {
  return !url.username && !url.password &&
    !request.headers.has("authorization") &&
    !request.headers.has("proxy-authorization") &&
    !request.headers.has("cookie") &&
    ![...url.searchParams.keys()].some((key) => /^(?:auth|authorization|token|access_token|api_key|key|signature|jwt)$/i.test(key));
}

async function navigationResponse(request) {
  try {
    // Resolved HTTP errors belong to the server, not the offline fallback.
    return await fetchWithTimeout(request);
  } catch {
    const offline = await readCache(CACHE_NAVIGATION, OFFLINE_URL);
    return isOfflineResponse(offline) ? offline : Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // A production worker can remain registered when the same localhost origin
  // is used for `next dev`. Never let it turn a slow development compilation
  // into the app's offline document.
  if (IS_LOCAL_DEVELOPMENT) return;
  if (isRscRequest(request, url)) return;

  if (request.mode === "navigate") {
    if (/^\/(?:api|_next|icons|images|audio)(?:\/|$)/.test(url.pathname) ||
      STATIC_ASSET.test(url.pathname) || IMAGE_ASSET.test(url.pathname) ||
      AUDIO_ASSET.test(url.pathname) || NON_DOCUMENT_ASSET.test(url.pathname)) return;
    event.respondWith(navigationResponse(request));
    return;
  }

  if (!isCredentialFree(request, url) || request.headers.has("range") || request.cache === "no-store") return;

  if (PUBLIC_AVAILABILITY.test(url.pathname)) {
    // API reads are opt-in: never persist default cookie-bearing requests.
    if (request.credentials !== "omit") return;
    respondWithLifetime(event, (request, keepAlive) => networkFirst(request, CACHE_AVAILABILITY, keepAlive));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") && STATIC_ASSET.test(url.pathname)) {
    // These directories contain public files, not user data. Fetch without
    // cookies even though browser asset requests default to same-origin credentials.
    respondWithLifetime(event, (request, keepAlive) => staleWhileRevalidate(
      new Request(request, { credentials: "omit" }), CACHE_STATIC, keepAlive
    ));
    return;
  }
  if ((/^\/(?:icons|images)\//.test(url.pathname) && IMAGE_ASSET.test(url.pathname)) ||
    (url.pathname.startsWith("/audio/") && AUDIO_ASSET.test(url.pathname))) {
    respondWithLifetime(event, (request, keepAlive) => cacheFirst(
      new Request(request, { credentials: "omit" }), CACHE_IMAGES, keepAlive
    ));
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
