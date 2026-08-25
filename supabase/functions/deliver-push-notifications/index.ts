import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const MAX_ATTEMPTS = 7;

interface OutboxJob {
  id: string;
  notification_id: string;
  recipient_staff_id: string;
  attempt_count: number;
  delivered_subscription_ids: string[];
  notifications: { title: string; message: string; booking_id: string | null } | null;
}

interface PushSub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

Deno.serve(async (request) => {
  const expected = Deno.env.get("PUSH_WORKER_SECRET");
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!supabaseUrl || !serviceRoleKey || !vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    return Response.json({ error: "Push worker is not configured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  // Atomically claim due jobs; SKIP LOCKED makes overlapping invocations safe.
  const { data: jobs, error } = await supabase.rpc("claim_push_jobs", { p_limit: 50 });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let delivered = 0;

  for (const job of (jobs ?? []) as OutboxJob[]) {
    const payload = JSON.stringify({
      title: job.notifications?.title ?? "RoomLine",
      body: job.notifications?.message ?? "",
      notificationId: job.notification_id,
      url: job.notifications?.booking_id ? `/dashboard/bookings/${job.notifications.booking_id}` : "/dashboard",
    });

    const alreadyDone = new Set(job.delivered_subscription_ids ?? []);

    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("staff_id", job.recipient_staff_id)
      .is("disabled_at", null);

    let lastError: string | null = null;
    let unresolved = false;
    let attemptedAny = false;

    for (const sub of (subscriptions ?? []) as PushSub[]) {
      if (alreadyDone.has(sub.id)) continue;
      attemptedAny = true;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 86400, urgency: "normal" }
        );
        alreadyDone.add(sub.id);
      } catch (cause) {
        const status = (cause as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Endpoint gone or permanently expired: retire it and treat as resolved.
          await supabase
            .from("push_subscriptions")
            .update({ disabled_at: new Date().toISOString() })
            .eq("id", sub.id);
          alreadyDone.add(sub.id);
          continue;
        }
        if (status === 401 || status === 403) {
          // Push service rejected our VAPID signature or auth headers. This is
          // a server-side key/config problem, not a broken subscription — the
          // sub must stay active so delivery recovers once keys are fixed.
          lastError = `Push service rejected request (${status}). Check that the worker's VAPID_PUBLIC_KEY matches the public key used at subscribe time.`;
          unresolved = true;
          continue;
        }
        // Anything else (transient 4xx/5xx, network errors): keep the
        // subscription intact and fail the job so it retries.
        lastError = cause instanceof Error ? cause.message : String(cause);
        unresolved = true;
      }
    }

    const attempts = job.attempt_count + 1;

    const recipientHasSubs = (subscriptions ?? []).length > 0;
    if (!recipientHasSubs && !attemptedAny) {
      if (alreadyDone.size > 0) {
        // Every device already received this notification on an earlier
        // attempt and has since been disabled — the job is done, not stuck.
        await supabase
          .from("notification_delivery_outbox")
          .update({
            status: "delivered",
            delivered_at: new Date().toISOString(),
            attempt_count: attempts,
            last_error: null,
            delivered_subscription_ids: [...alreadyDone],
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        delivered++;
        continue;
      }
      // Recipient has no active subscriptions — nothing was delivered.
      // Route through the retry path instead of faking success so the job
      // can still land if the user subscribes within the backoff window.
      lastError = "No active push subscription for recipient";
      unresolved = true;
    }

    const doneIds = [...alreadyDone];

    if (!unresolved) {
      await supabase
        .from("notification_delivery_outbox")
        .update({
          status: "delivered",
          delivered_at: new Date().toISOString(),
          attempt_count: attempts,
          last_error: null,
          delivered_subscription_ids: doneIds,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      delivered++;
    } else {
      await supabase
        .from("notification_delivery_outbox")
        .update({
          status: attempts >= MAX_ATTEMPTS ? "dead_letter" : "retry",
          attempt_count: attempts,
          last_error: (lastError ?? "Delivery failed").slice(0, 1000),
          next_attempt_at: new Date(Date.now() + Math.min(3600, 2 ** attempts * 30) * 1000).toISOString(),
          delivered_subscription_ids: doneIds,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
  }

  return Response.json({ processed: jobs?.length ?? 0, delivered });
});
