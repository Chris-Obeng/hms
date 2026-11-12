/**
 * Official browser Web Push endpoint validator (`HIGH-05`).
 *
 * Prevents authenticated staff from registering internal/arbitrary HTTP(S) URLs
 * as `push_subscriptions.endpoint` (blind SSRF via the privileged
 * `deliver-push-notifications` Edge Function).
 */

const IPV4_LITERAL_RE: RegExp = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export function isAllowedWebPushEndpoint(rawEndpoint: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawEndpoint);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== "443") return false;

  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.includes(":") || // IPv6 literal
    IPV4_LITERAL_RE.test(host)
  ) {
    return false;
  }

  return (
    host === "fcm.googleapis.com" ||
    host.endsWith(".push.services.mozilla.com") ||
    host.endsWith(".notify.windows.com") ||
    host.endsWith(".push.apple.com") ||
    host.endsWith(".googleapis.com")
  );
}
