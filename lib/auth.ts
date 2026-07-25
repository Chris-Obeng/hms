/**
 * lib/auth.ts
 *
 * Central auth + role-guard helper for hotel staff server actions.
 *
 * ALL server actions that touch hotel data go through this module.
 * Never copy-paste auth checks inline — use these helpers instead.
 *
 * Role hierarchy (from weakest to strongest):
 *   read_only < front_desk < manager < super_admin
 *
 * Exported helpers:
 *   requireAuth()          — must be authenticated + have an active org
 *   requireStaffRole()     — requireAuth + checks staff_profiles.role
 *   requireMinRole()       — requireAuth + enforces minimum role level
 *   canPerformAction()     — returns boolean (non-throwing, for conditional UI data)
 *
 * Throws structured AuthError on failure — all server actions catch and
 * convert this to { success: false, error: string }.
 */

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";

// ── Types ─────────────────────────────────────────────────────────

export type StaffRole = "super_admin" | "manager" | "front_desk" | "read_only" | "pending";

export interface AuthContext {
  orgId: string;
  userId: string;
  hotelId: string;
  staffId: string;
  staffName: string | null;
  role: StaffRole;
  hotel: {
    id: string;
    name: string;
    currency: string;
    settings: Record<string, unknown>;
    phone: string | null;
    address: string | null;
    status: string;
  };
}

// ── Role ordering ─────────────────────────────────────────────────

const ROLE_LEVEL: Record<StaffRole, number> = {
  pending:     0,
  read_only:   1,
  front_desk:  2,
  manager:     3,
  super_admin: 4,
};

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "HOTEL_NOT_FOUND" | "INACTIVE"
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// ── Core helper ───────────────────────────────────────────────────

/**
 * Resolves the full auth context for the current request.
 * Returns orgId, userId, hotelId, staffId, role, and hotel details.
 *
 * Throws AuthError on any failure — caller must catch and convert.
 */
export async function requireAuth(): Promise<AuthContext> {
  const { orgId, userId } = await auth();

  if (!orgId || !userId) {
    throw new AuthError("Not authenticated", "UNAUTHENTICATED");
  }

  const supabase = await createClient();

  // Fetch hotel + staff in parallel
  const [hotelResult, staffResult] = await Promise.all([
    supabase
      .from("hotels")
      .select("id, name, currency, settings, phone, address, status")
      .eq("clerk_org_id", orgId)
      .single(),
    supabase
      .from("staff_profiles")
      .select("id, full_name, role, is_active")
      .eq("clerk_user_id", userId)
      .eq("clerk_org_id", orgId)
      .single(),
  ]);

  if (!hotelResult.data) {
    throw new AuthError("Hotel not found for this organization", "HOTEL_NOT_FOUND");
  }

  const hotel = hotelResult.data;
  const staff = staffResult.data;

  if (!staff || !staff.is_active) {
    throw new AuthError("Your account is not active. Contact your manager.", "INACTIVE");
  }

  return {
    orgId,
    userId,
    hotelId: hotel.id,
    staffId: staff.id,
    staffName: staff.full_name ?? null,
    role: (staff.role ?? "pending") as StaffRole,
    hotel: {
      id: hotel.id,
      name: hotel.name,
      currency: hotel.currency ?? "GHS",
      settings: (hotel.settings as Record<string, unknown>) ?? {},
      phone: hotel.phone ?? null,
      address: hotel.address ?? null,
      status: hotel.status ?? "active",
    },
  };
}

export interface HotelScope {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  userId: string | null;
  hotelId: string;
  hotel: { id: string; name: string; currency: string };
  staffId: string | null;
  staffName: string;
}

/**
 * Resolves the hotel of the current org together with a Supabase client.
 *
 * Lighter than requireAuth(): it does not require an active staff profile, so
 * it suits reports/uploads and other org-scoped reads. Throws a plain Error —
 * callers wrap it in their own try/catch.
 */
export async function getHotelScope(): Promise<HotelScope> {
  const { orgId, userId } = await auth();
  if (!orgId) throw new Error("Not authenticated");

  const supabase = await createClient();

  const [hotelResult, staffResult] = await Promise.all([
    supabase
      .from("hotels")
      .select("id, name, currency")
      .eq("clerk_org_id", orgId)
      .single(),
    userId
      ? supabase
          .from("staff_profiles")
          .select("id, full_name")
          .eq("clerk_user_id", userId)
          .eq("clerk_org_id", orgId)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const hotel = hotelResult.data;
  if (!hotel) throw new Error("Hotel not found");

  return {
    supabase,
    orgId,
    userId: userId ?? null,
    hotelId: hotel.id,
    hotel: { id: hotel.id, name: hotel.name, currency: hotel.currency ?? "GHS" },
    staffId: staffResult.data?.id ?? null,
    staffName: staffResult.data?.full_name ?? "System",
  };
}

/**
 * Like requireAuth() but also enforces a minimum role level.
 *
 * @param minRole  Minimum role required to proceed
 * @param action   Human-readable action name for the error message
 *
 * @example
 *   const ctx = await requireMinRole("manager", "cancel bookings");
 */
export async function requireMinRole(
  minRole: StaffRole,
  action: string
): Promise<AuthContext> {
  const ctx = await requireAuth();

  const userLevel = ROLE_LEVEL[ctx.role] ?? 0;
  const requiredLevel = ROLE_LEVEL[minRole] ?? 0;

  if (userLevel < requiredLevel) {
    throw new AuthError(
      `Role '${ctx.role}' cannot ${action}. Requires '${minRole}' or higher.`,
      "FORBIDDEN"
    );
  }

  return ctx;
}

/**
 * Non-throwing role check — returns true/false.
 * Use to gate conditional UI data returned from server actions.
 */
export function canPerformAction(role: StaffRole, minRole: StaffRole): boolean {
  return (ROLE_LEVEL[role] ?? 0) >= (ROLE_LEVEL[minRole] ?? 0);
}

/**
 * Convert an AuthError (or any error) to a standard server-action failure response.
 *
 * @example
 *   } catch (err) {
 *     return toActionError(err);
 *   }
 */
export function toActionError(err: unknown): { success: false; error: string } {
  if (err instanceof AuthError) {
    return { success: false, error: err.message };
  }
  return {
    success: false,
    error: err instanceof Error ? err.message : "An unexpected error occurred",
  };
}
