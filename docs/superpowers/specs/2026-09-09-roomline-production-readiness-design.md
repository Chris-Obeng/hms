# RoomLine Production-Readiness Audit and Rollout Design

**Date:** 2026-09-09
**Status:** Approved direction

## Goal

Make current RoomLine branch and pending Supabase migrations safe, lean, reproducible, and ready for deployment to HotelOS. Preserve existing remote test data when practical. Do not trade correctness for TypeScript 7 adoption.

## Current State

HotelOS (`wtgldgyxtpbzjmaygeif`) is an active Supabase project in `eu-west-1` on PostgreSQL 17. It contains test data that may be lost, but preservation is preferred. Remote migration history has 71 entries through `20260830152038`; local history has 86 entries through `20260902170000`. Fifteen migrations are local-only. No remote-only migration exists.

Current pending chain cannot be pushed. `20260831020000_rate_plans.sql` expects `seasonal_rate_overrides.hotel_id`, but no earlier migration creates it. `20260831150000_privilege_parity.sql` checks privileges on absent override sequences without guarding their existence. Additional critical findings affect rate-plan restrictions, tenant consistency, broad grants, unbound Supabase client methods, and Paystack settlement atomicity.

TypeScript 7.0.2 is stable and supported by Next.js 16.3's CLI path, but current `typescript-eslint` supports only TypeScript `<6.1.0` and crashes under TypeScript 7. Production-safe target is exactly pinned `typescript@6.0.3` with no aliases.

## Chosen Approach

Use a forward-only repair and exact upgrade rehearsal. Back up remote state, repair only unapplied migrations plus branch-introduced application defects, replay the production migration path locally, validate all invariants, preview the remote push, then deploy. Never reset the linked remote.

Rejected alternatives:

- Remote reset is faster but loses data and hides upgrade-path defects.
- A paid Supabase branch gives stronger isolation but is unnecessary unless local remote-state rehearsal cannot reproduce platform behavior.

## Safety Boundary

Before mutation:

1. Discover every Supabase CLI command and flag through installed CLI `--help`.
2. Create timestamped, gitignored schema, roles, and data backups.
3. Capture migration ledger, extensions, policies, grants, function security attributes, advisors, row counts, and five known rate-schema objects.
4. Preserve unrelated working-tree changes.
5. Never edit migrations already applied remotely.
6. Never run `supabase db reset --linked`.
7. Stop deployment if any backup, replay, test, advisor, build, or dry-run gate fails.

## Database Repairs

### Migration compatibility

Repair the 15 unapplied migrations so both clean replay and remote-head upgrade work:

- Add `seasonal_rate_overrides.hotel_id`, backfill it through `seasonal_rates`, verify no orphan rows, enforce `NOT NULL`, and add tenant-consistent constraints before later migrations use it.
- Guard privilege checks for absent UUID-backed override sequences with `to_regclass`.
- Keep `20240101000850` idempotent; it fills only a ledger gap because the remote constraint already exists.
- Retain UUID override identifiers and remove assumptions about serial sequences.
- Test every migration from remote head and from an empty local database.

### Rate engine invariants

- Persist selected `rate_plan_id` on each booking.
- Use one authoritative rate plan through quote, restrictions, booking creation, booking nights, repricing, and audit.
- Enforce selected-plan closed-to-arrival, closed-to-departure, minimum-stay, and maximum-stay rules.
- Reject incomplete nightly resolver output rather than underquoting partial rows.
- Resolve configured weekend-day behavior explicitly; do not silently switch between hotel-configured and fixed Friday/Saturday rules.

### Tenant and financial integrity

- Add composite tenant relationships where rows contain both `hotel_id` and parent IDs, including booking nights and payments.
- Prevent cross-hotel parent references even when a caller supplies an authorized hotel ID.
- Require positive payment amounts and valid currency values at database boundary.
- Revoke authenticated direct financial-table inserts; expose secured RPCs only.

### Privileges and RLS

- Replace blanket default and object grants with explicit least-privilege grants.
- Revoke from `PUBLIC` where implicit access would survive role-specific revokes.
- Repair malformed quoted `search_path` values.
- Review each `SECURITY DEFINER` function for explicit authorization, safe path, intended owner, and minimum execute grants.
- Keep service-only no-policy tables deny-all, and align table grants with comments.
- Consolidate duplicate permissive policies when semantics are proven identical.
- Optimize repeated `auth.*` policy calls with scalar subqueries.
- Remove duplicate indexes only after definition equality is proven. Do not remove indexes solely because advisor statistics say unused.

## Paystack Repairs

### Atomic settlement

Create one locking, replay-safe PostgreSQL settlement RPC. It must:

1. Lock booking and matching payment attempt.
2. Validate hotel, booking, initialized reference, Paystack transaction ID, metadata, currency, amount, channel, and expected subaccount.
3. Insert the payment or load a conflicting row.
4. Verify complete conflict identity.
5. Reconcile incomplete prior side effects on duplicate delivery.
6. Accumulate integer minor-unit balance.
7. Transition booking and payment status atomically.
8. Return deterministic settlement outcome for webhook and browser verification.

Notifications remain outside database transaction and use a durable outbox so retries cannot duplicate delivery or falsely confirm an uncommitted booking.

### Holds and evidence

- Expiry and abort routines lock booking and inspect both projected balance and successful payment ledger.
- Partial holds receive an explicit expiry/reconciliation policy.
- Successful financial evidence must not disappear through booking cleanup cascade.
- Schedule reconciliation safely, with bounded batches and no self-rate-limit conflict.

### Intent and payout safety

- Create durable payment attempt before Paystack initialization, then attach provider response.
- Validate initiated references and expected subaccounts during settlement.
- Check every Supabase write after Paystack subaccount creation/update.
- Store durable pending reconciliation state when Paystack succeeds but local persistence fails.
- Require intended elevated role for payout-account replacement and mask stored account details in UI.
- Derive pay-now availability from both hotel policy and configured Paystack capability.
- Add request timeouts and stable client-safe provider errors.
- Use trusted canonical origin for callbacks.

## Application Repairs

- Invoke Supabase methods on their client receiver; never extract `.rpc` or `.from` unbound.
- Add explicit server-side capability and active-profile guards to calendar mutations and booking-note updates.
- Do not make every successful response wait for `flushSentry`; flush only captured-event paths or move delivery off critical path.
- Bound Night Audit drift results in SQL and return count separately.
- Clamp occupancy work to requested date intersection.
- Use hotel-local calendar date for default public pricing rather than UTC `toISOString()` day.
- Treat failed booking state update as failed settlement; never send confirmation before durable state succeeds.

## TypeScript and Tooling

- Replace compiler aliases with exactly pinned `typescript: "6.0.3"`.
- Remove `@typescript/native` and `@typescript/typescript6` aliases.
- Keep current `tsconfig.json`; it uses modern options compatible with TypeScript 6.
- Do not add `experimental.useTypeScriptCli`; Next.js 16.3 already enables CLI type checking.
- Reconsider TypeScript 7 only after `typescript-eslint` officially supports it and all gates pass without aliases or lint exceptions.

## Validation

### Migration gates

- Fresh local `supabase db reset` with all migrations.
- Remote-head local reconstruction, data restore, then application of exactly 15 pending migrations.
- Schema diff after replay must show no unexplained drift.
- pgTAP tests for RLS, grants, function execution, role hierarchy, cross-tenant references, rate restrictions, booking creation, repricing, and retention.
- Concurrency tests for overlapping bookings, partial payments, duplicate delivery, settlement/expiry race, and concurrent retries.

### Application gates

- Exact compiler identity check: package name `typescript`, version `6.0.3`, `bin.tsc` present.
- Type check, lint, full tests, production build.
- Real Supabase-client wrapper smoke tests to catch receiver binding defects.
- Paystack helper, webhook, verification, payout failure, and callback-origin tests.
- Booking, rate, calendar authorization, and tenant-isolation integration tests.

### Security and performance gates

- Supabase security and performance advisors before deployment and after deployment.
- No unexplained security warnings involving public execute, RLS, leaked tenant access, or service-only tables.
- Query plans for rate resolution, availability, booking creation, Night Audit, and settlement.
- Keep informational unused-index warnings unless workload evidence proves removal safe.

## Deployment

1. Recheck linked project identity and migration list.
2. Verify backup readability and retain its location.
3. Run `supabase db push --dry-run` and compare exact pending list.
4. Request explicit final confirmation because remote migration is outward-facing and hard to reverse.
5. Run `supabase db push` without seed data.
6. Regenerate remote TypeScript types.
7. Run smoke checks for public quote, booking, payment verification, webhook replay, rate restrictions, staff calendar mutation, and Night Audit.
8. Rerun migration list and advisors.
9. Report every applied migration, validation result, remaining accepted warning, and backup path.

## Rollback and Recovery

Schema changes should be additive before constraints become strict. Backfills must prove completeness before `NOT NULL` or validation. If deployment fails inside a migration transaction, diagnose and repair locally before any retry. If a migration partially commits because of non-transactional operations, use a reviewed forward repair migration; do not rewrite remote history blindly. Data restore is last resort and requires separate explicit confirmation.

## Success Criteria

- All 86 migrations replay cleanly from scratch and from remote head.
- No deterministic or data-dependent pending migration failure remains.
- Payment settlement is atomic, replay-safe, tenant-bound, and concurrency-tested.
- Selected rate plan remains consistent through pricing, restrictions, storage, and audit.
- Server actions enforce capabilities independently of UI.
- TypeScript, lint, tests, build, pgTAP, advisors, dry-run, and post-push smoke checks pass.
- Existing test data is preserved when compatible; any loss is reported exactly.
