import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const schema = z.object({
  endpoint: z.string().url(),
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

  try {
    const ctx = await requireAuth();
    const { data: row } = await supabaseAdmin
      .from("push_subscriptions")
      .select("staff_id, disabled_at")
      .eq("endpoint", endpoint)
      .maybeSingle();

    const activeForCurrentStaff = Boolean(
      row && row.staff_id === ctx.staffId && !row.disabled_at
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
    const ctx = await requireAuth();
    const payload = schema.parse(await request.json());
    const now = new Date().toISOString();

    // Writes go through the admin client: the endpoint UNIQUE constraint is
    // per-device, so on a shared browser a second staff account must be able
    // to take over the row that RLS would silently block them from updating.
    // Auth is already verified via requireAuth above.
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid subscription payload" },
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
    const ctx = await requireAuth();
    const { endpoint } = z
      .object({ endpoint: z.string().url() })
      .parse(await request.json());
    // Scope to the authenticated staff member so one account cannot disable
    // another's registration on a shared device.
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .update({ disabled_at: new Date().toISOString() })
      .eq("endpoint", endpoint)
      .eq("staff_id", ctx.staffId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
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
