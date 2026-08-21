import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const MAX_ATTEMPTS = 7;
Deno.serve(async (request) => {
  const expected = Deno.env.get("PUSH_WORKER_SECRET");
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return new Response("Unauthorized", { status: 401 });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
  const { data: jobs, error } = await supabase.from("notification_delivery_outbox").select("id, notification_id, recipient_staff_id, attempt_count, notifications(title,message,booking_id)").in("status", ["pending", "retry"]).lte("next_attempt_at", new Date().toISOString()).limit(50);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  let delivered = 0;
  for (const job of jobs ?? []) {
    const { data: subscriptions } = await supabase.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("staff_id", job.recipient_staff_id).is("disabled_at", null);
    let success = false; let lastError = "No active push subscription";
    for (const sub of subscriptions) try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title: job.notifications.title, body: job.notifications.message, notificationId: job.notification_id, url: job.notifications.booking_id ? `/dashboard/bookings/${job.notifications.booking_id}` : "/dashboard" }), { TTL: 86400, urgency: "normal" });
      success = true;
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : String(cause);
      const status = (cause as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await supabase.from("push_subscriptions").update({ disabled_at: new Date().toISOString() }).eq("endpoint", sub.endpoint);
    }
    const attempts = job.attempt_count + 1;
    await supabase.from("notification_delivery_outbox").update(success ? { status: "delivered", delivered_at: new Date().toISOString(), attempt_count: attempts, last_error: null } : { status: attempts >= MAX_ATTEMPTS ? "dead_letter" : "retry", attempt_count: attempts, last_error: lastError.slice(0, 1000), next_attempt_at: new Date(Date.now() + Math.min(3600, 2 ** attempts * 30) * 1000).toISOString() }).eq("id", job.id);
    if (success) delivered++;
  }
  return Response.json({ processed: jobs?.length ?? 0, delivered });
});
