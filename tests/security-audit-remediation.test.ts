import { describe, expect, it } from "vitest";
import { isAllowedWebPushEndpoint } from "@/lib/push-endpoint";
import {
  resolveClerkCreatedMembership,
  resolveClerkUpdatedRole,
} from "@/lib/clerk-role-sync";
import { sanitizePlatformRedirect } from "@/lib/platform/redirect";

describe("isAllowedWebPushEndpoint (HIGH-05 SSRF protection)", () => {
  it("allows official HTTPS browser Web Push endpoints", () => {
    expect(
      isAllowedWebPushEndpoint("https://fcm.googleapis.com/fcm/send/abc123")
    ).toBe(true);
    expect(
      isAllowedWebPushEndpoint(
        "https://updates.push.services.mozilla.com/wpush/v2/token"
      )
    ).toBe(true);
    expect(
      isAllowedWebPushEndpoint(
        "https://db5p.notify.windows.com/w/?token=xyz"
      )
    ).toBe(true);
    expect(
      isAllowedWebPushEndpoint(
        "https://web.push.apple.com/Q123456"
      )
    ).toBe(true);
  });

  it("rejects non-HTTPS, localhost, internal IPs, custom ports, and arbitrary hosts", () => {
    expect(
      isAllowedWebPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")
    ).toBe(false);
    expect(isAllowedWebPushEndpoint("https://localhost/push")).toBe(false);
    expect(isAllowedWebPushEndpoint("https://127.0.0.1/push")).toBe(false);
    expect(
      isAllowedWebPushEndpoint("https://169.254.169.254/latest/meta-data/")
    ).toBe(false);
    expect(isAllowedWebPushEndpoint("https://[::1]/push")).toBe(false);
    expect(
      isAllowedWebPushEndpoint("https://fcm.googleapis.com:8443/fcm/send/abc")
    ).toBe(false);
    expect(
      isAllowedWebPushEndpoint("https://user:pass@fcm.googleapis.com/fcm/send")
    ).toBe(false);
    expect(
      isAllowedWebPushEndpoint("https://attacker.example.com/webhook")
    ).toBe(false);
  });
});

describe("Clerk webhook role preservation (HIGH-07)", () => {
  it("preserves custom roles and deactivated status when organizationMembership.created is redelivered", () => {
    expect(
      resolveClerkCreatedMembership({
        rawClerkRole: "org:member",
        existing: { role: "read_only", is_active: false },
      })
    ).toEqual({ role: "read_only", isActive: false });

    expect(
      resolveClerkCreatedMembership({
        rawClerkRole: "org:member",
        existing: { role: "manager", is_active: true },
      })
    ).toEqual({ role: "manager", isActive: true });

    expect(
      resolveClerkCreatedMembership({
        rawClerkRole: "org:admin",
        existing: { role: "manager", is_active: true },
      })
    ).toEqual({ role: "super_admin", isActive: true });
  });

  it("sets pending memberships inactive by default on initial creation", () => {
    expect(
      resolveClerkCreatedMembership({
        rawClerkRole: "org:member",
        invitedRole: "pending",
        existing: null,
      })
    ).toEqual({ role: "pending", isActive: false });
  });

  it("never escalates read_only/pending or demotes manager on organizationMembership.updated", () => {
    expect(
      resolveClerkUpdatedRole({
        rawClerkRole: "org:member",
        existingRole: "read_only",
      })
    ).toBe("read_only");

    expect(
      resolveClerkUpdatedRole({
        rawClerkRole: "org:member",
        existingRole: "pending",
      })
    ).toBe("pending");

    expect(
      resolveClerkUpdatedRole({
        rawClerkRole: "org:member",
        existingRole: "manager",
      })
    ).toBe("manager");

    // Admin demoted in Clerk -> front_desk
    expect(
      resolveClerkUpdatedRole({
        rawClerkRole: "org:member",
        existingRole: "super_admin",
      })
    ).toBe("front_desk");

    // Member promoted to org:admin in Clerk -> super_admin
    expect(
      resolveClerkUpdatedRole({
        rawClerkRole: "org:admin",
        existingRole: "manager",
      })
    ).toBe("super_admin");
  });
});

describe("sanitizePlatformRedirect (HIGH-09 open-redirect guard)", () => {
  it("allows valid internal /platform paths", () => {
    expect(sanitizePlatformRedirect("/platform/dashboard")).toBe(
      "/platform/dashboard"
    );
    expect(sanitizePlatformRedirect("/platform/update-password")).toBe(
      "/platform/update-password"
    );
    expect(sanitizePlatformRedirect("/platform")).toBe("/platform");
  });

  it("rejects protocol-relative //, backslash /\\, external URLs, and non-platform paths", () => {
    expect(sanitizePlatformRedirect("//attacker.example/login")).toBe(
      "/platform/dashboard"
    );
    expect(sanitizePlatformRedirect("/\\attacker.example/login")).toBe(
      "/platform/dashboard"
    );
    expect(sanitizePlatformRedirect("https://attacker.example")).toBe(
      "/platform/dashboard"
    );
    expect(sanitizePlatformRedirect("/dashboard")).toBe("/platform/dashboard");
    expect(sanitizePlatformRedirect("/platform-evil")).toBe(
      "/platform/dashboard"
    );
    expect(sanitizePlatformRedirect("/platform/dashboard\r\nLocation: //evil")).toBe(
      "/platform/dashboard"
    );
    expect(sanitizePlatformRedirect(null)).toBe("/platform/dashboard");
  });
});
