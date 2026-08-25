/* Web Push handler loaded by next-pwa Workbox service worker. */
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
