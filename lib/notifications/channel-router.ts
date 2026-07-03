/**
 * lib/notifications/channel-router.ts
 *
 * Determines the notification channel for a guest based on their phone number.
 * Uses libphonenumber-js/core with manual metadata loading for robustness
 * across different runtime module loaders (tsx, Next.js, etc.).
 *
 * Decision rule:
 *   - Phone parses as valid AND country === 'GH' → SMS (Arkesel)
 *   - Everything else (foreign number, invalid, missing) → Email (Resend)
 */

import { parsePhoneNumberFromString } from "libphonenumber-js/core";
import metadataJson from "libphonenumber-js/metadata.min.json";

// libphonenumber-js/metadata.min.json may be wrapped in a `default` key depending
// on the bundler/loader (CommonJS interop, tsx, Next.js turbopack). This handles both.
// We assert the type rather than casting to any, preserving type-checking on usage.
const metadata = (metadataJson as { default?: typeof metadataJson } & typeof metadataJson).default ?? metadataJson;

export type NotificationChannel = "sms" | "email";

/**
 * Resolves the notification channel for a guest.
 *
 * @param phone - The guest phone number in any format (E.164, national, etc.)
 * @returns 'sms' for valid Ghanaian numbers, 'email' otherwise.
 *
 * @example
 * resolveNotificationChannel("+233244123456") // → "sms"
 * resolveNotificationChannel("0244123456")    // → "sms"  (local GH format)
 * resolveNotificationChannel("+447911123456") // → "email" (UK)
 * resolveNotificationChannel("not-a-number")  // → "email" (invalid)
 * resolveNotificationChannel("")              // → "email" (empty)
 */
export function resolveNotificationChannel(phone: string): NotificationChannel {
  if (!phone || typeof phone !== "string") return "email";

  try {
    // Provide GH as default country so local format "0244123456" parses correctly.
    const parsed = parsePhoneNumberFromString(phone.trim(), "GH", metadata);

    if (!parsed || !parsed.isValid()) return "email";

    return parsed.country === "GH" ? "sms" : "email";
  } catch {
    // parsePhoneNumberFromString returns undefined on malformed input rather than throwing,
    // but we use catch as defensive code.
    return "email";
  }
}
