# RoomLine Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair RoomLine migration chain, payment settlement, tenant authorization, rate engine, and tooling; prove exact remote-head upgrade; deploy safely to HotelOS.

**Architecture:** Use forward-only, test-driven repairs. Keep financial state transitions in locking PostgreSQL RPCs, keep application wrappers thin, enforce tenant and role invariants at both server and database boundaries, and rehearse exact remote migration path locally before any push.

**Tech Stack:** Next.js 16.3, React 19, TypeScript 6.0.3, Supabase CLI/PostgreSQL 17/pgTAP, Paystack API, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-09-roomline-production-readiness-design.md`

## Global Constraints

- Preserve existing remote test data when compatible.
- Never run `supabase db reset --linked`.
- Never edit migrations already applied remotely.
- Discover Supabase CLI syntax with installed command `--help` before use.
- Pin `typescript` exactly to `6.0.3`; no compiler aliases.
- Keep unrelated working-tree changes intact.
- Use current Next.js docs from `node_modules/next/dist/docs/` and current provider docs before edits.
- Run `graphify query` before source exploration and `graphify update .` after code changes.
- No remote push until every local gate passes and user gives explicit final confirmation.
- Persist backups outside tracked source and verify readability before deployment.

---

## File Structure

- `supabase/migrations/20260830163000_reconcile_rate_table_drift.sql`: remote rate schema reconciliation, `hotel_id` backfill, path repairs.
- `supabase/migrations/20260831020000_rate_plans.sql`: plan schema, plan-aware constraints/backfills.
- `supabase/migrations/20260831150000_privilege_parity.sql`: explicit grants and guarded sequence checks.
- `supabase/migrations/20260831160000_booking_nights.sql`: tenant-consistent booking-night relationships.
- `supabase/migrations/20260901120000_create_booking_atomic.sql`: authoritative plan persistence and atomic booking flow.
- `supabase/migrations/20260902130000_rate_restrictions.sql`: selected-plan restriction enforcement.
- New unapplied migration created through `supabase migration new`: atomic online settlement, payment integrity, cleanup safety, and least privilege.
- `supabase/tests/*.sql`: pgTAP migration, RLS, rate, booking, and payment invariants.
- `lib/bookings/confirm-online-payment.ts`: thin Paystack verification-to-settlement adapter.
- `lib/bookings/create-booking-atomic.ts`, `lib/pricing/nightly-rates.ts`, `lib/bookings/stay-restrictions.ts`, `lib/pricing/rate-restrictions.ts`: receiver-bound Supabase wrappers.
- `lib/paystack.ts`: bounded requests and sanitized provider errors.
- `app/api/webhooks/paystack/route.ts`, verification and booking routes: replay-safe outcomes, trusted callbacks, critical-path observability.
- `app/actions/paystack.ts`: checked local persistence and payout authorization.
- Calendar and booking-detail actions: server capability enforcement.
- `package.json`, `pnpm-lock.yaml`: one exact TypeScript compiler.
- `tests/*.test.ts`: application and integration regression coverage.

### Task 1: Capture baseline and backup remote

**Files:**
- Create, gitignored: `$CLAUDE_JOB_DIR/tmp/roomline-remote-<timestamp>/manifest.txt`
- Modify only if missing ignore coverage: `.gitignore`

**Interfaces:**
- Produces: immutable backup directory path and baseline manifest consumed by Tasks 11-12.

- [ ] Run `supabase --version`, `supabase db dump --help`, `supabase migration list --help`, and `supabase db push --help`; save versions and chosen flags in manifest.
- [ ] Verify linked ref equals `wtgldgyxtpbzjmaygeif` using read-only CLI output.
- [ ] Dump remote schema, roles, and data into timestamped job directory. Do not use `--include-seed` or any reset command.
- [ ] Run PostgreSQL archive/list validation appropriate to produced dump format and record exit status.
- [ ] Capture migration list, advisors, row counts, extension versions, function grants, RLS policies, and rate-object shapes.
- [ ] Confirm `git status --short` shows no accidental backup files.

### Task 2: Fix TypeScript package identity

**Files:**
- Modify: `package.json:84-92`
- Modify: `pnpm-lock.yaml`
- Test: existing lint/type/build configuration

**Interfaces:**
- Produces: `require("typescript/package.json")` returning `{name:"typescript", version:"6.0.3", bin:{tsc:...}}`.

- [ ] Write a temporary identity assertion that exits nonzero unless package name, version, and `bin.tsc` match expected values; run it and verify current aliases fail.
- [ ] Replace aliases with exact dev dependency `"typescript": "6.0.3"`; remove `@typescript/native` and `@typescript/typescript6` aliases.
- [ ] Run `pnpm install --lockfile-only`, then `pnpm install --frozen-lockfile`.
- [ ] Run identity assertion, `pnpm exec tsc --version`, and `pnpm lint`.
- [ ] Commit only when user requests commits; otherwise record passing evidence.

### Task 3: Repair pending rate migration compatibility

**Files:**
- Modify: `supabase/migrations/20260830163000_reconcile_rate_table_drift.sql`
- Modify: `supabase/migrations/20260831020000_rate_plans.sql`
- Modify: `supabase/migrations/20260831150000_privilege_parity.sql`
- Test: create `supabase/tests/rate_schema_upgrade.sql`

**Interfaces:**
- Produces: `seasonal_rate_overrides.hotel_id uuid NOT NULL`; guarded sequence privilege logic; plan-aware override constraints.

- [ ] Add failing pgTAP assertions for column existence/type/nullability, backfill equality through `seasonal_rates`, tenant-consistent FK, UUID identifiers, absent sequences, and migration function/grant survival.
- [ ] Build a local database through remote head and run assertions; verify expected failures.
- [ ] In reconciliation migration, add nullable `hotel_id`, backfill from parent seasonal rate, raise on unresolved rows, set `NOT NULL`, and add FK/unique structure needed by rate plans.
- [ ] Replace unconditional absent-sequence privilege checks with `to_regclass(...) IS NULL OR has_sequence_privilege(...)` assertions.
- [ ] Update rate-plan migration ordering so no statement references `hotel_id` before reconciliation establishes it.
- [ ] Replay from empty database and remote-head fixture; run pgTAP both times.

### Task 4: Enforce authoritative rate-plan flow

**Files:**
- Modify: `supabase/migrations/20260831020000_rate_plans.sql`
- Modify: `supabase/migrations/20260831160000_booking_nights.sql`
- Modify: `supabase/migrations/20260901120000_create_booking_atomic.sql`
- Modify: `supabase/migrations/20260902120000_reprice_booking_stay.sql`
- Modify: `supabase/migrations/20260902130000_rate_restrictions.sql`
- Test: `supabase/tests/create_booking_atomic.sql`
- Test: create `supabase/tests/rate_plan_restrictions.sql`

**Interfaces:**
- Produces: booking-level authoritative `rate_plan_id`; same plan propagated to nights, pricing, restrictions, and repricing.

- [ ] Add failing tests selecting non-default plan with CTA, CTD, minimum-stay, and maximum-stay restrictions; assert booking stores selected plan and rejection uses selected plan only.
- [ ] Add failing test that resolver output has one row per requested night and errors on missing night.
- [ ] Persist selected plan in booking creation and carry it through restriction calls and inserted nights.
- [ ] Make repricing use stored plan unless authorized caller explicitly changes plan through defined interface.
- [ ] Make restriction trigger read stored plan, not independently chosen default plan.
- [ ] Run targeted pgTAP and full `supabase test db` suite.

### Task 5: Harden tenant integrity, RLS, grants, and definers

**Files:**
- Modify: `supabase/migrations/20260831150000_privilege_parity.sql`
- Modify: `supabase/migrations/20260831160000_booking_nights.sql`
- Modify pending migrations containing function grants/policies.
- Create through CLI: new migration `harden_pending_schema_security`
- Test: create `supabase/tests/tenant_integrity.sql`
- Test: create `supabase/tests/privilege_contract.sql`

**Interfaces:**
- Produces: explicit role/object privilege contract and composite tenant references.

- [ ] Add failing tests for forged cross-hotel `booking_nights`, payment parent mismatch, direct authenticated payment insertion, public definer execution, and service-only table access.
- [ ] Add composite unique parent keys and composite FKs for child `(parent_id, hotel_id)` pairs.
- [ ] Replace blanket `ALL` grants/default privileges with explicit SELECT/INSERT/UPDATE/DELETE/USAGE/EXECUTE grants required by actual clients.
- [ ] Revoke implicit `PUBLIC` execute before role-specific function grants.
- [ ] Set safe unquoted `search_path` and explicit authorization inside each retained `SECURITY DEFINER` function.
- [ ] Consolidate duplicate booking insert policies and optimize `auth.*` policy calls with scalar subqueries.
- [ ] Run pgTAP under anon, authenticated hotel A, authenticated hotel B, manager, admin, and service role contexts.

### Task 6: Build atomic replay-safe Paystack settlement

**Files:**
- Create through CLI: new migration `atomic_online_payment_settlement`
- Modify: `lib/bookings/confirm-online-payment.ts`
- Modify: `types/database.types.ts` only after local generation
- Test: create `supabase/tests/online_payment_settlement.sql`
- Test: `tests/payment-idempotency.test.ts`

**Interfaces:**
- Produces RPC `settle_online_payment_atomic(...)` returning stable outcome fields: `result`, `booking_id`, `amount_paid_minor`, `payment_status`, `booking_status`, `partial_payment`, `already_recorded`.
- Consumes verified Paystack transaction identity and expected booking intent.

- [ ] Add failing SQL tests for first settlement, exact replay, replay after simulated stale booking projection, reference collision, transaction-ID collision, wrong hotel, wrong currency, wrong amount, wrong subaccount, concurrent partials, and overpayment.
- [ ] Add failing Vitest tests proving duplicate delivery calls settlement and does not early-return before repair.
- [ ] Implement locking RPC: lock booking, validate durable payment attempt and identity, insert/load payment, reconcile balance from successful ledger, transition statuses, return deterministic result.
- [ ] Store money in integer minor units for comparison; convert only at typed boundaries if existing columns remain numeric major units.
- [ ] Replace split insert/RPC/update sequence in `recordOnlinePayment` with one bound RPC call.
- [ ] Ensure no confirmation notification runs unless RPC reports durable confirmed transition.
- [ ] Run SQL tests, payment Vitest suite, and concurrent transaction harness.

### Task 7: Make hold cleanup and payment evidence safe

**Files:**
- Modify pending hold/booking migrations or create forward pending migration through CLI.
- Modify: retry-payment route and reconciliation scheduling migration.
- Test: extend `supabase/tests/online_payment_settlement.sql`

**Interfaces:**
- Consumes atomic settlement ledger from Task 6.
- Produces ledger-aware `abort_unpaid_booking` and expiry behavior.

- [ ] Add failing tests for payment row with stale booking balance, partial hold expiry, expiry racing settlement, and booking deletion preserving financial evidence.
- [ ] Make abort/expiry lock booking and successful payment rows, reconcile projection, and refuse deletion when funds exist.
- [ ] Remove unsafe payment evidence cascade behavior using additive migration and explicit archival/cancellation semantics.
- [ ] Define partial-hold deadline policy and bounded reconciliation job schedule.
- [ ] Ensure reconciliation does not call an endpoint limited below batch throughput.
- [ ] Run targeted pgTAP plus full migration replay.

### Task 8: Fix Supabase wrapper binding and action authorization

**Files:**
- Modify: `lib/bookings/create-booking-atomic.ts`
- Modify: `lib/pricing/nightly-rates.ts`
- Modify: `lib/bookings/stay-restrictions.ts`
- Modify: `lib/pricing/rate-restrictions.ts`
- Modify: `app/dashboard/night-audit/actions.ts`
- Modify: `app/dashboard/calendar/actions.ts`
- Modify: `app/actions/bookings-detail.ts`
- Test: create `tests/supabase-wrapper-binding.test.ts`
- Test: extend action authorization tests

**Interfaces:**
- Produces receiver-safe wrapper calls and explicit `booking:edit`/calendar capability checks.

- [ ] Add real-client-shape tests whose methods require `this`; verify extracted method implementations fail.
- [ ] Add action tests for read-only, pending, inactive, and cross-hotel staff mutation attempts.
- [ ] Invoke `client.rpc(...)` and `client.from(...)` directly without extracting methods.
- [ ] Apply existing role/capability guards before calendar assignment/move/unassign and note updates.
- [ ] Run targeted tests and type check.

### Task 9: Harden Paystack edges and payout persistence

**Files:**
- Modify: `lib/paystack.ts`
- Modify: `app/actions/paystack.ts`
- Modify booking and retry routes
- Modify webhook and verification routes
- Modify booking wizard/payment verifier UI only where needed
- Test: `tests/paystack.test.ts`
- Create route/action integration tests

**Interfaces:**
- Produces bounded `paystackFetch` with timeout and sanitized `PaystackError`; durable payment-attempt tracking; checked payout persistence.

- [ ] Add failing tests for missing secret, timeout, provider body sanitization, untrusted callback origin, failed initiated-reference persistence, failed local subaccount persistence, no-Paystack policy state, mismatched confirmation references, and partial confirmation copy.
- [ ] Validate required runtime configuration before outbound calls and use bounded `AbortSignal.timeout` or controller compatible with project runtime.
- [ ] Map provider errors to stable public codes while sending sanitized diagnostics to Sentry.
- [ ] Create durable attempt before initialization and fail closed if attempt persistence fails.
- [ ] Use configured canonical app origin for callback URLs.
- [ ] Check every local write after Paystack mutation; persist reconciliation state when external mutation succeeded.
- [ ] Enforce intended elevated payout capability and mask account values.
- [ ] Run Paystack and route/action tests.

### Task 10: Remove application correctness and performance regressions

**Files:**
- Modify: public price resolver date helper
- Modify: availability, booking, webhook, and verification routes
- Modify: `app/dashboard/night-audit/actions.ts`
- Modify: `app/actions/pricing.ts`
- Test: targeted pricing, route, and Night Audit tests

**Interfaces:**
- Produces hotel-local default date, bounded drift query, clamped occupancy loop, and nonblocking clean success paths.

- [ ] Add timezone-boundary test where hotel local date differs from UTC date.
- [ ] Add tests proving successful routes do not call `flushSentry`, while captured-error branches do.
- [ ] Add large-drift test proving DB query returns at most 25 rows plus separate total.
- [ ] Add long-overlapping-stay test proving occupancy work is limited to requested range.
- [ ] Implement minimal fixes and run targeted tests.

### Task 11: Full local validation and exact upgrade rehearsal

**Files:**
- No production source unless failures expose scoped defects.
- Update backup manifest with results.

**Interfaces:**
- Consumes all prior tasks.
- Produces signed-off local validation evidence and exact dry-run migration list.

- [ ] Run clean full migration replay and all pgTAP tests.
- [ ] Reconstruct remote head locally, restore compatible test data, then apply exactly 15 pending migrations.
- [ ] Compare final schema to clean replay and explain every intentional difference.
- [ ] Generate local DB types and run type check against them without replacing remote types yet.
- [ ] Run `pnpm lint`, background `pnpm exec tsc --noEmit --incremental false`, `pnpm test`, and background `pnpm build`.
- [ ] Run security/performance advisors locally where supported and resolve unexplained release blockers.
- [ ] Run `graphify update .` and inspect changed graph output only for expected source relationships.
- [ ] Run `supabase db push --dry-run`; assert exact pending list and no seed.

### Task 12: Remote deployment and post-push proof

**Files:**
- Modify: `types/database.types.ts` from remote generation after push.
- Update durable deployment report path agreed with user.

**Interfaces:**
- Consumes backup path and all green Task 11 evidence.
- Produces deployed migration ledger, regenerated types, smoke-test evidence, and rollback notes.

- [ ] Present concise preflight: backup path, 15 migrations, data-impact summary, all gate results, and exact `db push` command.
- [ ] Obtain explicit user confirmation immediately before remote push.
- [ ] Reverify linked ref and rerun dry-run; stop on any drift.
- [ ] Run `supabase db push` without seed.
- [ ] Regenerate remote TypeScript types using existing `db:types` command and run type check.
- [ ] Smoke test public quote, booking creation, selected-plan restrictions, Paystack verification replay, tenant rejection, staff calendar mutation, and Night Audit.
- [ ] Rerun migration list and Supabase security/performance advisors.
- [ ] Report applied versions, row-count deltas, smoke results, accepted warnings, backup location, and any manual dashboard settings such as leaked-password protection.
