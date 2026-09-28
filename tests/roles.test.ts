import { describe, expect, it } from "vitest";
import {
  CAPABILITY_MIN_ROLE,
  HIGHEST_ROLE,
  ROLE_LEVEL,
  can,
  canAdministerStaff,
  canAssignRole,
  asStaffRole,
  roleAtLeast,
  type Capability,
  type StaffRole,
} from "@/lib/roles";

const ALL_ROLES = Object.keys(ROLE_LEVEL) as StaffRole[];
const ALL_CAPABILITIES = Object.keys(CAPABILITY_MIN_ROLE) as Capability[];

describe("ROLE_LEVEL", () => {
  it("is a strict ladder from pending to super_admin", () => {
    expect(ROLE_LEVEL.pending).toBeLessThan(ROLE_LEVEL.read_only);
    expect(ROLE_LEVEL.read_only).toBeLessThan(ROLE_LEVEL.front_desk);
    expect(ROLE_LEVEL.front_desk).toBeLessThan(ROLE_LEVEL.manager);
    expect(ROLE_LEVEL.manager).toBeLessThan(ROLE_LEVEL.super_admin);
  });

  it("gives every role a distinct level", () => {
    const levels = ALL_ROLES.map((r) => ROLE_LEVEL[r]);
    expect(new Set(levels).size).toBe(levels.length);
  });

  it("names the strongest role in HIGHEST_ROLE", () => {
    const strongest = ALL_ROLES.reduce((a, b) => (ROLE_LEVEL[a] >= ROLE_LEVEL[b] ? a : b));
    expect(HIGHEST_ROLE).toBe(strongest);
  });
});

describe("roleAtLeast", () => {
  it("treats an unknown, null or undefined role as pending", () => {
    expect(roleAtLeast(null, "read_only")).toBe(false);
    expect(roleAtLeast(undefined, "read_only")).toBe(false);
    expect(roleAtLeast("", "read_only")).toBe(false);
    expect(roleAtLeast("owner", "read_only")).toBe(false);
    expect(roleAtLeast(null, "pending")).toBe(true);
  });

  it("is reflexive: every role clears its own level", () => {
    for (const role of ALL_ROLES) {
      expect(roleAtLeast(role, role)).toBe(true);
    }
  });

  it("is monotonic: a stronger role clears everything a weaker one clears", () => {
    for (const min of ALL_ROLES) {
      for (const role of ALL_ROLES) {
        const expected = ROLE_LEVEL[role] >= ROLE_LEVEL[min];
        expect(roleAtLeast(role, min)).toBe(expected);
      }
    }
  });
});

describe("CAPABILITY_MIN_ROLE", () => {
  it("declares at least one capability", () => {
    expect(ALL_CAPABILITIES.length).toBeGreaterThan(0);
  });

  it("maps every capability to a role that exists on the ladder", () => {
    for (const capability of ALL_CAPABILITIES) {
      expect(ALL_ROLES).toContain(CAPABILITY_MIN_ROLE[capability]);
    }
  });

  it("never requires `pending`, which is the absence of an assigned role", () => {
    for (const capability of ALL_CAPABILITIES) {
      expect(CAPABILITY_MIN_ROLE[capability]).not.toBe("pending");
    }
  });
});

describe("can", () => {
  /**
   * The absolute-access guarantee. A hotel super admin must clear every gated
   * action in the app. Adding a capability that super_admin cannot perform
   * fails here rather than surfacing as a support ticket.
   */
  it("grants the highest role every capability", () => {
    for (const capability of ALL_CAPABILITIES) {
      expect(can(HIGHEST_ROLE, capability), `${HIGHEST_ROLE} must have ${capability}`).toBe(true);
    }
  });

  it("denies every capability to pending, and to a missing or unknown role", () => {
    for (const capability of ALL_CAPABILITIES) {
      expect(can("pending", capability), `pending must not have ${capability}`).toBe(false);
      expect(can(null, capability)).toBe(false);
      expect(can(undefined, capability)).toBe(false);
      expect(can("owner", capability)).toBe(false);
    }
  });

  it("is monotonic in the ladder: a promotion never removes a capability", () => {
    const ordered = [...ALL_ROLES].sort((a, b) => ROLE_LEVEL[a] - ROLE_LEVEL[b]);
    for (const capability of ALL_CAPABILITIES) {
      let seenAllowed = false;
      for (const role of ordered) {
        const allowed = can(role, capability);
        if (allowed) seenAllowed = true;
        // Once a role is allowed, no stronger role may be denied.
        if (seenAllowed) {
          expect(allowed, `${role} lost ${capability} held by a weaker role`).toBe(true);
        }
      }
    }
  });

  it("agrees with the declared minimum for each capability", () => {
    for (const capability of ALL_CAPABILITIES) {
      const min = CAPABILITY_MIN_ROLE[capability];
      for (const role of ALL_ROLES) {
        expect(can(role, capability)).toBe(ROLE_LEVEL[role] >= ROLE_LEVEL[min]);
      }
    }
  });

  it("pins the boundaries that the RESTRICTIVE RLS policies mirror", () => {
    // Destructive rate and inventory work is manager+, matching
    // user_role_at_least(hotel_id, 'manager') in the SQL policies.
    expect(can("front_desk", "pricing:manage")).toBe(false);
    expect(can("manager", "pricing:manage")).toBe(true);
    expect(can("front_desk", "availability:unblock")).toBe(false);
    expect(can("manager", "availability:unblock")).toBe(true);
    // Front desk runs the day-to-day booking flow.
    expect(can("read_only", "booking:edit")).toBe(false);
    expect(can("front_desk", "booking:edit")).toBe(true);
    expect(can("front_desk", "availability:block")).toBe(true);
    // Tenant administration is super_admin only.
    expect(can("manager", "staff:manage")).toBe(false);
    expect(can("manager", "settings:manage")).toBe(false);
    expect(can("manager", "audit:read")).toBe(false);
    // Any assigned role may look at the settings area.
    expect(can("read_only", "settings:view")).toBe(true);
  });
});

describe("canAssignRole", () => {
  it("lets super_admin grant any real role but never pending", () => {
    for (const r of ["super_admin", "manager", "front_desk", "read_only"] as const)
      expect(canAssignRole("super_admin", r)).toBe(true);
    expect(canAssignRole("super_admin", "pending")).toBe(false);
  });

  it("lets manager grant up to manager, never super_admin or pending", () => {
    expect(canAssignRole("manager", "manager")).toBe(true);
    expect(canAssignRole("manager", "front_desk")).toBe(true);
    expect(canAssignRole("manager", "read_only")).toBe(true);
    expect(canAssignRole("manager", "super_admin")).toBe(false);
    expect(canAssignRole("manager", "pending")).toBe(false);
  });

  it("denies anyone below manager, and unknown/null actors", () => {
    for (const r of ["front_desk", "read_only", "pending"] as const)
      expect(canAssignRole(r, "read_only")).toBe(false);
    expect(canAssignRole(null, "read_only")).toBe(false);
    expect(canAssignRole("owner", "read_only")).toBe(false);
  });

  it("rejects unknown / non-role strings for every actor", () => {
    expect(canAssignRole("super_admin", "owner")).toBe(false);
    expect(canAssignRole("super_admin", "garbage")).toBe(false);
    expect(canAssignRole("super_admin", "")).toBe(false);
    expect(canAssignRole("super_admin", null)).toBe(false);
    expect(canAssignRole("manager", "garbage")).toBe(false);
  });
});

describe("asStaffRole", () => {
  it("passes through known roles", () => {
    expect(asStaffRole("manager")).toBe("manager");
    expect(asStaffRole("super_admin")).toBe("super_admin");
  });

  it("coerces unknown / absent to pending", () => {
    expect(asStaffRole("garbage")).toBe("pending");
    expect(asStaffRole("")).toBe("pending");
    expect(asStaffRole(null)).toBe("pending");
    expect(asStaffRole(undefined)).toBe("pending");
  });

  it("coerces inherited Object.prototype property names to pending", () => {
    for (const name of ["constructor", "toString", "valueOf", "hasOwnProperty", "isPrototypeOf", "__proto__"])
      expect(asStaffRole(name)).toBe("pending");
  });
});

describe("canAdministerStaff", () => {
  it("lets super_admin administer every target", () => {
    for (const t of ["super_admin", "manager", "front_desk", "read_only", "pending"] as const)
      expect(canAdministerStaff("super_admin", t)).toBe(true);
  });

  it("lets manager administer anyone except a super_admin", () => {
    expect(canAdministerStaff("manager", "super_admin")).toBe(false);
    for (const t of ["manager", "front_desk", "read_only", "pending"] as const)
      expect(canAdministerStaff("manager", t)).toBe(true);
  });

  it("denies anyone below manager, and unknown/null actors", () => {
    expect(canAdministerStaff("front_desk", "read_only")).toBe(false);
    expect(canAdministerStaff(null, "read_only")).toBe(false);
  });
});

describe("staff capability ladder", () => {
  it("puts invite/setActive/setRole at manager, keeps manage at super_admin", () => {
    expect(can("manager", "staff:invite")).toBe(true);
    expect(can("front_desk", "staff:invite")).toBe(false);
    expect(can("manager", "staff:setActive")).toBe(true);
    expect(can("manager", "staff:setRole")).toBe(true);
    expect(can("manager", "staff:manage")).toBe(false);
  });
});
