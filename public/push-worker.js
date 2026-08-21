/* Web Push handler loaded by next-pwa Workbox service worker. */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(self.registration.showNotification(data.title || "RoomLine", {
    body: data.body || data.message || "New hotel notification",
    icon: data.icon || "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: data.tag || data.notificationId || "roomline-notification",
    renotify: true,
    data: { url: data.url || "/dashboard", notificationId: data.notificationId },
  }));
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
