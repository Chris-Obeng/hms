import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ endpoint: z.string().url(), expirationTime: z.number().nullable().optional(), keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }) });

// Public VAPID key for service-worker re-subscription (pushsubscriptionchange).
export async function GET() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return NextResponse.json({ success: false, error: "Push not configured" }, { status: 503 });
  return NextResponse.json(
    { applicationServerKey: key },
    { headers: { "cache-control": "public, max-age=3600" } }
  );
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const payload = schema.parse(await request.json());
    const supabase = await createClient();
    const { error } = await supabase.from("push_subscriptions").upsert({
      hotel_id: ctx.hotelId, staff_id: ctx.staffId, endpoint: payload.endpoint,
      p256dh: payload.keys.p256dh, auth: payload.keys.auth,
      user_agent: request.headers.get("user-agent"), last_seen_at: new Date().toISOString(),
      expires_at: payload.expirationTime ? new Date(payload.expirationTime).toISOString() : null, disabled_at: null,
    }, { onConflict: "endpoint" });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Subscription failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAuth();
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(await request.json());
    const supabase = await createClient();
    const { error } = await supabase.from("push_subscriptions").update({ disabled_at: new Date().toISOString() }).eq("endpoint", endpoint);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unsubscribe failed" }, { status: 400 });
  }
}
