import { describe, expect, it } from "vitest";
import { resolveNotificationChannel } from "@/lib/notifications/channel-router";

describe("resolveNotificationChannel", () => {
  it("routes valid Ghanaian numbers to SMS", () => {
    expect(resolveNotificationChannel("+233244123456")).toBe("sms");
    expect(resolveNotificationChannel("0244123456")).toBe("sms");
    expect(resolveNotificationChannel("233244123456")).toBe("sms");
    expect(resolveNotificationChannel("  +233 24 412 3456  ")).toBe("sms");
  });

  it("routes valid foreign numbers to email", () => {
    expect(resolveNotificationChannel("+447911123456")).toBe("email");
    expect(resolveNotificationChannel("+12125550123")).toBe("email");
  });

  it("routes invalid or missing numbers to email", () => {
    expect(resolveNotificationChannel("not-a-number")).toBe("email");
    expect(resolveNotificationChannel("123")).toBe("email");
    expect(resolveNotificationChannel("")).toBe("email");
    expect(resolveNotificationChannel(undefined as unknown as string)).toBe("email");
    expect(resolveNotificationChannel(12345 as unknown as string)).toBe("email");
  });
});
