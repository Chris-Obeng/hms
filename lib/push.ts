export function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function toBase64Url(value: BufferSource | null): string | null {
  if (!value) return null;
  // Respect byteOffset/byteLength: the browser may hand back a view into a
  // larger buffer, and reading the whole buffer would corrupt the comparison.
  const view =
    value instanceof Uint8Array
      ? value
      : new Uint8Array(value as ArrayBuffer);
  const bytes =
    view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
      ? view
      : new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push notifications are not supported on this device");
  }
  // /sw.js is a plain service worker at the root scope (see public/sw.js).
  // Registering explicitly makes the flow independent of page-level
  // registration timing and is idempotent.
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    throw new Error("Service worker unavailable — push requires a production build");
  }
  const registration = await navigator.serviceWorker.ready;
  if (!registration.active) {
    // Wait for the worker to finish activating before subscribing.
    await new Promise<void>((resolve) => {
      const worker = registration.installing ?? registration.waiting;
      if (!worker) return resolve();
      worker.addEventListener("statechange", () => {
        if (worker.state === "activated") resolve();
      });
      setTimeout(resolve, 3000);
    });
  }
  return registration;
}

export async function enableWebPush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted");

  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("Push notifications are not configured");

  const registration = await getPushRegistration();
  let subscription = await registration.pushManager.getSubscription();

  // A subscription minted against a different VAPID key can never receive
  // pushes (server signs with its own private key → 403 on every send).
  // Detect the mismatch and mint a fresh subscription.
  if (subscription) {
    const existingKey = toBase64Url(subscription.options.applicationServerKey);
    if (existingKey && existingKey !== key.replace(/=+$/, "")) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  }

  const response = await fetch("/api/push/subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
  if (!response.ok) {
    // Server rejected the credential — drop the local subscription so the
    // next enable attempt starts clean instead of looping on a bad endpoint.
    await subscription.unsubscribe().catch(() => {});
    throw new Error("Could not save push subscription");
  }
  return subscription;
}

export async function disableWebPush() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await fetch("/api/push/subscriptions", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
  await subscription.unsubscribe();
}
