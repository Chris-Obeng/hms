/**
 * Pure role-reconciliation helpers for Clerk organization membership webhooks (`HIGH-07`).
 *
 * Clerk Organizations only expose `org:admin` and `org:member`, whereas RoomLine
 * persists granular hotel roles (`super_admin`, `manager`, `front_desk`,
 * `read_only`, `pending`) and `is_active` state in `public.staff_profiles`.
 */

export interface ExistingStaffMembershipState {
  role: string | null;
  is_active: boolean | null;
}

/**
 * Computes `{ role, isActive }` for `organizationMembership.created`.
 * Preserves custom roles and deactivation state across Svix webhook redeliveries.
 */
export function resolveClerkCreatedMembership(params: {
  rawClerkRole: string;
  invitedRole?: string | null;
  existing?: ExistingStaffMembershipState | null;
}): { role: string; isActive: boolean } {
  const { rawClerkRole, invitedRole, existing } = params;

  if (existing) {
    const nextRole =
      rawClerkRole === "org:admin"
        ? "super_admin"
        : existing.role || invitedRole || "front_desk";
    return {
      role: nextRole,
      isActive: existing.is_active ?? false,
    };
  }

  const initialRole =
    rawClerkRole === "org:admin"
      ? "super_admin"
      : invitedRole || "front_desk";

  return {
    role: initialRole,
    isActive: initialRole !== "pending",
  };
}

/**
 * Computes the next RoomLine role for `organizationMembership.updated`.
 * - `org:admin` promotes to `'super_admin'`.
 * - Non-admin (`org:member`) ONLY demotes `'super_admin'` → `'front_desk'`;
 *   existing `'manager'`, `'front_desk'`, `'read_only'`, and `'pending'` roles
 *   are preserved untouched so profile/metadata syncs never escalate or demote staff.
 */
export function resolveClerkUpdatedRole(params: {
  rawClerkRole: string;
  existingRole: string | null | undefined;
}): string {
  const { rawClerkRole, existingRole } = params;
  if (rawClerkRole === "org:admin") {
    return "super_admin";
  }
  if (!existingRole || existingRole === "super_admin") {
    return "front_desk";
  }
  return existingRole;
}
