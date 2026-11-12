import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireMinRole } from "@/lib/auth";
import { isAllowedWebPushEndpoint } from "@/lib/push-endpoint";
import { supabaseAdmin } from "@/lib/supabase/admin";

const schema = z.object({
  endpoint: z.string().url().refine(isAllowedWebPushEndpoint, {
    message: "Unsupported push service endpoint",
  }),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

// Public VAPID key for service-worker re-subscription (pushsubscriptionchange),
// plus optional authenticated ownership check (?endpoint=...) so shared
// front-desk browsers never display another staff member's subscription as active.
export async function GET(request: Request) {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) {
    return NextResponse.json(
      { success: false, error: "Push not configured" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint");
  if (!endpoint) {
    return NextResponse.json(
      { applicationServerKey: key },
      { headers: { "cache-control": "public, max-age=3600" } }
    );
  }

  if (!isAllowedWebPushEndpoint(endpoint)) {
    return NextResponse.json(
      {
        applicationServerKey: key,
        staffId: null,
        activeForCurrentStaff: false,
      },
      { headers: { "cache-control": "private, no-store" } }
    );
  }

  try {
    const ctx = await requireMinRole("read_only", "view push notification status");
    const { data: row } = await supabaseAdmin
      .from("push_subscriptions")
      .select("hotel_id, staff_id, disabled_at")
      .eq("endpoint", endpoint)
      .maybeSingle();

    const activeForCurrentStaff = Boolean(
      row &&
        row.hotel_id === ctx.hotelId &&
        row.staff_id === ctx.staffId &&
        !row.disabled_at
    );

    return NextResponse.json(
      {
        applicationServerKey: key,
        staffId: ctx.staffId,
        activeForCurrentStaff,
      },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json(
      {
        applicationServerKey: key,
        staffId: null,
        activeForCurrentStaff: false,
      },
      { headers: { "cache-control": "private, no-store" } }
    );
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireMinRole("read_only", "manage push notifications");
    const payload = schema.parse(await request.json());
    const now = new Date().toISOString();

    // Prevent cross-tenant takeover (`HIGH-05`): if this endpoint is already
    // registered to a different hotel, refuse with 403 rather than reassigning.
    const { data: existing } = await supabaseAdmin
      .from("push_subscriptions")
      .select("hotel_id")
      .eq("endpoint", payload.endpoint)
      .maybeSingle();

    if (existing && existing.hotel_id !== ctx.hotelId) {
      return NextResponse.json(
        { success: false, error: "Subscription belongs to another property" },
        { status: 403 }
      );
    }

    const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
      {
        hotel_id: ctx.hotelId,
        staff_id: ctx.staffId,
        endpoint: payload.endpoint,
        p256dh: payload.keys.p256dh,
        auth: payload.keys.auth,
        user_agent: request.headers.get("user-agent"),
        last_seen_at: now,
        expires_at: payload.expirationTime
          ? new Date(payload.expirationTime).toISOString()
          : null,
        disabled_at: null,
      },
      { onConflict: "endpoint" }
    );
    if (error) throw error;
    return NextResponse.json({ success: true, staffId: ctx.staffId });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: error.issues[0]?.message ?? "Invalid subscription payload",
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Subscription failed",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requireMinRole("read_only", "manage push notifications");
    const { endpoint } = z
      .object({
        endpoint: z.string().url().refine(isAllowedWebPushEndpoint, {
          message: "Unsupported push service endpoint",
        }),
      })
      .parse(await request.json());

    // Scope to the authenticated staff member AND hotel so one account cannot
    // disable another's registration.
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .update({ disabled_at: new Date().toISOString() })
      .eq("endpoint", endpoint)
      .eq("staff_id", ctx.staffId)
      .eq("hotel_id", ctx.hotelId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid unsubscribe payload" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unsubscribe failed",
      },
      { status: 400 }
    );
  }
}
