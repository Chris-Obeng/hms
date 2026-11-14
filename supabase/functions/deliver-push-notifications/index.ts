import { timingSafeEqual } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const MAX_ATTEMPTS = 7;

interface ClaimedOutboxJob {
  id: string;
  notification_id: string;
  recipient_staff_id: string;
  attempt_count: number;
  delivered_subscription_ids: string[];
}

interface NotificationRow {
  id: string;
  type: string | null;
  title: string;
  message: string;
  booking_id: string | null;
  archived_at: string | null;
}

interface PushSub {
  id: string;
  staff_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const HIGH_URGENCY_TYPES = new Set([
  "new_booking",
  "payment_received",
  "payment_failed",
  "booking_cancelled",
  "channel_conflict",
  "test_push",
]);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LEADING_EMOJI_RE = /^(?:⚠️|⚠|🔔|✅|❌|💳|📅)\s*/u;
const LEGACY_ONLINE_BOOKING_RE =
  /^([A-Z0-9-]{6,})\s*·\s*([^·]+?)\s*·\s*([^·]+?)\s*·\s*(\d{4}-\d{2}-\d{2})\s*(?:→|->)\s*(\d{4}-\d{2}-\d{2})$/i;
const LEGACY_STAFF_BOOKING_RE =
  /^([A-Z0-9-]{6,})(?:\s*·\s*(\d+\s+stays?))?\s+(?:added\s+)?by\s+(.+)$/i;
const LEGACY_ONLINE_PAYMENT_RE =
  /^Online payment of\s+([A-Z]{3})\s+([\d,.]+)\s+(?:for\s+([^()]+?)\s+)?(confirmed|recorded|\(balance:\s*([\d,.]+)\))$/i;
const UNFORMATTED_MONEY_RE = /\b([A-Z]{3})\s+(\d{4,}(?:\.\d{1,2})?)\b/g;
const ISO_RANGE_RE = /(\d{4}-\d{2}-\d{2})\s*(?:→|->|to)\s*(\d{4}-\d{2}-\d{2})/gi;

function shortIsoDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  return `${MONTHS[m - 1]} ${d}`;
}

function formatStaySpan(checkIn: string, checkOut: string): string {
  const startMs = Date.parse(`${checkIn}T00:00:00Z`);
  const endMs = Date.parse(`${checkOut}T00:00:00Z`);
  const nights =
    Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.max(1, Math.round((endMs - startMs) / 86_400_000))
      : null;
  const base = `${shortIsoDate(checkIn)} – ${shortIsoDate(checkOut)}`;
  return nights ? `${base} (${nights} night${nights === 1 ? "" : "s"})` : base;
}

function formatMoneyAmount(val: number, code: string): string {
  return `${code.toUpperCase()} ${val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatMoneyText(text: string): string {
  return text.replace(UNFORMATTED_MONEY_RE, (_m, code: string, num: string) => {
    const val = Number(num);
    if (!Number.isFinite(val)) return _m;
    return formatMoneyAmount(val, code);
  });
}

function nextBackoffIso(attempts: number): string {
  return new Date(Date.now() + Math.min(3600, 2 ** attempts * 30) * 1000).toISOString();
}

function buildPushCopy(notif: NotificationRow | undefined): {
  title: string;
  body: string;
  url: string;
  urgency: "high" | "normal";
} {
  if (!notif) {
    return {
      title: "Oriel update",
      body: "Open Oriel to view the latest front-desk update.",
      url: "/dashboard",
      urgency: "normal",
    };
  }

  let title = (notif.title || "Hotel update").replace(LEADING_EMOJI_RE, "").trim();
  let body = (notif.message || "").trim();

  const legacyOnline = body.match(LEGACY_ONLINE_BOOKING_RE);
  if (legacyOnline) {
    const [, , guest, room, checkIn, checkOut] = legacyOnline;
    if (/^new (?:online )?booking/i.test(title)) {
      title = `New booking — ${guest.trim() || "Guest"}`;
    }
    body = `${room.trim()} · ${formatStaySpan(checkIn, checkOut)}`;
  } else {
    const legacyStaff = body.match(LEGACY_STAFF_BOOKING_RE);
    if (legacyStaff) {
      const [, , stays, actor] = legacyStaff;
      const actorClean = actor.trim().toLowerCase() === "staff" ? null : actor.trim().split(/\s+/)[0];
      if (/^new booking created$/i.test(title)) {
        title = "New desk booking";
      }
      body = [
        stays ? stays.replace(/\bstays\b/i, "rooms").replace(/\bstay\b/i, "room") : null,
        actorClean ? `Added by ${actorClean}` : "Added at the front desk",
      ]
        .filter(Boolean)
        .join(" · ");
    } else {
      const legacyPay = body.match(LEGACY_ONLINE_PAYMENT_RE);
      if (legacyPay) {
        const [, currency, rawAmount, roomsPart, statusPart, rawBalance] = legacyPay;
        const amountNum = Number(rawAmount.replace(/,/g, ""));
        const formattedAmount = Number.isFinite(amountNum)
          ? formatMoneyAmount(amountNum, currency)
          : `${currency} ${rawAmount}`;

        if (rawBalance) {
          const balNum = Number(rawBalance.replace(/,/g, ""));
          const balFormatted = Number.isFinite(balNum)
            ? formatMoneyAmount(balNum, currency)
            : `${currency} ${rawBalance}`;
          title = `Part payment — ${formattedAmount}`;
          body = [roomsPart?.trim(), `Online payment · ${balFormatted} left to pay`]
            .filter(Boolean)
            .join(" · ");
        } else {
          title = `Payment received — ${formattedAmount}`;
          body = [
            roomsPart?.trim(),
            statusPart.toLowerCase() === "confirmed"
              ? "Online payment · Paid in full"
              : "Online payment recorded",
          ]
            .filter(Boolean)
            .join(" · ");
        }
      }
    }
  }

  title = formatMoneyText(title);
  body = formatMoneyText(
    body.replace(ISO_RANGE_RE, (_m, ci: string, co: string) => formatStaySpan(ci, co))
  )
    .replace(/booking status is "([^"]+)"/gi, (_m, st: string) => `booking is ${st.replace(/_/g, " ")}`)
    .replace(/Money recorded — review manually\./gi, "The payment is saved — open the booking to review.");

  let url = "/dashboard";
  if (notif.booking_id) {
    url = `/dashboard/bookings/${notif.booking_id}`;
  } else if (notif.type === "staff_access_request") {
    url = "/dashboard/staff";
  }

  return {
    title,
    body: body || "Tap to view details in Oriel.",
    url,
    urgency: notif.type && HIGH_URGENCY_TYPES.has(notif.type) ? "high" : "normal",
  };
}

function isAllowedPushEndpoint(rawEndpoint: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawEndpoint);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== "443") return false;
  const host = parsed.hostname.toLowerCase();
  return (
    host === "fcm.googleapis.com" ||
    host.endsWith(".push.services.mozilla.com") ||
    host.endsWith(".notify.windows.com") ||
    host.endsWith(".push.apple.com") ||
    host.endsWith(".googleapis.com")
  );
}

function verifyBearerToken(
  authHeader: string | null,
  expectedSecret: string | undefined
): boolean {
  if (!authHeader || !expectedSecret) return false;
  const secret = expectedSecret.trim();
  if (!secret) return false;
  const encoder = new TextEncoder();
  const actual = encoder.encode(authHeader);
  const expected = encoder.encode(`Bearer ${secret}`);
  if (actual.byteLength !== expected.byteLength) return false;
  return timingSafeEqual(actual, expected);
}

Deno.serve(async (request) => {
  const expected = Deno.env.get("PUSH_WORKER_SECRET");
  if (!verifyBearerToken(request.headers.get("authorization"), expected)) {
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
  const { data: rawJobs, error } = await supabase.rpc("claim_push_jobs", { p_limit: 50 });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const jobs = (rawJobs ?? []) as ClaimedOutboxJob[];
  if (jobs.length === 0) {
    return Response.json({ processed: 0, delivered: 0 });
  }

  const requeueBatchOnTransientError = async (reason: string) => {
    const nowIso = new Date().toISOString();
    await Promise.all(
      jobs.map((job) => {
        const attempts = job.attempt_count + 1;
        return supabase
          .from("notification_delivery_outbox")
          .update({
            status: attempts >= MAX_ATTEMPTS ? "dead_letter" : "retry",
            attempt_count: attempts,
            last_error: reason.slice(0, 1000),
            next_attempt_at: nextBackoffIso(attempts),
            locked_at: null,
            updated_at: nowIso,
          })
          .eq("id", job.id);
      })
    );
  };

  // Batch-load both notifications AND active push subscriptions in parallel.
  // Checking errors on both guarantees a transient PostgREST hiccup never sends
  // blank generic copy or mistakes a failed query for "no subscriptions".
  const notifIds = [...new Set(jobs.map((j) => j.notification_id))];
  const staffIds = [...new Set(jobs.map((j) => j.recipient_staff_id))];

  const [notifRes, subsRes] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, title, message, booking_id, archived_at")
      .in("id", notifIds),
    supabase
      .from("push_subscriptions")
      .select("id, staff_id, endpoint, p256dh, auth")
      .in("staff_id", staffIds)
      .is("disabled_at", null),
  ]);

  if (notifRes.error || subsRes.error) {
    const errMsg =
      notifRes.error?.message ?? subsRes.error?.message ?? "Batch lookup failed";
    await requeueBatchOnTransientError(`Lookup error: ${errMsg}`);
    return Response.json({ error: errMsg }, { status: 500 });
  }

  const notifById = new Map<string, NotificationRow>();
  for (const row of (notifRes.data ?? []) as NotificationRow[]) {
    notifById.set(row.id, row);
  }

  const subsByStaffId = new Map<string, PushSub[]>();
  for (const sub of (subsRes.data ?? []) as PushSub[]) {
    const bucket = subsByStaffId.get(sub.staff_id);
    if (bucket) bucket.push(sub);
    else subsByStaffId.set(sub.staff_id, [sub]);
  }

  let delivered = 0;

  for (const job of jobs) {
    const notif = notifById.get(job.notification_id);
    const attempts = job.attempt_count + 1;
    const nowIso = new Date().toISOString();

    // If the notification was already cleared/archived in-app before push ran,
    // settle the outbox job silently without buzzing the staff member's device.
    if (notif?.archived_at) {
      await supabase
        .from("notification_delivery_outbox")
        .update({
          status: "delivered",
          delivered_at: nowIso,
          attempt_count: attempts,
          last_error: null,
          locked_at: null,
          updated_at: nowIso,
        })
        .eq("id", job.id);
      delivered++;
      continue;
    }

    const pushCopy = buildPushCopy(notif);
    const payload = JSON.stringify({
      title: pushCopy.title,
      body: pushCopy.body,
      tag: `roomline-notif-${job.notification_id}`,
      notificationId: job.notification_id,
      type: notif?.type ?? null,
      url: pushCopy.url,
    });

    const alreadyDone = new Set(job.delivered_subscription_ids ?? []);
    const subscriptions = subsByStaffId.get(job.recipient_staff_id) ?? [];

    let lastError: string | null = null;
    let unresolved = false;
    let attemptedAny = false;

    for (const sub of subscriptions) {
      if (alreadyDone.has(sub.id)) continue;
      if (!isAllowedPushEndpoint(sub.endpoint)) {
        // Defense-in-depth SSRF guard: retire any non-allowlisted push endpoint.
        await supabase
          .from("push_subscriptions")
          .update({ disabled_at: nowIso })
          .eq("id", sub.id);
        alreadyDone.add(sub.id);
        continue;
      }
      attemptedAny = true;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 86400, urgency: pushCopy.urgency }
        );
        alreadyDone.add(sub.id);
      } catch (cause) {
        const status = (cause as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Endpoint gone or permanently expired: retire it and treat as resolved.
          await supabase
            .from("push_subscriptions")
            .update({ disabled_at: nowIso })
            .eq("id", sub.id);
          alreadyDone.add(sub.id);
          continue;
        }
        if (status === 401 || status === 403) {
          lastError = `Push service rejected request (${status}). Check that the worker's VAPID_PUBLIC_KEY matches the public key used at subscribe time.`;
          unresolved = true;
          continue;
        }
        lastError = cause instanceof Error ? cause.message : String(cause);
        unresolved = true;
      }
    }

    if (subscriptions.length === 0 && !attemptedAny) {
      // Confirmed 0 active push subscriptions (query succeeded). Settle cleanly.
      await supabase
        .from("notification_delivery_outbox")
        .update({
          status: "delivered",
          delivered_at: nowIso,
          attempt_count: attempts,
          last_error: null,
          locked_at: null,
          delivered_subscription_ids: [...alreadyDone],
          updated_at: nowIso,
        })
        .eq("id", job.id);
      delivered++;
      continue;
    }

    const doneIds = [...alreadyDone];

    if (!unresolved) {
      await supabase
        .from("notification_delivery_outbox")
        .update({
          status: "delivered",
          delivered_at: nowIso,
          attempt_count: attempts,
          last_error: null,
          locked_at: null,
          delivered_subscription_ids: doneIds,
          updated_at: nowIso,
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
          next_attempt_at: nextBackoffIso(attempts),
          locked_at: null,
          delivered_subscription_ids: doneIds,
          updated_at: nowIso,
        })
        .eq("id", job.id);
    }
  }

  return Response.json({ processed: jobs.length, delivered });
});
