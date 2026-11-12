/**
 * Validates the `next` query parameter on `/platform/auth/confirm` (`HIGH-09`).
 *
 * Blocks protocol-relative URLs (`//attacker.example`), backslash-normalized
 * URLs (`/\attacker.example`), control characters, and paths outside `/platform`.
 */
export function sanitizePlatformRedirect(
  raw: string | null | undefined,
  fallback = "/platform/dashboard"
): string {
  if (!raw) return fallback;
  if (/[\r\n\0]/.test(raw)) return fallback;
  if (!/^\/(?!\/|\\)/.test(raw)) return fallback;
  if (raw !== "/platform" && !raw.startsWith("/platform/") && !raw.startsWith("/platform?")) {
    return fallback;
  }
  return raw;
}
