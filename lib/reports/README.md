# Reporting data contract

The four server actions require `(startDate, endDate, { orgId, hotelId })` and keep
their existing DTO names. The expected scope is runtime-validated and must match
`requireMinRole`'s authenticated organization and hotel before any report reads,
including hotel settings. Missing scope (including old callers) fails closed.
All responses include `meta`: authenticated `orgId`, `hotelId`, `startDate`, `endDate`, `priorStartDate`,
`priorEndDate`, `timeZone`, `generatedAt`, and `warnings: string[]`.
Inputs must be valid, ordered `YYYY-MM-DD` dates, no later than hotel-local
today, spanning at most 366 inclusive dates. Invalid input is rejected, not
swapped, truncated or silently normalized.

The client checks server metadata against the active request before accepting a
result into its tenant/date/tab query cache, displaying it, or exporting it. CSV
tenant labels come from that metadata, never a client-stamped scope. Immediate
Clerk identity gating and cancellation of late results remain in place; cached
responses with missing or mismatched metadata cannot be displayed or exported.

## Room revenue and nights

- Qualifying statuses are **checked_in / checked_out**, never confirmed.
- Nights satisfy `check_in <= stay_date < check_out`, and `stay_date < today`.
  Today's incomplete night and future nights do not count as earned room revenue.
- Room KPI period-over-period deltas are **null** when the selected range includes
  property-local today: its incomplete night would shorten only the current
  earned span. Metadata warns that comparisons require a completed date range
  and an end date before today. Fully completed historical comparisons keep
  their existing calculations. Requested/current/prior dates, guest arrivals,
  collections and new-booking counts retain their original date-window semantics.
- These are **live stay-derived figures**, not an immutable posted folio ledger.
  Booking corrections and current statuses can change historical results.
- Full-stay `booking_nights.rate_minor * rooms_count` supplies the dated weights.
  `bookings.subtotal` supplies the authoritative **net room-only charge**.
  `total_amount` (tax-inclusive) and payments are never used as room revenue.
- Reconcile the full stay before clipping dates. Allocate the net subtotal in
  proportion to recorded weights. Integer division uses bigint intermediates;
  leftover minor units go to the largest fractional remainders, with ties ordered
  by date. For rates 100/300 and net subtotal 333.33, dates receive 83.33/250.00.
  A full-stay sum exactly equals the net subtotal. There is no separate discount
  field in this schema to subtract again.
- If **all** nightly snapshots are absent, use warned legacy equal-date
  allocation with chronological remainders (100/3 → 33.34, 33.33, 33.33).
  Partially recorded or inconsistent snapshots fail explicitly.
- Zero subtotals remain room-nights with zero revenue. There is no separate
  complimentary/house-use classification to infer or exclude.
- KPI totals, daily series, weekly trend and sources all consume the same facts.
  Source `pct` remains booking-count share; `roomNights` is added alongside the
  existing `source`, `count`, `revenue`, and `pct` fields.

## Historical inventory

Apply `20261021223243_reports_inventory_history.sql` before these room reports.
It captures one dated closing active-physical-room inventory map per hotel/day.
Private trigger functions capture room insert/delete/activation/type changes
and hotel creation/timezone changes. Hotel locks serialize room writers. The
migration briefly locks room/hotel tables for the initial baseline. Read access
is active-staff tenant-scoped; direct API writes and public function execution
are revoked.

`20261113223000_backfill_reports_inventory_history.sql` rebuilt the days before
each hotel's first capture once, from room creation dates (a room counts from
its property-local creation date; the hotel's creation date gets an empty map
when it came first). It ran only for hotels whose rooms still reproduce that
first capture: no room created by then is inactive now (deactivation dates are
not recorded), no audited edit by then changed a room's type, and the active
rooms match the per-type counts exactly. Other hotels keep their first capture
as the baseline. Rebuilt rows have a `captured_at` long after their
`effective_date`. Dates before a hotel's earliest row remain unknown, and the
report code still never derives past capacity from current rooms.

The denominator is **active physical inventory at day end**, retaining rooms in
maintenance/out-of-service and availability blocks. It is not operational
sellable inventory or an asserted external benchmarking standard. Within a day,
the last observed snapshot wins; past days carry forward to the next snapshot.
Different timezone baselines are not silently reinterpreted.

`occupancy`, `revpar`, `availableRoomNights`, room-type `capacity`/`occupancy`,
series `occupancy`/`revpar`, and daily `occupancy` can be **null**. A missing
baseline anywhere in the completed-night window makes the aggregate denominator
unavailable; known daily values remain usable. Today's daily denominator is
unavailable. Zero recorded capacity stays numerically zero, but its ratios are
null. Capacity warnings are included in metadata. Historical/current periods
each use their own dated capacity.

## Guests, receipts and balances

Unique identified **arrivals** in the period, with checked-in/out status, form
the guest cohort. Classification is at each guest's first arrival in the window:
repeat requires an earlier qualifying stay completed by that arrival. Concurrent
and multi-room bookings count once; a later return cannot retroactively change
the first window. Lifetime `total_stays` is never consulted. Nationality remains
the current profile attribute, explicitly disclosed.

Collections use successful payments by `paid_at` in half-open UTC boundaries
computed from the hotel timezone, including DST. They include deposits/tax and
are not room revenue or net-of-refund cash flow. New bookings use the same local
timestamp bounds and count all bookings created, including later cancellations.
Outstanding is the **current** positive tax-inclusive balance on pending,
confirmed, checked-in and checked-out bookings; it is not historical receivables.

## Failure, scale and access boundaries

Shared `requireMinRole("read_only")` requires active staff; hotel status must be
active. Hotel settings are explicitly read/validated rather than accepting auth
helper default currency. All monetary rows must match the hotel currency: no
implicit FX conversion. All required database errors/null results propagate.

Paginated reads use unique ascending ID cursors and exact remaining counts on
every page. Short pages do not imply completeness. Count changes, duplicate or
missing rows fail with a retry message. Each fact family is limited to 100,000
rows, 2,000 pages; IN lists use batches of 100. Reconciliation is limited to
100,000 full-stay nights per period and 3,660 nights per booking. Limits fail
explicitly instead of returning a partial report.

These paginated reads are not a database repeatable-read transaction. Concurrent
same-count edits across requests can still occur; reports are live operational
analytics, not a certified accounting-close snapshot. Migration trigger/RLS
integration and concurrency tests must be rehearsed on an approved local/staging
database before deployment. The migration has not been applied by this task.
