/**
 * lib/roles.ts
 *
 * Staff role hierarchy and the capability map that every role gate reads from.
 * Shared by server guards (lib/auth.ts), server actions, and client UI gating.
 * Pure data only — no server imports.
 */

export type StaffRole = "super_admin" | "manager" | "front_desk" | "read_only" | "pending";

/** From weakest to strongest. Single source of truth for role comparisons. */
export const ROLE_LEVEL: Record<StaffRole, number> = {
  pending:     0,
  read_only:   1,
  front_desk:  2,
  manager:     3,
  super_admin: 4,
};

export function roleAtLeast(role: string | null | undefined, min: StaffRole): boolean {
  return (ROLE_LEVEL[(role ?? "pending") as StaffRole] ?? 0) >= ROLE_LEVEL[min];
}

/** The four grantable roles — never "pending", never an unknown string. */
const ASSIGNABLE_ROLES = ["super_admin", "manager", "front_desk", "read_only"] as const;

function isAssignableRole(role: string | null | undefined): boolean {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(role ?? "");
}

/** Coerce an untrusted string to a known role; unknown/absent → "pending" (no privileges). */
export function asStaffRole(role: string | null | undefined): StaffRole {
  return role != null && Object.prototype.hasOwnProperty.call(ROLE_LEVEL, role)
    ? (role as StaffRole)
    : "pending";
}

/**
 * The strongest role. A holder of this role clears every capability below by
 * construction, because `can()` is a level comparison and no capability can be
 * declared above the top of the ladder. `tests/roles.test.ts` asserts it.
 */
export const HIGHEST_ROLE: StaffRole = "super_admin";

/**
 * Every gated action in the app, mapped to the weakest role allowed to perform
 * it. This is the authorization surface: features ask for a capability, never
 * for a role, so a role comparison cannot drift from one call site to the next.
 *
 * Mirrored in SQL by `public.user_role_at_least()` (see the RESTRICTIVE policies
 * in supabase/migrations). Keep the two ladders in step.
 */
export const CAPABILITY_MIN_ROLE = {
  /** Read the settings area at all (any assigned role except pending). */
  "settings:view":                 "read_only",
  /** Edit a booking: dates, rooms, guest details, status. */
  "booking:edit":                  "front_desk",
  /** Move or resize a reservation on the calendar. */
  "calendar:edit":                 "front_desk",
  /** Block a room for maintenance, cleaning or an owner stay. */
  "availability:block":            "front_desk",
  /** Remove an existing availability block. */
  "availability:unblock":          "manager",
  /** Change rates, plans and daily overrides. */
  "pricing:manage":                "manager",
  /** Configure payment settings (channels, surcharges, payout account). */
  "payments:configure":            "manager",
  /** Read payment activity and payout status. */
  "payments:view":                 "read_only",
  /** Close the business day. */
  "night_audit:run":               "manager",
  /** Read the hotel audit log. */
  "audit:read":                    "super_admin",
  /** Add, deactivate, or re-role staff. */
  "staff:manage":                  "super_admin",
  /** Send a staff invitation. */
  "staff:invite":                  "manager",
  /** Activate or deactivate a staff member. */
  "staff:setActive":               "manager",
  /** Change a staff member's role. */
  "staff:setRole":                 "manager",
  /** Change hotel profile, policies, and integration settings. */
  "settings:manage":               "super_admin",
  /** Reveal or rotate payment provider credentials. */
  "payments:manage_credentials":   "super_admin",
  /** Edit guest-facing notification templates. */
  "notification_templates:manage": "super_admin",
} as const satisfies Record<string, StaffRole>;

export type Capability = keyof typeof CAPABILITY_MIN_ROLE;

/**
 * Authorization check for a single capability.
 *
 * Prefer this over comparing `role` to a literal: a hand-rolled
 * `role === "super_admin" || role === "manager"` restates the ladder and can
 * silently omit a role when the ladder changes.
 */
export function can(role: string | null | undefined, capability: Capability): boolean {
  return roleAtLeast(role, CAPABILITY_MIN_ROLE[capability]);
}

/**
 * Whether `actorRole` may manage the staff member holding `targetRole`
 * (status/role). Managers may act on anyone at or below manager; only a
 * super_admin may act on a super_admin. Self-action is guarded by callers.
 */
export function canAdministerStaff(
  actorRole: string | null | undefined,
  targetRole: string | null | undefined
): boolean {
  if (!roleAtLeast(actorRole, "manager")) return false;
  if (roleAtLeast(actorRole, "super_admin")) return true;
  return !roleAtLeast(targetRole, "super_admin");
}

/**
 * Whether `actorRole` may grant `newRole`. super_admin grants any real role;
 * manager grants up to manager, never super_admin. `pending` is never assignable.
 */
export function canAssignRole(
  actorRole: string | null | undefined,
  newRole: string | null | undefined
): boolean {
  if (!isAssignableRole(newRole)) return false; // rejects pending + unknown/garbage
  if (roleAtLeast(actorRole, "super_admin")) return true;
  if (!roleAtLeast(actorRole, "manager")) return false;
  return !roleAtLeast(newRole, "super_admin");
}
