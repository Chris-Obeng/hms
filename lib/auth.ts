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
import type { StaffRole } from "@/lib/roles";
import { ROLE_LEVEL } from "@/lib/roles";
import { captureError, flushSentry, identifyStaff } from "@/lib/observability/sentry";

export type { StaffRole };

// ── Types ─────────────────────────────────────────────────────────

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
// ROLE_LEVEL lives in lib/roles.ts (shared with client UI gating).

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
    if (hotelResult.error) {
      throw new AuthError(`DB error fetching hotel: ${hotelResult.error.message}`, "HOTEL_NOT_FOUND");
    }
    throw new AuthError("Hotel not found for this organization", "HOTEL_NOT_FOUND");
  }

  const hotel = hotelResult.data;
  const staff = staffResult.data;

  if (!staff || !staff.is_active) {
    throw new AuthError("Your account is not active. Contact your manager.", "INACTIVE");
  }

  if (!staff.role || staff.role === "pending") {
    throw new AuthError("Your account is pending approval.", "FORBIDDEN");
  }

  // Attach the actor to every Sentry event raised later in this request. Only the
  // opaque staff id, the role and the tenant ids — never the staff member's name.
  identifyStaff({
    staffId: staff.id,
    userId,
    role: (staff.role ?? "pending") as StaffRole,
    hotelId: hotel.id,
    orgId,
  });

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
 * Enforces an active, non-pending `staff_profiles` membership (`HIGH-08`) so
 * deactivated or pending org members cannot read or mutate tenant data.
 */
export async function getHotelScope(): Promise<HotelScope> {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) throw new Error("Not authenticated");

  const supabase = await createClient();

  const [hotelResult, staffResult] = await Promise.all([
    supabase
      .from("hotels")
      .select("id, name, currency")
      .eq("clerk_org_id", orgId)
      .single(),
    supabase
      .from("staff_profiles")
      .select("id, full_name, role, is_active")
      .eq("clerk_user_id", userId)
      .eq("clerk_org_id", orgId)
      .single(),
  ]);

  const staff = staffResult.data;
  if (!staff || !staff.is_active) {
    throw new AuthError("Your account is not active. Contact your manager.", "INACTIVE");
  }
  if (!staff.role || staff.role === "pending") {
    throw new AuthError("Your account is pending approval.", "FORBIDDEN");
  }

  const hotel = hotelResult.data;
  if (hotelResult.error) throw new Error(`DB error fetching hotel: ${hotelResult.error.message}`);
  if (!hotel) throw new Error("Hotel not found");

  return {
    supabase,
    orgId,
    userId,
    hotelId: hotel.id,
    hotel: { id: hotel.id, name: hotel.name, currency: hotel.currency ?? "GHS" },
    staffId: staff.id,
    staffName: staff.full_name ?? "System",
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
 * Every unexpected failure is reported to Sentry here, because this is the one
 * funnel every staff-facing server action catches into: without it, a broken
 * action returns `{ success: false }`, the UI shows a toast, and nothing is
 * recorded anywhere. `AuthError` is excluded on purpose — an unauthenticated or
 * forbidden call is the guard working, not a defect.
 *
 * Async because it flushes before returning. A server action runs in the same
 * serverless invocation as the response, and the invocation can be frozen the
 * moment the action resolves — so a captured-but-unflushed event is simply lost.
 * The wait is bounded to 2s and only ever happens on a path that already failed.
 *
 * `action` is required rather than optional. When it was optional, call sites
 * omitted it and every failing action in the product collapsed into one Sentry
 * issue titled `server-action / unknown`, because `action` is also the
 * fingerprint. Making it required is what keeps one broken action equal to one
 * issue.
 *
 * @param err   The caught value.
 * @param meta  Call-site detail. `action` (e.g. "bookings.update") is the tag and
 *              the fingerprint; the ids are optional refinements.
 *
 * @example
 *   } catch (err) {
 *     return toActionError(err, { action: "bookings.create", hotelId });
 *   }
 */
export async function toActionError(
  err: unknown,
  meta: {
    action: string;
    hotelId?: string | null;
    orgId?: string | null;
    bookingId?: string | null;
    role?: StaffRole | null;
  }
): Promise<{ success: false; error: string }> {
  if (err instanceof AuthError) {
    return { success: false, error: err.message };
  }

  captureError(err, {
    scope: "server-action",
    level: "error",
    hotelId: meta.hotelId,
    orgId: meta.orgId,
    bookingId: meta.bookingId,
    role: meta.role,
    tags: { "action.name": meta.action },
    // Group by action rather than by message, so one broken action is one issue
    // however many different rows it fails on.
    fingerprint: ["server-action", meta.action],
  });

  await flushSentry();

  return {
    success: false,
    error: err instanceof Error ? err.message : "An unexpected error occurred",
  };
}
