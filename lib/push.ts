export function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function isIosNonStandaloneBrowser(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIOS && !isStandalone;
}

export function getSafeNotificationPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "default";
  }
  return Notification.permission;
}

export function getBrowserAlertsStorageKey(staffId?: string | null): string {
  return staffId
    ? `RoomLine_browser_notifications_enabled:${staffId}`
    : "RoomLine_browser_notifications_enabled";
}

export function setBrowserAlertsPreference(
  enabled: boolean,
  staffId?: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    if (staffId) {
      localStorage.setItem(getBrowserAlertsStorageKey(staffId), String(enabled));
    }
    localStorage.setItem("RoomLine_browser_notifications_enabled", String(enabled));
  } catch {
    // Ignore storage quota / private mode failures
  }
}

export function readBrowserAlertsPreference(staffId?: string | null): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (staffId) {
      const scoped = localStorage.getItem(getBrowserAlertsStorageKey(staffId));
      if (scoped !== null) return scoped === "true";
      return false;
    }
    return localStorage.getItem("RoomLine_browser_notifications_enabled") === "true";
  } catch {
    return false;
  }
}

export function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function toBase64Url(value: BufferSource | null): string | null {
  if (!value) return null;
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
  if (!isWebPushSupported()) {
    if (isIosNonStandaloneBrowser()) {
      throw new Error(
        "Add Oriel to your Home Screen first (tap Share → Add to Home Screen) to enable alerts on iPhone or iPad"
      );
    }
    throw new Error("Push notifications are not supported on this browser");
  }

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    throw new Error("Service worker unavailable — push requires a production build");
  }
  const registration = await navigator.serviceWorker.ready;
  if (!registration.active) {
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

/**
 * Verifies that the browser's PushSubscription exists AND belongs to the
 * currently authenticated staff member in `push_subscriptions`.
 *
 * On shared front-desk workstations, if a previous shift's staff account left
 * an active browser PushSubscription behind, unsubscribing locally prevents
 * cross-staff/manager alerts from leaking onto the incoming clerk's screen and
 * ensures accurate "Off on this device" status.
 */
export async function syncPushSubscriptionStatus(): Promise<{
  supported: boolean;
  iosNeedsInstall: boolean;
  permission: NotificationPermission;
  active: boolean;
  staffId: string | null;
}> {
  const iosNeedsInstall = isIosNonStandaloneBrowser();
  const supported = isWebPushSupported();
  const permission = getSafeNotificationPermission();

  if (!supported || permission !== "granted") {
    return { supported, iosNeedsInstall, permission, active: false, staffId: null };
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) {
      return { supported, iosNeedsInstall, permission, active: false, staffId: null };
    }

    const res = await fetch(
      `/api/push/subscriptions?endpoint=${encodeURIComponent(subscription.endpoint)}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      return { supported, iosNeedsInstall, permission, active: false, staffId: null };
    }

    const data = (await res.json()) as {
      staffId?: string | null;
      activeForCurrentStaff?: boolean;
    };
    const staffId = data.staffId ?? null;
    const active = Boolean(data.activeForCurrentStaff);

    if (staffId && !active) {
      // Endpoint belongs to another staff member on this shared browser or was retired.
      await subscription.unsubscribe().catch(() => {});
      setBrowserAlertsPreference(false, staffId);
      return { supported, iosNeedsInstall, permission, active: false, staffId };
    }

    setBrowserAlertsPreference(active, staffId);
    return { supported, iosNeedsInstall, permission, active, staffId };
  } catch {
    return { supported, iosNeedsInstall, permission, active: false, staffId: null };
  }
}

export async function enableWebPush(): Promise<{
  subscription: PushSubscription;
  staffId: string | null;
}> {
  if (!isWebPushSupported()) {
    if (isIosNonStandaloneBrowser()) {
      throw new Error(
        "Add Oriel to your Home Screen first (tap Share → Add to Home Screen) to enable alerts on iPhone or iPad"
      );
    }
    throw new Error("Push notifications are not supported on this browser");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted");
  }

  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("Push notifications are not configured");

  const registration = await getPushRegistration();
  let subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    const existingKey = toBase64Url(subscription.options.applicationServerKey);
    if (existingKey && existingKey !== key.replace(/=+$/, "")) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }

  const response = await fetch("/api/push/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) {
    await subscription.unsubscribe().catch(() => {});
    throw new Error("Could not save push subscription");
  }
  const body = (await response.json().catch(() => ({}))) as { staffId?: string | null };
  const staffId = body.staffId ?? null;
  setBrowserAlertsPreference(true, staffId);
  return { subscription, staffId };
}

export async function disableWebPush(staffId?: string | null) {
  setBrowserAlertsPreference(false, staffId);
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await fetch("/api/push/subscriptions", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}
