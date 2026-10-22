# Durable business-date review

## Required deployment step (not run by the implementation agent)

Apply the forward migration `supabase/migrations/20261021223247_durable_business_date_close.sql` through the project's reviewed migration process. It depends only on earlier committed schema/money/role migrations, not the concurrent reporting migration. Reload PostgREST's schema cache (the migration issues `NOTIFY pgrst, 'reload schema'`). Regenerate database types after the database is migrated; the temporary RPC type seam is isolated in `durable-close.ts`.

Until that migration is present, the page and action surface an explicit setup error. There is no legacy-log success fallback.

On an **already migrated local database**, run:

```sh
docker exec -i -e PGPASSWORD=postgres supabase_db_RoomLine psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/tests/durable_business_date_close.sql
```

The SQL test rolls back its fixtures and injected failure trigger. It checks duplicate-key / advisory-lock invariants in one session, not actual parallel scheduling. Before release, rehearse two independent authenticated transactions closing the same hotel/date: hold the first transaction open after its RPC, start the second, verify it waits, commit the first, and verify the second returns the same receipt ID and original actor/notes with `replayed: true`. Also rehearse first-transaction rollback, then verify the waiting caller can create exactly one receipt.

## Contract

- The server requires active staff membership and an active property; a manager or super-admin closes. The database independently resolves the JWT subject's active staff row at the requested hotel and enforces the same role. Signed active-org claims narrow access when present; older sub-only Clerk Supabase templates still require explicit hotel membership. No actor identity or figures are accepted from a client.
- One append-only row per `(hotel_id, business_date)`. A transaction-scoped advisory lock serializes same-key closes, with a unique constraint as the final invariant. The RPC returns only after inserting the receipt; any insert/query error propagates. Authenticated users have no direct write privilege. Replays preserve the first timestamp, actor, notes and summary.
- Dates are real `YYYY-MM-DD`, from `2000-01-01` through the property's calendar date. New close requires a completed calendar day (strictly before the property current date); default view is yesterday in the property timezone. Invalid timezone or currency blocks the operation. The requested business date is never silently clamped to the clock date.
- One MVCC SQL aggregate captures all qualifying rows without the REST 1,000-row limit. Detail lists cap at 50 unresolved operations and 25 rate issues, with complete counts. Stay nights use `[check_in, check_out)` and statuses `checked_in` / `checked_out`. Successful collections use half-open local-midnight timestamp bounds, independently of stay dates.
- Room revenue is `booking_nights.rate_minor × rooms_count`, excluding tax. Every contributing stay must have complete, correctly dated, quantity/currency-matched nightly rows summing to its **net subtotal**. Missing records, unallocated discounts/adjustments and currency differences block close; the UI withholds partial totals. Reconstructed nightly-rate provenance is disclosed.
- Confirmed arrivals and checked-in departures due **on or before** the date must be resolved through their normal booking workflow. There is no exception override and close never pretends to resolve them.
- Closed dates read their saved summary, not current bookings/payments/rooms. Legacy audit rows are imported only from valid explicit `after_state.date`; `created_at` stays the actor timestamp. Earliest duplicate wins; invalid/missing dates stay in the source audit log. Legacy payloads are retained but their figures/exception handling are explicitly unverified.
- Inventory capacity is unavailable rather than inferred from current rooms. This workflow is an immutable **operational review**, not a complete accounting ledger: it does not post tax/room journal entries, advance a persisted accounting date, freeze booking/payment edits, net later refunds, or support reopening. Later source edits can differ from a closed review and do not silently rewrite it. A booking/payment writer committing after the snapshot is not part of that snapshot.

## Checks and remaining gates

Focused mocked-action and summary tests: `pnpm exec vitest run tests/night-audit-actions.test.ts tests/night-audit-durable-summary.test.ts`.

SQL tests and the two-session race require a running migrated local database. Test under the deployed Clerk token shape and application role, then rehearse after-midnight close, DST boundaries, error/retry behavior, source corrections after close, and tenant switching before rollout. Full accounting-day advancement/posting/reopening is deliberately outside this operational-review contract.
