# RoomLine Security & Payments Remediation Plan (Agent Handoff Blueprint)

> **Companion to:** [`AUDIT_REPORT.md`](./AUDIT_REPORT.md)
> **Scope:** Complete implementation specification for all **6 BLOCKER (`BLK-01`..`BLK-06`)** and **10 HIGH (`HIGH-01`..`HIGH-10`)** findings, plus critical lint/CI blockers (`MED-10`) so all verification gates pass cleanly.

---

## 0. Locked-In Product & Business Decisions (Read First)

1. **Paystack Split Fee-Bearer Rule (`BLK-02` — Confirmed by Product Owner):**
   - **When a platform fee IS configured (`platformFeeMinor > 0`):** RoomLine **bears Paystack's 1.95% Ghana processing fee** out of RoomLine's commission (`bearer: "account"`).
     - *Example (4% platform fee on a GHS 1,000.00 = `100,000` pesewa booking):*
       - `transaction_charge: 4000` (`GHS 40.00`), `bearer: "account"`, `subaccount: "ACCT_..."`.
       - Hotel subaccount receives **GHS 960.00** (`96,000p`) net.
       - Paystack deducts its **1.95% fee (`1,950p` = GHS 19.50)** from RoomLine's `4,000p` share → RoomLine nets **GHS 20.50** (`2,050p`).
     - **CRITICAL PAYSTACK CONSTRAINT TO ENFORCE:** Under `bearer: "account"`, if `transaction_charge` is **less than Paystack's 1.95% processing fee** (`ceil(totalMinor * 0.0195)`), Paystack rejects `POST /transaction/initialize` with **`400 Bad Request` (Invalid Split Configuration)**. Therefore:
       1. In `/platform/settings` (`app/platform/(protected)/settings/_actions.ts` + `settings-client.tsx`), if `feeType === "percentage"` and `feePercent > 0`, **reject `feePercent < 2.0` (or `< 1.95`, recommend minimum `2.0%`, e.g. `2.0%–50.0%`)** with a clear message explaining that RoomLine absorbs Paystack's `1.95%` processing fee out of the platform percentage, so a non-zero percentage fee must exceed `1.95%` (`0%` remains valid for "no platform fee").
       2. In `computePlatformFeeMinor()` (`lib/platform/fees.ts`), for `feeType === "flat"` (or any rounding edge case where `0 < fee < Math.ceil(totalMinor * 0.0195)`): if `fee > 0` and `fee < Math.ceil(totalMinor * 0.02)`, **either omit `transaction_charge` & `bearer` for that small booking (taking `0` cut so the guest checkout still succeeds!) OR clamp/document it** — **never** send `bearer: "account"` with `transaction_charge < Math.ceil(totalMinor * 0.0195)` or checkout will 400!
   - **When platform fee is ZERO (`platformFeeMinor === 0`):** Omit **both** `transaction_charge` and `bearer` (leaving subaccount `percentage_charge: 0` untouched), so Paystack applies its standard 0%-main-account rule (hotel subaccount bears the 1.95% fee) and checkout succeeds. Update the misleading comment in `lib/paystack.ts:178-182` to reflect this exact contract.

2. **Live Database Safety (`BLK-04`):**
   - Hosted Supabase project: `wtgldgyxtpbzjmaygeif` (PostgreSQL `17.6.1.155`, `eu-west-1`).
   - `.env.local` is currently in **Paystack test mode (`sk_test_…`)**, and `wtgldgyxtpbzjmaygeif` currently contains active test data (`Sweet Garden Hotel` + 80 bookings + 72 payments).
   - **DO NOT delete existing hotels, bookings, or payments in `wtgldgyxtpbzjmaygeif`!** Implement `BLK-04` via schema + runtime `paystack_domain` (`'test' | 'live'`) isolation and provide a standalone, opt-in SQL cleanup script (`scripts/prelaunch-purge-test-data.sql`) for the human operator to run only when switching to `sk_live_…`.

---

## 1. Environment & Codebase Rules (Save Time — Do Not Re-Discover)

- **Package Manager:** `pnpm@10.32.1` (`pnpm install`, `pnpm run typecheck`, `pnpm exec vitest run`, `pnpm run build`).
- **Next.js 16.x Conventions:**
  - Middleware is `proxy.ts` in repo root (NOT `middleware.ts`). Read `node_modules/next/dist/docs/` before changing Next.js APIs.
  - Builds use **Turbopack** (`next build`).
- **HeroUI React v3:** If touching UI components, check `./.heroui-docs/react` per `AGENTS.md`.
- **Supabase Workflow:**
  - Direct port-5432 CLI (`npx supabase migration list --linked`) times out on this network.
  - Use the **Supabase MCP** (`supabase_apply_migration`, `supabase_execute_sql`, `supabase_get_advisors`, `supabase_deploy_edge_function`) against `project_id: "wtgldgyxtpbzjmaygeif"`.
  - **1:1 Migration Parity Rule:** Whenever you apply a migration via `supabase_apply_migration`, look up the exact `version` assigned in `supabase_migrations.schema_migrations` (`SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 3;`) and write the **exact same SQL** to `supabase/migrations/<version>_<name>.sql` so local files and remote DB stay 100% identical! Then regenerate or update `types/database.types.ts` if columns changed (`supabase_generate_typescript_types`).
- **Secret Hygiene:** Never print raw values from `.env.local` or `vault.decrypted_secrets`. Redact any prefix as `first4…`.
- **Knowledge Graph:** After finishing code modifications, run `graphify update .` if installed (per `AGENTS.md`).

---

## 2. Workstream-by-Workstream Implementation Spec

### Workstream 1 — Upgrade Vulnerable Dependencies & Fix Lint Gate (`BLK-01`, `MED-10`)

#### 1A. `BLK-01` (`package.json` + `pnpm-lock.yaml`)
- **Verified Compatible Patched Versions on npm:**
  - `"next": "16.4.6"` (fixes Critical RCEs `GHSA-2xp9-vwfh-vxw4`, `GHSA-2464-fhr4-w9xw`, `GHSA-vcvr-r3jv-pc5j`, `GHSA-673q-mjm6-r5xr`, High SSRF `GHSA-cjq9-62q9-8jv4`, High DoS `GHSA-p3m5-59mp-jv5r`)
  - `"eslint-config-next": "16.4.6"` (in `devDependencies`)
  - `"@sentry/nextjs": "^10.78.0"` (fixes Critical Middleware Bypass `GHSA-mchm-gjx6-7h55` in `<10.75.2` without jumping to v11 breaking changes)
  - `"zod": "^4.6.7"` (fixes High DoS `GHSA-mrhx-c7xc-m3w5`)
  - `"sharp": "^0.35.5"` (fixes High `CVE-2026-96889 / GHSA-wq5f-xc86-pv6w` & `GHSA-rgj7-g3m4-5g8c`)
  - Add `"pnpm": { "overrides": { ... } }` in `package.json` (preserving any existing pnpm settings) for transitive advisories if still flagged by `pnpm audit --prod`:
    - `"tar": ">=7.5.23"`, `"brace-expansion": ">=5.0.13"`, `"browserslist": ">=4.29.5"`, `"baseline-browser-mapping": ">=2.11.36"`, `"glob": ">=14.0.6"`, `"minimatch": ">=11.0.8"`, `"source-map-js": ">=1.2.2"`, `"nanoid@<3.3.18": ">=3.3.20"`, `"fast-uri@>=3.0.0 <3.1.9": ">=3.1.9"`.
- **Verify:** Run `pnpm install` then `pnpm audit --prod` → must exit `0` (or `0 critical, 0 high`).

#### 1B. `MED-10` (`eslint.config.mjs`, `app/[slug]/_components/booking-wizard.tsx:595`, `components/payouts/payouts-panel.tsx:76-79`)
- In `eslint.config.mjs:27-48`, add `.opencode/**`, `.codex/**`, `.fallow/**`, `.kiro/**`, `.zcode/**`, `supabase/**` to `globalIgnores` so bare `pnpm run lint` finishes in seconds instead of timing out after 300s.
- Fix the React Compiler `react-hooks/preserve-manual-memoization` error in `app/[slug]/_components/booking-wizard.tsx:589-595` (compute `phonePlaceholder` directly or depend on primitive `selectedCountryCode` cleanly).
- Fix the `react-hooks/exhaustive-deps` & unused `setOwnRange` warning in `components/payouts/payouts-panel.tsx:76-82` (wrap `effective` in `React.useMemo`).

---

### Workstream 2 — Paystack Splits, Mode Isolation, Payouts Pagination & Webhook Events (`BLK-02`, `BLK-04`, `BLK-06`, `HIGH-04`)

#### 2A. `BLK-06` — Fix Payouts Pagination (`lib/paystack.ts:358-422`)
- **Bug:** In `listSettlements` (`lib/paystack.ts:380`) and `listSettlementTransactions` (`lib/paystack.ts:418`), `if (rows.length < perPage) break;` exits the `for` loop straight into `throw new Error("Paystack ... pagination exceeded the safety limit...")` because `return all;` is missing!
- **Fix:** Replace `if (rows.length < perPage) break;` with `if (rows.length < perPage) return all;` in **both** functions.
- **Test:** Add unit tests in `tests/paystack.test.ts` testing: empty `[]` settlements, 1-page settlements, 2-page settlements (`perPage` boundary), and exceeding `MAX_PAGES` throwing the safety error.

#### 2B. `BLK-02` — Explicit `bearer: "account"` + Safe Fee Floor (`lib/paystack.ts`, `lib/platform/fees.ts`, `app/platform/(protected)/settings/*`, `bookings/route.ts`, `retry-payment/route.ts`)
- Define constant `PAYSTACK_GHANA_FEE_BPS = 195` (`1.95%`) and `MIN_PLATFORM_FEE_PERCENT = 2` (`2.0%` minimum when percentage fee `> 0`, so RoomLine never configures a fee below Paystack's 1.95% charge) in `lib/platform/fees.ts`.
- In `app/platform/(protected)/settings/_actions.ts:51-64` (and UI hint/validation in `settings-client.tsx`):
  - Allow `feePercent === 0` (no platform fee).
  - If `input.feeType === "percentage" && input.feePercent > 0 && input.feePercent < 2`, return `{ success: false, error: "Percentage fee must be 0% or at least 2.0% (RoomLine absorbs Paystack's 1.95% fee from this cut)." }`, and cap upper bound at `<= 95` so hotel subaccount always receives a positive payout.
- In `computePlatformFeeMinor(config, totalMinor, currency)` (`lib/platform/fees.ts:67-85`):
  - Compute `minViableFeeMinor = Math.ceil((totalMinor * 195) / 10_000) + 1` (at least 1 pesewa above Paystack's 1.95% fee so Paystack never 400-rejects `bearer: "account"` due to rounding!).
  - If `fee > 0 && fee < minViableFeeMinor`, return `0` (safe fallback on tiny/flat-fee bookings: omit `transaction_charge` so guest checkout succeeds rather than failing with Paystack 400!).
  - Also cap `fee` at `Math.max(0, totalMinor - 100)` so the hotel subaccount receives at least GHS 1.00 (`100p`).
- In `app/api/booking/[slug]/bookings/route.ts:485-500, 852-865` and `app/api/booking/[slug]/bookings/[reference]/retry-payment/route.ts:191-205, 364-377`:
  - When `platformFeeMinor > 0`, pass `{ transaction_charge: platformFeeMinor, bearer: "account" }`.
  - When `platformFeeMinor === 0`, omit both `transaction_charge` and `bearer`.
- Update `lib/paystack.ts:171-183` docblocks to accurately document both cases, and add unit tests in `tests/` for `computePlatformFeeMinor` + `initializeTransaction` payload shapes (`0%`, `1%` rejected/clamped, `4%` on GHS 1,000 → `transaction_charge: 4000, bearer: "account"`).

#### 2C. `BLK-04` — Test vs Live Mode (`paystack_domain`) Isolation
- Add helper `getPaystackMode(): "live" | "test"` in `lib/paystack.ts`:
  - Inspect `process.env.PAYSTACK_SECRET_KEY`: starts with `"sk_live_"` → `"live"`, else `"test"`.
- Update `createSubaccount` & `updateSubaccount` & `VerifiedPaystackTransaction` in `lib/paystack.ts` to type and return `domain?: "test" | "live" | string`.
- In SQL migration (Workstream 3):
  - Add `paystack_domain text CHECK (paystack_domain IS NULL OR paystack_domain IN ('test', 'live'))` to `public.hotels`.
  - Backfill existing `hotels` rows where `paystack_subaccount_code IS NOT NULL AND paystack_domain IS NULL` to `'test'` (since `wtgldgyxtpbzjmaygeif` has only ever run with `sk_test_…`).
- In `app/actions/paystack.ts` (`savePaystackBankAccount`):
  - Persist `paystack_domain: result.domain === "live" ? "live" : getPaystackMode()`.
  - If `hotel.paystack_subaccount_code` exists **and** `hotel.paystack_domain && hotel.paystack_domain !== getPaystackMode()` (e.g., hotel had a `'test'` subaccount and platform just switched to `'live'`), call `createSubaccount(...)` instead of `updateSubaccount(oldTestCode, ...)` so re-onboarding in live mode mints a fresh live `ACCT_...` instead of 404ing on the old test code!
  - Also write `writeAuditLog` with `"hotel.paystack_configured"` (`MED-04`).
- In `app/[slug]/_lib/get-public-hotel.ts`, `app/[slug]/page.tsx:204`, `bookings/route.ts:289-300, 657-668`, and `retry-payment/route.ts:64, 79`:
  - Select `paystack_domain` alongside `paystack_subaccount_code`.
  - Define `isUsableSubaccount(hotel)` = `Boolean(hotel.paystack_subaccount_code) && (hotel.paystack_domain == null || hotel.paystack_domain === getPaystackMode())`.
  - When `hotel.paystack_domain !== getPaystackMode()`, `hasPaystack` is `false` (guest checkout gracefully degrades to `pay_later_only` instead of throwing 500, and `/dashboard/settings/payments` shows a clear banner prompting the manager to reconnect their live payout account).
- In `app/api/webhooks/paystack/route.ts` and `app/api/booking/[slug]/payments/verify/route.ts`:
  - Check `txn.domain`: if `typeof txn.domain === "string" && txn.domain !== getPaystackMode()`, log/capture a security issue and refuse to settle (`400` / permanent rejection).
- Write `scripts/prelaunch-purge-test-data.sql` (commented, transactional, NOT auto-executed) for manual execution right before switching to `sk_live_…`.

#### 2D. `HIGH-04` — Paystack Dispute & Refund Webhook Handling + Paid Cancellation Guard
- In `app/api/webhooks/paystack/route.ts:152-156`:
  - Instead of ignoring all non-`charge.success` events, branch on `event.event`:
    1. `charge.success`: existing settlement flow.
    2. `charge.dispute.create`, `charge.dispute.remind`, `charge.dispute.resolve`:
       - Extract `data.transaction?.reference` (or `data.transaction_reference`), look up `payments` (`paystack_reference` or anchor prefix `like '<ref>::%'`) → resolve `hotel_id` and `booking_id`.
       - Capture a high/fatal Sentry issue (`scope: "paystack-webhook"`) and call `alertOncePerBooking` (with dedupe key `dispute:${event.event}:${disputeId}`) to notify active hotel staff (`onlyRoles: ["super_admin", "manager"]` if supported, or hotel staff) with urgent copy noting Paystack's 16-hour dispute response window. Return `200 { received: true }`.
    3. `refund.pending`, `refund.processing`, `refund.needs-attention`, `refund.processed`, `refund.failed`:
       - Extract `data.transaction_reference` (or `data.transaction?.reference`) and `data.amount` (subunits) + `data.currency`.
       - On `refund.needs-attention` or `refund.failed`: alert hotel staff + Sentry issue for manual action in Paystack Dashboard.
       - On `refund.processed`: atomically record/reconcile the refund in DB (via a new `SECURITY DEFINER` `service_role`-only RPC `record_paystack_refund_atomic` that inserts an idempotent compensating/refund record or updates `payments.status = 'refunded'` when full refund and recalculates `bookings.amount_paid` / `bookings.payment_status = 'refunded' | 'partial'`, plus notifies staff).
    4. Any other event (e.g., `ping`): return `200 { received: true }`.
- In `app/actions/bookings.ts` (`updateBookingStatus`, `lines 772-955`):
  - Select `payment_status, amount_paid, currency` on `before`.
  - If `status === "cancelled"` and `Number(before.amount_paid ?? 0) > 0`:
    - Require `canPerformAction(ctx.role, "manager")` (front-desk staff must escalate paid cancellations to a manager!) **and** fire an in-app staff review notification (`dedupe_key: "cancel-paid-review:" + bookingId`) reminding management to process any applicable refund per the hotel's cancellation policy.

---

### Workstream 3 — Database Security, Ledger Classification & Reconciliation Migration (`BLK-03`, `HIGH-01`, `HIGH-03`, `HIGH-08` SQL)

Create and apply **one atomic, well-commented SQL migration** (via `supabase_apply_migration` + matching `supabase/migrations/<version>_security_and_payment_audit_fixes.sql`):

1. **`BLK-04` Column:**
   - `ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS paystack_domain text CHECK (paystack_domain IS NULL OR paystack_domain IN ('test', 'live'));`
   - `UPDATE public.hotels SET paystack_domain = 'test' WHERE paystack_subaccount_code IS NOT NULL AND paystack_domain IS NULL;`

2. **`HIGH-08` (SQL) — Exclude `role = 'pending'` From Tenant Access Helpers & Revoke Unneeded RPC Grant:**
   - Update `public.get_user_hotel_ids()` and `public.get_user_clerk_org_ids()` so both include `AND sp.role IS DISTINCT FROM 'pending'` alongside `AND sp.is_active = true`. (Verify `staff_profiles` self-read for `/dashboard/staff/pending` or `getCurrentUserRole` still works: add a targeted `PERMISSIVE SELECT` policy `staff_profiles_self_select` `USING (clerk_user_id = ((SELECT auth.jwt()) ->> 'sub'))` on `public.staff_profiles` so a pending user's own profile lookup in `lib/auth.ts` / `staff/pending` works without exposing the entire org's `hotels`, `bookings`, `guests`, or `payments`!)
   - `REVOKE EXECUTE ON FUNCTION public.generate_booking_reference(uuid, text) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.generate_booking_reference(uuid, text) TO service_role;` (clears Security Advisor warning on `generate_booking_reference`).

3. **`BLK-03` — PostgREST Column Guards & `booking_nights` RLS + Hide `paystack_account_number`:**
   - **`public.booking_nights`:** Add `RESTRICTIVE` policy:
     ```sql
     CREATE POLICY booking_nights_insert_requires_manager
       ON public.booking_nights AS RESTRICTIVE FOR INSERT TO authenticated
       WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));
     ```
   - **`public.bookings` Trigger (`guard_bookings_client_write`):**
     - Allow unrestricted writes when `v_trusted_srv` is true (`service_role` / `postgres` / `supabase_admin` with no `authenticated`/`anon` JWT — use the exact same `v_trusted_srv` predicate as `guard_notification_client_update` in `20261112064346`!).
     - When `NOT v_trusted_srv`:
       - On `INSERT`: `RAISE EXCEPTION 'Bookings must be created through the server booking workflow' USING ERRCODE = '42501';` (both guest `POST /api/booking/...` and staff `createBooking` / `createBookingGroup` already write through `create_booking_atomic` on `supabaseAdmin`!).
       - On `UPDATE`: reject (`ERRCODE = '42501'`) if **any** financial or identity column changed: `id`, `hotel_id`, `reference`, `guest_id`, `room_type_id`, `check_in`, `check_out`, `nights`, `rooms_count`, `room_rate`, `subtotal`, `tax_amount`, `total_amount`, `amount_paid`, `outstanding_balance`, `currency`, `payment_status`, `payment_preference`, `source`, `rate_plan_id`, `group_id`, `initiated_payment_refs`, `channel_provider`, `external_booking_id`, `created_by`, `created_at` (date/room-type moves already go through `reprice_booking_stay` on `supabaseAdmin`! Staff direct updates only touch `status`, `check_in_at`, `check_out_at`, `cancelled_at`, `cancellation_reason`, `room_id`, `internal_notes`, `special_requests`, `adults`, `children`, `estimated_arrival` — verify every `.from("bookings").update(...)` in `app/` before finalizing the allowed list!). Also validate `ALLOWED_BOOKING_TRANSITIONS` when `NEW.status IS DISTINCT FROM OLD.status`!
   - **`public.hotels` Trigger (`guard_hotels_client_update`) & Payout Account Privacy:**
     - Check every `.from("hotels").update(...)` in `app/`:
       - Switch `app/actions/paystack.ts` (`savePaystackBankAccount` & `updatePaymentPolicy`) to write via `supabaseAdmin` *after* `getPaymentConfigContext()` (`requireMinRole("manager")`) succeeds.
       - In `guard_hotels_client_update` (`BEFORE UPDATE ON public.hotels`), when `NOT v_trusted_srv`:
         - Block edits to `id`, `slug`, `custom_domain`, `clerk_org_id`, `status`, `paystack_subaccount_code`, `paystack_bank_code`, `paystack_account_number`, `paystack_business_name`, `paystack_settlement_schedule`, `paystack_domain`, `created_at`.
         - Require `public.user_role_at_least(OLD.id, 'super_admin')` for all remaining profile/settings/branding updates (`app/actions/settings.ts`, `app/actions/notification-templates.ts`, `app/actions/upload.ts` all require `super_admin`!).
     - For `paystack_account_number` read privacy: check if any client component selects `*` from `hotels` via browser `createClient()`. Grep `from("hotels")` across `app/`, `components/`, `lib/`, `hooks/`! If only server code (`app/actions/paystack.ts`, `payouts.ts`, `dashboard/payments/page.tsx`) reads `paystack_account_number` and switches to `supabaseAdmin`, you can `REVOKE SELECT (paystack_account_number) ON public.hotels FROM anon, authenticated;` (verify PostgREST explicit column lists in server actions don't break—none select `*` on `hotels` with anon/auth except what you inspect!).

4. **`HIGH-01` — Online Payment `method = 'paystack_link'`:**
   - In `public.settle_online_payment_atomic` and `public.settle_online_group_payment_atomic`, change the `INSERT INTO public.payments (... method ...)` literal from `'card'` to `'paystack_link'`.
   - Also update existing online Paystack rows in `public.payments` (`UPDATE public.payments SET method = 'paystack_link' WHERE paystack_reference IS NOT NULL AND method = 'card';`) so existing Payment Activity views immediately reconcile! (Check `supabase/tests/settle_online_payment_atomic.sql` and `settle_online_group_payment_atomic.sql` to update any assertion expecting `method = 'card'`.)

5. **`HIGH-03` — Extend `reconcile_pending_payments()` Across the Full 24h Window Including Timed-Out Holds:**
   - Update `public.reconcile_pending_payments()` to drive from `public.payment_attempts pa JOIN public.bookings b ON b.id = pa.booking_id AND b.hotel_id = pa.hotel_id JOIN public.hotels h ON h.id = pa.hotel_id`:
     - Match `pa.status = 'initialized'`, `pa.created_at > now() - interval '24 hours'`, `COALESCE(pa.initialized_at, pa.created_at) <= now() - interval '3 minutes'`, and `(b.status = 'pending' OR (b.status = 'cancelled' AND b.cancellation_reason = 'payment_timeout'))`!
     - Pass an internal header `x-reconcile-worker-secret` (reading `push_worker_secret` from `vault.decrypted_secrets`) on `net.http_get(...)`, and in `app/api/booking/[slug]/payments/verify/route.ts:35`, skip the guest `10/min` IP rate-limiter when `x-reconcile-worker-secret` matches `process.env.PUSH_WORKER_SECRET` (using constant-time comparison)!

---

### Workstream 4 — Secret Rotation & Edge Function Hardening (`BLK-05`)

1. Generate a fresh 32-byte hex secret via Node `crypto.randomBytes(32).toString("hex")` (do **not** print it to stdout/chat!).
2. Update:
   - `.env.local` (`PUSH_WORKER_SECRET="<new>"` — read/write via a local Node script without printing the value),
   - Production Supabase Vault (`vault.secrets` where `name = 'push_worker_secret'` — note: check `vault.update_secret(id, new_secret)` in SQL without echoing the secret, or instruct user if Vault key permissions restrict SQL updates),
   - Supabase Edge Function secret (`npx supabase secrets set PUSH_WORKER_SECRET=... --project-ref wtgldgyxtpbzjmaygeif` — check CLI access; if CLI token is unavailable, note it clearly for user's 1-line command before deploying the updated Edge Function!).
   - *Important:* Only rotate the live Vault/Edge secret **if** you can update **both** Vault and the Edge Function secret together so `trigger_push_delivery_worker()` and `deliver-push-notifications` never fall out of sync! If Edge Function env secrets cannot be updated from your token scope, keep them in sync and output a single wizard/command for the user to rotate both atomically.
3. In `supabase/functions/deliver-push-notifications/index.ts:182-185`:
   - Replace `request.headers.get("authorization") !== \`Bearer \${expected}\`` with a constant-time byte comparison (`crypto.subtle` / `timingSafeEqual` from `node:crypto` in Deno 2) and redeploy via `supabase_deploy_edge_function` (`verify_jwt: false` preserved since it uses custom Bearer secret).
4. In `supabase/migrations/20260821170005_schedule_push_delivery.sql`:
   - Do **not** alter historical migration checksums if avoidable, or replace the hardcoded secret with a dummy local placeholder + comment noting git history rotation (`git filter-repo` advisory if repo is ever made public).

---

### Workstream 5 — Transactional Email Header & HTML Escaping (`HIGH-02`, `HIGH-06`)

1. **`HIGH-02` (`lib/notifications/resend.ts:34-42, 73-85` & `.env.example:51`):**
   - In `getFromAddress()` (`lib/notifications/resend.ts:34-42`), parse `"Display <addr@domain.com>"` if angle brackets are present so it extracts the clean `addr@domain.com` email, strip `[\r\n<>"]`, and validate the email format.
   - In `sendEmailViaResend` (`line 77`), sanitize `params.hotelName.replace(/[\r\n"<>]/g, " ").trim()`.
   - Redact `params.to` in `console.info` / `console.error` (`lines 81, 103, 108, 119`) so guest PII emails are never written to server stdout logs (`MED-08` bonus).
   - Update `.env.example:51` to `RESEND_FROM_ADDRESS="bookings@your-domain.com"`.
2. **`HIGH-06` (`lib/notifications/email-templates.ts:14-139` & `tests/email-templates.test.ts`):**
   - Add `export function escapeHtml(value: string): string` (`&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`, `'` → `&#39;`).
   - Escape **all** interpolated fields in `buildConfirmationEmail` and `buildCancellationEmail` (`hotelName`, `firstName`, `room.name`, `room.occupancy`, `booking.roomName`, `booking.reference`, `booking.checkIn`, `booking.checkInTime`, `booking.checkOut`, `booking.checkOutTime`, `booking.hotelAddress`, `booking.hotelPhone`, `currency`).
   - Add unit tests in `tests/email-templates.test.ts` verifying `<script>`, `<a href=...>`, and quote characters in `guestName`, `hotelName`, and `roomName` are escaped.

---

### Workstream 6 — App Security, RBAC, Clerk Sync, Open Redirect & Platform Admin MFA (`HIGH-05`, `HIGH-07`, `HIGH-08` App, `HIGH-09`, `HIGH-10`)

1. **`HIGH-05` — Web Push SSRF & Cross-Tenant Overwrite (`app/api/push/subscriptions/route.ts`):**
   - Validate `payload.endpoint`: parse `new URL(endpoint)`, require `url.protocol === "https:"`, reject IP literals / `localhost`, and require `url.hostname` to match official Web Push service domains (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`, `*.push.apple.com`, `*.googleapis.com`).
   - Require `requireMinRole("read_only", "manage push notifications")` instead of bare `requireAuth()`.
   - Before upserting on `endpoint`, check if an existing `push_subscriptions` row has a **different** `hotel_id` — if so, reject with `403` rather than silently moving another hotel's subscription row!

2. **`HIGH-07` — Clerk Webhook Role Preservation (`app/api/webhooks/clerk/route.ts:148-223`):**
   - In `organizationMembership.created` (`lines 149-176`): also select `role, is_active` on `existingStaff`. If `existingStaff` already exists, preserve `existingStaff.role` (unless `rawRole === 'org:admin'`, which upgrades to `'super_admin'`) and `existingStaff.is_active` so Svix webhook redeliveries never reactivate a deactivated user or clobber a custom role!
   - In `organizationMembership.updated` (`lines 208-223`): fetch existing `staff_profiles.role` for `(clerk_user_id, clerk_org_id)`.
     - If `rawRole === 'org:admin'`, set `role = 'super_admin'`.
     - If `rawRole !== 'org:admin'`, **only** change `role` to `'front_desk'` if the existing DB role was `'super_admin'` (admin demoted in Clerk); if existing role is `'manager'`, `'front_desk'`, `'read_only'`, or `'pending'`, leave `role` untouched!

3. **`HIGH-08` (App) — Centralize `is_active = true` & `role <> 'pending'` Across All Server Actions & Routes:**
   - In `lib/auth.ts`:
     - In `requireAuth()` (`lines 105-126`): reject both `!staff || !staff.is_active` **and** `staff.role === "pending"` (`throw new AuthError("Your account is pending approval.", "FORBIDDEN")`).
     - In `getHotelScope()` (`lines 155-190`): verify all callers (`grep getHotelScope`), and require an active non-`pending` `staff_profiles` row there too!
   - Replace hand-rolled `getHotelScopedClient()` / `getSuperAdmin()` helpers that forgot `.eq("is_active", true)` or role checks in:
     - `app/actions/staff.ts` (`getPendingStaff` → `requireMinRole("super_admin")`; `getPendingStaffCount` → return `0` unless `super_admin`; `approveStaff` / `rejectStaff` / `toggleStaffActive` / `changeStaffRole` → use `requireMinRole("manager")` / `requireMinRole("super_admin")`)
     - `app/actions/settings.ts` (`getHotelProfile` / `updateHotelProfile` → `requireMinRole("super_admin")`; `getNotificationPrefs` / `updateNotificationPrefs` → `requireMinRole("read_only")`)
     - `app/actions/notification-templates.ts` (`requireMinRole("super_admin")`)
     - `app/actions/integrations.ts` (`requireMinRole("read_only")`)
     - `app/actions/bookings-detail.ts` (`getFullBookingDetail` → `requireMinRole("read_only")`; `updateBookingNotes` → `requireMinRole("front_desk")`)
     - `app/dashboard/calendar/actions.ts` (`getCalendarData`, `checkRoomAvailability` → `requireMinRole("read_only")`!)

4. **`HIGH-09` — Platform Auth Open Redirect & Sign-Out CSRF (`app/platform/auth/confirm/route.ts` & `sign-out/route.ts`):**
   - In `app/platform/auth/confirm/route.ts:16-18`:
     ```ts
     const _next = searchParams.get("next");
     const next = _next && /^\/(?!\/|\\)/.test(_next) && _next.startsWith("/platform")
       ? _next
       : "/platform/dashboard";
     ```
   - In `app/platform/auth/sign-out/route.ts` + `app/platform/(protected)/dashboard/_sign-out.tsx` + `app/platform/(protected)/layout.tsx:60`:
     - Add `export async function POST(request: NextRequest)` to `app/platform/auth/sign-out/route.ts` for normal sign-outs.
     - Keep `GET` **only** for same-origin unauthorized fallback redirects from `app/platform/(protected)/layout.tsx:60` (`sec-fetch-site` not `"cross-site"`, and verify the caller is *not* an active `platform_admins` member before signing out on `GET`, returning `405` if an active admin hits `GET` cross-site!).

5. **`HIGH-10` — Platform Super-Admin MFA Enrollment & Enforcement:**
   - Enable `[auth.mfa.totp] enroll_enabled = true` and `verify_enabled = true` in `supabase/config.toml:302-304` (and `password_requirements = "lower_upper_letters_digits"` at line 185).
   - Add TOTP MFA enrollment/verification UI & challenge support in `/platform/settings` (and `/platform/sign-in` when `nextLevel === 'aal2'`) using Supabase Auth `supabase.auth.mfa.{enroll,challenge,verify,getAuthenticatorAssuranceLevel}`.
   - In `app/platform/(protected)/_guard.ts` (`assertPlatformAdmin`): check `mfa_factors` for the admin user—once the admin has at least one verified MFA factor (or when `PLATFORM_REQUIRE_MFA !== "false"` after enrollment), require `claims.aal === "aal2"` so a stolen password alone can never mutate `platform_settings` or `hotels.status`! (Document the 2-click Supabase Dashboard toggle for Leaked Password Protection + MFA enrollment in the final summary since Management API Auth settings require Dashboard access.)

---

## 3. Mandatory Verification Gate Before Declaring Done

Run and confirm **all** of the following pass:
1. `pnpm audit --prod` → `0` critical and `0` high vulnerabilities.
2. `pnpm run typecheck` → `0` TypeScript errors.
3. `pnpm run lint` → `0` errors (completes without hanging).
4. `pnpm exec vitest run` → all existing 640+ tests plus new regression tests pass (`paystack` pagination, `bearer: "account"` + 2% floor, HTML email escaping, Clerk webhook role preservation, open-redirect guard).
5. `pnpm run test:tooling` → `4/4` pass.
6. `pnpm run build` → clean production Turbopack build.
7. `supabase_get_advisors` (`security` + `performance`) on `wtgldgyxtpbzjmaygeif` → verify `generate_booking_reference` warning is resolved and no new RLS/function warnings were introduced.
8. Verify local `supabase/migrations/` files match `supabase_migrations.schema_migrations` 1-for-1.
9. Run `graphify update .` if installed.
