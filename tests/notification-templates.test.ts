import { describe, expect, it } from "vitest";
import {
  ALL_EVENT_TYPES,
  DEFAULT_TEMPLATES,
  EVENT_DESCRIPTIONS,
  EVENT_LABELS,
  getTemplate,
  renderTemplate,
  type NotificationTemplatesMap,
} from "@/lib/notification-templates";

describe("getTemplate", () => {
  it("returns defaults when no overrides exist", () => {
    expect(getTemplate(null, "booking_confirmed")).toBe(DEFAULT_TEMPLATES.booking_confirmed);
    expect(getTemplate(undefined, "payment_received")).toBe(DEFAULT_TEMPLATES.payment_received);
    expect(getTemplate({}, "booking_cancelled")).toBe(DEFAULT_TEMPLATES.booking_cancelled);
  });

  it("shallow-merges hotel overrides over the defaults", () => {
    const templates: NotificationTemplatesMap = {
      booking_confirmed: { email_enabled: false, email_subject: "Custom {{reference}}" },
    };
    const merged = getTemplate(templates, "booking_confirmed");

    expect(merged.email_enabled).toBe(false);
    expect(merged.email_subject).toBe("Custom {{reference}}");
    expect(merged.email_template).toBe(DEFAULT_TEMPLATES.booking_confirmed.email_template);
  });

  it("does not mutate the defaults when merging", () => {
    const before = { ...DEFAULT_TEMPLATES.payment_received };
    getTemplate({ payment_received: { email_subject: "x" } }, "payment_received");
    expect(DEFAULT_TEMPLATES.payment_received).toEqual(before);
  });

  it("only applies overrides for the requested event type", () => {
    const merged = getTemplate({ booking_cancelled: { email_enabled: false } }, "booking_confirmed");
    expect(merged).toBe(DEFAULT_TEMPLATES.booking_confirmed);
  });
});

describe("renderTemplate", () => {
  it("replaces standard placeholders with values", () => {
    const out = renderTemplate(
      "Hi {{guest_name}}, ref {{reference}} for {{room_name}} — {{currency}} {{total_amount}} over {{nights}} nights at {{hotel_name}}",
      {
        guest_name: "Ama",
        reference: "BK-1",
        room_name: "Deluxe",
        currency: "GHS",
        total_amount: 450,
        nights: 2,
        hotel_name: "Sunset Inn",
      }
    );
    expect(out).toBe("Hi Ama, ref BK-1 for Deluxe — GHS 450 over 2 nights at Sunset Inn");
  });

  it("coerces numeric values to strings", () => {
    expect(renderTemplate("{{total_amount}}", { total_amount: 0 })).toBe("0");
    expect(renderTemplate("{{nights}}", { nights: 3 })).toBe("3");
  });

  it("replaces every occurrence of a placeholder", () => {
    expect(renderTemplate("{{reference}} / {{reference}}", { reference: "A1" })).toBe("A1 / A1");
  });

  it("renders optional fields with their prefix when present", () => {
    const out = renderTemplate(
      "Check-in {{check_in}}{{check_in_time}}, out {{check_out}}{{check_out_time}}{{hotel_address}}{{hotel_phone}}",
      {
        check_in: "2026-01-01",
        check_in_time: "14:00",
        check_out: "2026-01-03",
        check_out_time: "11:00",
        hotel_address: "12 Beach Rd",
        hotel_phone: "+233200000000",
      }
    );
    expect(out).toBe(
      "Check-in 2026-01-01 from 14:00, out 2026-01-03 by 11:00\n12 Beach Rd\nCall us: +233200000000"
    );
  });

  it("strips optional fields (and their prefixes) when absent or empty", () => {
    const out = renderTemplate("Check-in {{check_in}}{{check_in_time}}{{hotel_phone}}", {
      check_in: "2026-01-01",
      check_in_time: "",
    });
    expect(out).toBe("Check-in 2026-01-01");
  });

  it("leaves unknown variables untouched", () => {
    expect(renderTemplate("Hello {{unknown_var}}", { guest_name: "Ama" })).toBe("Hello {{unknown_var}}");
  });

  it("leaves known placeholders in place when the value is undefined", () => {
    expect(renderTemplate("{{guest_name}} x", {})).toBe("{{guest_name}} x");
  });

  it("trims surrounding whitespace left by stripped placeholders", () => {
    expect(renderTemplate("  {{hotel_phone}}Done{{hotel_address}}  ", {})).toBe("Done");
  });

  it("renders the default booking confirmation email template end to end", () => {
    const out = renderTemplate(DEFAULT_TEMPLATES.booking_confirmed.email_template, {
      guest_name: "Ama",
      reference: "BK-9",
      room_name: "Suite",
      hotel_name: "Sunset Inn",
      check_in: "2026-02-01",
      check_out: "2026-02-04",
      nights: 3,
      currency: "GHS",
      total_amount: "1200",
    });
    expect(out).not.toMatch(/\{\{|\}\}/);
    expect(out).toContain("BK-9");
  });
});

describe("event metadata", () => {
  it("has a default template, label and description for every event type", () => {
    for (const eventType of ALL_EVENT_TYPES) {
      expect(DEFAULT_TEMPLATES[eventType]).toBeDefined();
      expect(EVENT_LABELS[eventType]).toBeTruthy();
      expect(EVENT_DESCRIPTIONS[eventType]).toBeTruthy();
    }
    expect(ALL_EVENT_TYPES).toHaveLength(Object.keys(DEFAULT_TEMPLATES).length);
  });
});
