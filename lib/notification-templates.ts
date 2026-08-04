/**
 * lib/notification-templates.ts
 *
 * Default notification templates and helpers for rendering them.
 * Hotels can override these defaults via hotels.settings.notification_templates.
 */

// ── Types ─────────────────────────────────────────────────────────

export type NotificationEventType =
  | "booking_confirmed"
  | "booking_cancelled"
  | "payment_received";

export interface NotificationTemplate {
  email_enabled: boolean;
  email_subject: string;
  email_template: string;
}

export type NotificationTemplatesMap = Partial<
  Record<NotificationEventType, Partial<NotificationTemplate>>
>;

export interface TemplateVars {
  guest_name?: string;
  reference?: string;
  room_name?: string;
  check_in?: string;
  check_out?: string;
  check_in_time?: string;
  check_out_time?: string;
  nights?: string | number;
  total_amount?: string | number;
  currency?: string;
  hotel_name?: string;
  hotel_phone?: string;
  hotel_address?: string;
}

// ── Default Templates ─────────────────────────────────────────────

export const DEFAULT_TEMPLATES: Record<NotificationEventType, NotificationTemplate> = {
  booking_confirmed: {
    email_enabled: true,
    email_subject: "Booking Confirmed — {{reference}}",
    email_template:
      "Hi {{guest_name}},\n\nYour booking at {{hotel_name}} is confirmed.\n\nReference: {{reference}}\nRoom: {{room_name}}\nCheck-in: {{check_in}}{{check_in_time}}\nCheck-out: {{check_out}}{{check_out_time}}\nNights: {{nights}}\nTotal: {{currency}} {{total_amount}}\n\n{{hotel_address}}{{hotel_phone}}",
  },
  booking_cancelled: {
    email_enabled: true,
    email_subject: "Booking Cancelled — {{reference}}",
    email_template:
      "Hi {{guest_name}},\n\nYour booking {{reference}} at {{hotel_name}} has been cancelled.\n\nIf this was unexpected, please contact the hotel directly.{{hotel_phone}}",
  },
  payment_received: {
    email_enabled: true,
    email_subject: "Payment Receipt — {{reference}}",
    email_template:
      "Hi {{guest_name}},\n\nWe've received your payment of {{currency}} {{total_amount}} for booking {{reference}} at {{hotel_name}}.\n\nThank you!",
  },
};

export const EVENT_LABELS: Record<NotificationEventType, string> = {
  booking_confirmed: "Booking Confirmed",
  booking_cancelled: "Booking Cancelled",
  payment_received: "Payment Received",
};

export const EVENT_DESCRIPTIONS: Record<NotificationEventType, string> = {
  booking_confirmed: "Sent to the guest when a reservation is confirmed",
  booking_cancelled: "Sent to the guest when a booking is cancelled",
  payment_received: "Sent to the guest when a payment is processed",
};

export const ALL_EVENT_TYPES: NotificationEventType[] = [
  "booking_confirmed",
  "booking_cancelled",
  "payment_received",
];

export const TEMPLATE_VARIABLES = [
  "{{guest_name}}",
  "{{reference}}",
  "{{room_name}}",
  "{{check_in}}",
  "{{check_out}}",
  "{{check_in_time}}",
  "{{check_out_time}}",
  "{{nights}}",
  "{{total_amount}}",
  "{{currency}}",
  "{{hotel_name}}",
  "{{hotel_phone}}",
  "{{hotel_address}}",
] as const;

// ── getTemplate ───────────────────────────────────────────────────

/**
 * Returns the merged template for an event type.
 * Hotel overrides are shallow-merged over the defaults.
 */
export function getTemplate(
  templates: NotificationTemplatesMap | null | undefined,
  eventType: NotificationEventType
): NotificationTemplate {
  const defaults = DEFAULT_TEMPLATES[eventType];
  const override = templates?.[eventType];
  if (!override) return defaults;
  return { ...defaults, ...override };
}

// ── renderTemplate ────────────────────────────────────────────────

/**
 * Replaces {{variable}} placeholders with actual values.
 * Unknown variables are left as-is.
 * Optional fields like {{check_in_time}} are rendered with a prefix
 * when the value is present, or stripped when absent.
 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  let result = template;

  // Special handling: prefix-wrapped optional fields
  // e.g. "{{check_in_time}}" → " from 14:00" when present, "" when absent
  const optionalWithPrefix: Array<{ key: keyof TemplateVars; prefix: string }> = [
    { key: "check_in_time", prefix: " from " },
    { key: "check_out_time", prefix: " by " },
    { key: "hotel_phone", prefix: "\nCall us: " },
    { key: "hotel_address", prefix: "\n" },
  ];

  for (const { key, prefix } of optionalWithPrefix) {
    const value = vars[key];
    const placeholder = `{{${key}}}`;
    if (value) {
      result = result.replaceAll(placeholder, `${prefix}${value}`);
    } else {
      result = result.replaceAll(placeholder, "");
    }
  }

  // Standard replacements
  const standardKeys: Array<keyof TemplateVars> = [
    "guest_name",
    "reference",
    "room_name",
    "check_in",
    "check_out",
    "nights",
    "total_amount",
    "currency",
    "hotel_name",
  ];

  for (const key of standardKeys) {
    const value = vars[key];
    if (value !== undefined && value !== null) {
      result = result.replaceAll(`{{${key}}}`, String(value));
    }
  }

  return result.trim();
}
