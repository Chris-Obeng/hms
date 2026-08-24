/**
 * lib/roles.ts
 *
 * Staff role hierarchy shared by server guards (lib/auth.ts) and client UI
 * gating (settings navigation). Pure data only — no server imports.
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
