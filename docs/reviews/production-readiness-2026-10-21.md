# RoomLine production-readiness and PMS-conventions review

Date: 2026-10-21 (Africa/Accra)
Baseline: `533396d` on `main`; reviewed pending application changes and relevant untracked report/PWA components and tests.
Decision: **Request changes. Do not approve this snapshot for production financial reporting.**

> Historical pre-fix review. Implementation and later verification results are recorded in `docs/reviews/production-readiness-follow-up-2026-10-22.md`. Findings and line references below describe the original reviewed snapshot, not the subsequently corrected code.

## Scope and evidence

Reviewed reporting actions/math/UI, dashboard occupancy changes, landing-page changes, the offline route/document, service-worker caching, related configuration, and supporting authentication, money, booking-night schema, booking creation and night-audit code. Used the existing Graphify graph for navigation, then checked source files. This is not an exhaustive audit of every booking/payment integration or the deployed database.

Application code was not modified. This report is the only intentional workspace addition. Private environment/configuration contents were not inspected. No database writes, migrations, purchases, dependency installs, commits or deployments were performed.

The requested `image-to-code` skill was loaded. Its image-generation/implementation workflow is not applicable to this read-only technical review; no redesign or generated visual reference is claimed.

Findings below distinguish defects in the reviewed implementation from existing issues discovered while checking PMS behavior. Examples are derived from the code; the report math could not be executed successfully in the incomplete local dependency environment.

## High-priority findings

### F1 — Tax-inclusive totals feed room-revenue KPIs

**Priority:** P1. Existing gross-total behavior is retained and now feeds the new explicit ADR/RevPAR KPIs.

**Evidence:** `app/dashboard/reports/actions.ts:25-26,90-101`; `lib/reports/bi-math.ts:75-83`.

The report fetches `total_amount`, not `subtotal`, tax breakdowns or nightly room amounts. Booking creation explicitly calculates total as room subtotal plus tax in `supabase/migrations/20260901120000_create_booking_atomic.sql:363-365,419-423`. The existing drift report identifies `bookings.subtotal` as room revenue in `supabase/migrations/20260831160000_booking_nights.sql:171-179`.

Example: three room nights with GHS 300 room charges and GHS 60 tax produce ADR 120 instead of room ADR 100. This illustrative tax amount is not a statement of Ghana's tax rates.

**Correction:** define room revenue separately from taxes, other charges and cash receipts. Use the authoritative nightly room amounts, reconcile approved adjustments, and feed ADR and RevPAR from the same net room-revenue measure. Add tax-bearing fixtures.

### F2 — Equal nightly allocation discards booked nightly prices and loses minor units

**Priority:** P1 for date-specific reporting; new allocation logic.

**Evidence:** `lib/reports/bi-math.ts:61-80`; repeated calculations at `app/dashboard/reports/actions.ts:199-205,224-230,303-305`.

Every night receives rounded `total_amount / nights`, even though `booking_nights` already stores `stay_date`, `rate_minor`, currency and quantity. A two-night stay priced at 100 then 300 is reported as 200 on each date. Cross-month revenue and source trends therefore differ from the prices actually sold.

Separately, 100.00 spread across three nights becomes 33.33 x 3 = 99.99. Existing report tests only use evenly divisible examples and do not detect this.

**Correction:** aggregate stored nightly revenue by stay/business date, with an explicit policy for discounts and corrections. Any legacy allocation fallback must distribute the integer remainder deterministically so the full stay reconciles exactly. Use one shared aggregation for tiles, charts and sources.

### F3 — Reports can silently truncate at the API row limit

**Priority:** P1. Retained query pattern, extended to new reports.

**Evidence:** `app/dashboard/reports/actions.ts:73-84,268-278,440-468`; `supabase/config.toml:16-18`.

The local API is configured for a maximum of 1,000 rows. Report queries retrieve bookings, payments, rooms and guest records without pagination or database aggregation. When a result exceeds the configured cap, the application treats the returned subset as the entire period. This can understate revenue, collections, occupancy and guest counts without warning. The deployed API limit was not inspected.

**Correction:** prefer tenant-authorized SQL aggregation with bounded result sets. Otherwise implement complete, deterministic pagination and fail if completeness cannot be established. Add fixtures with more than 1,000 matching records.

### F4 — Failed database reads become plausible zero-valued reports

**Priority:** P1. Retained and expanded.

**Evidence:** `app/dashboard/reports/actions.ts:84-85,147-148,277-278,463-468,496-505`.

Queries discard `error` and use empty arrays, zero totals, or a default currency. An upstream query failure can look like no business activity or no outstanding balance. The client's error/retry UI cannot handle a failure that the action converts into a successful report payload.

**Correction:** check each required result before aggregation; throw or return a typed unavailable state. Distinguish genuinely empty data from failed reads, and record sanitized diagnostics. Test booking-query, payment-query and currency-query failures.

### F5 — Report cache keys omit tenant identity

**Priority:** P1 conditional isolation risk; introduced in the new centralized report-key helper. A live organization-switch reproduction was not performed.

**Evidence:** `lib/query-keys.ts:11`; `app/dashboard/reports/reports-client.tsx:35-53`; `components/providers.tsx:40-58`.

Unlike neighboring keys, report keys contain only tab and dates. The browser QueryClient is shared and considers results fresh for 60 seconds. If the active organization changes without a full page reload, the same key can reuse the previous hotel's financial data. No query-cache clearing on identity changes was found in the inspected application code. This finding concerns browser cache isolation, not a demonstrated database RLS bypass.

**Correction:** include organization and hotel IDs in every report key, gate requests until scope is resolved, and clear sensitive caches when identity changes. Test switching between two hotels on the same date range without reloading the browser document.

## Other actionable reporting findings

### F6 — Historical capacity is calculated using today's active room list

**Priority:** P2; retained behavior with new period comparisons.

**Evidence:** `app/dashboard/reports/actions.ts:81-99,160-162,387-395`.

Adding or deactivating rooms today changes the denominator of a historical period. For example, a fully sold historical 10-room property can appear 50% occupied after it expands to 20 rooms. Both current and prior windows use the same current inventory. Dated closures and inventory changes are not represented.

**Correction:** store or derive dated inventory capacity and document whether each report uses physical rooms, operational sellable rooms or a benchmarking denominator. Do not indiscriminately subtract every maintenance/block status: operational PMS and external benchmarking policies can differ. See the Oracle OOO/OOS distinction in the references.

### F7 — Report date labels and actual queried dates can differ

**Priority:** P2; retained range normalization exposed through the revised UI.

**Evidence:** `lib/reports/resolve-range.ts:9-24`; `app/dashboard/reports/reports-client.tsx:55-60`; `app/dashboard/reports/_components/period-control.tsx:49-74`.

The UI permits ranges exceeding 366 days and labels the entered dates. The server silently changes the end to start + 365 days, but does not return that effective range. A report labeled January 1, 2025 through October 21, 2026 actually stops on January 1, 2026.

**Correction:** validate the maximum span in the UI and server, or return effective dates and show an explicit normalization notice.

### F8 — Timestamp reports ignore the property's timezone

**Priority:** P2 for non-UTC properties; new guest/collection reporting and retained date helpers.

**Evidence:** `app/dashboard/reports/actions.ts:362-363,446-447`; `app/dashboard/reports/page.tsx:20-22`; `lib/reports/resolve-range.ts:11-17`.

Timestamp filters use bare date strings and defaults use the server's date, without reading hotel timezone. Transactions near midnight can land in the wrong property day. A Ghana property on a UTC backend may not expose this, but the existing property-timezone helpers show the application supports a broader model.

**Correction:** reuse `businessToday` and `businessDayBounds` from `lib/business-date.ts` for local calendar dates and UTC query boundaries. Separately define a persisted accounting business date if close-of-day can run after midnight; a timezone conversion alone is not an accounting-day state machine.

### F9 — Historical new/repeat guest metrics use lifetime counters

**Priority:** P2; new guest report.

**Evidence:** `app/dashboard/reports/actions.ts:466-468,483-490`.

The report classifies a guest using their current `total_stays`. Someone whose first stay was in January becomes a repeat guest in January's report after returning in October. This rewrites historical acquisition/retention results.

**Correction:** define whether this means first-ever guests, first arrivals in the period, or current customer classification. For historical first/repeat metrics, determine previous qualifying stays as of each arrival, not as of today. Test a later return and a multi-room booking by the same guest.

## Existing PMS-wide blocker discovered outside the diff

### F10 — Night audit is not a reliable business-date close

**Priority:** P1; not introduced by the pending changes.

**Evidence:** `app/dashboard/night-audit/actions.ts:86-95,129-166`; `lib/audit.ts:83-110`.

The close check searches audit-log `created_at` within the requested day's timestamps, but the written business date lives in `after_state.date`, and the row is created now. Closing October 20 on October 21 therefore does not register as October 20 being closed. The October 21 lookup can instead pick up that row as its own close. The read-before-insert approach also lacks transactional, unique business-date closure in this function.

Additionally, the entire durable close is a `writeAuditLog` call whose contract swallows insertion failures. The caller can return `Day ... closed` without a persisted close record. The function records unresolved arrivals/departures as a count, but does not resolve or gate them, advance a persisted business date, or post/reconcile a daily ledger. Historical summary inputs also read current room states.

**Correction:** create a durable close record uniquely keyed by hotel and business date, implement transactional/idempotent close processing, propagate mandatory persistence failures, explicitly resolve or authorize exceptions, and persist reconciled daily figures. Keep event timestamps separate from business dates. Test two concurrent closers, retry after a failed write, after-midnight close, and reopening/adjustments if supported. A lightweight shift-review feature is valid, but should not claim full financial day closure until these guarantees exist.

## Industry PMS alignment

There is no single pass/fail assessment in this review covering all PMS products. Financial-reporting guidance, operational workflows, integration contracts and security compliance need separate acceptance criteria.

- **Financial definitions: not ready.** Room revenue, taxes, cash collected and outstanding balances must have explicit, reconcilable definitions. The new reports distinguish collections from stay revenue conceptually, but F1-F4 prevent dependable numbers.
- **Room nights: partly aligned.** The new math correctly treats checkout as exclusive and weights by room count. Historical capacity, actual versus on-the-books occupancy, complimentary/house-use handling and closure policy still need documented definitions and tests.
- **End of day: not ready as financial closure.** Oracle OPERA's documented workflow includes business-date advancement, room/tax postings, reconciliation and exception handling. This is a mature-product operational reference, not a requirement to copy every OPERA feature. F10 identifies concrete failures even for a simpler close workflow.
- **Tenant isolation: incomplete validation.** Server queries generally scope by hotel, but the browser cache needs correction. Deployed RLS, suspended-account access and role enforcement were not integration-tested.
- **Offline safety: good improvement within the tested scope.** The new design avoids promising offline mutations, excludes private HTML/RSC from caching, and provides a standalone recovery screen. It is not an offline-capable front desk.
- **Formal compliance: not assessed.** Do not claim USALI conformity, PCI DSS compliance, HTNG/OpenTravel interoperability, or local tax/privacy compliance from this review. The licensed USALI text, deployment controls and applicable jurisdictional requirements were not fully audited.

### Primary guidance consulted on October 21, 2026

HFTP's public USALI site describes the 12th Revised Edition and its January 1, 2026 adoption date. That publication date is not a universal legal obligation imposed on every PMS. Only public overview/resources were consulted, not the complete licensed standard.

Oracle OPERA Cloud 26.3 documentation was used for operational comparisons: business-date close, room/tax posting, and the distinction between Out of Order (removed from inventory for its dates) and Out of Service (retained in inventory in OPERA). These product-specific definitions should inform an explicit RoomLine policy, not be mislabeled as universal rules.

Reference locations:

```text
https://usali.hftp.org/
https://usali.hftp.org/resources
https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.3/ocsuh/c_endofday_procedures.htm
https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.3/ocsuh/c_post_room_tax.htm
https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.3/ocsuh/t_housekeeping_out_of_order.htm
https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.3/ocsuh/t_housekeeping_out_of_service.htm
```

STR/CoStar pages returned access errors, so their detailed benchmarking guidance was not verified. The HFTP FAQ PDF did not yield readable extracted content; no conclusions here are attributed to it.

## Performance and UI follow-ups

- Replace repeated booking-window scans with one shared aggregate over dated facts. `eachStayNight` creates/scans the whole requested date interval per stay, and current/prior booking and room queries recur across report tabs. SQL aggregation addresses both scale and completeness; benchmark representative hotel workloads before claiming a speedup.
- Reuse currency already returned by `getHotelScope` rather than a subsequent hotel query, provided the intended error contract is preserved.
- Clarify labels: realized versus booked revenue; sold versus physically occupied rooms; current outstanding versus a historical balance. The Guests & finance outstanding query is current and limited to confirmed/checked-in bookings, not an as-of-period receivables ledger.
- Review the room-type occupancy bars: `occupancy-tab.tsx:45-47` sizes them by room nights relative to the largest type, while adjacent labels show occupancy percentages. Use occupancy as width or explicitly label the volume comparison.
- Restore exact-value access for compact KPI amounts, and add a tabular equivalent/export for financial reconciliation. Treat these as usability improvements rather than substitutes for correcting the underlying math.
- The landing-page changes remove the heavy interactive demo, scope styles and include a skip link, focus styles and reduced-motion handling. Visual polish and small-laptop/mobile behavior were inspected in code only; no browser visual/accessibility sign-off or performance score is claimed.

## Checks actually attempted

| Check | Result |
| --- | --- |
| Git scope/status and baseline | Reviewed pending changes against `533396d`; no staged changes at initial inspection. |
| Graphify scoped query | Completed; used as navigation, not proof of runtime correctness. |
| `node --test tests/pwa/regressions.mjs` | **29 tests passed, 0 failed.** Node-based worker/cache/document harness, not a real-browser test. |
| `pnpm test` | Blocked before tests: `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`, installed `dedupePeers` setting mismatch. |
| `node node_modules/vitest/vitest.mjs run` | Startup failed: cannot resolve `@vitejs/plugin-react`. No Vitest suite passed. |
| Targeted ESLint invocation | Tool reported `Unknown: ChildProcess.kill`; no usable lint result. |
| Direct report-math reproduction using Node module hooks | Tool reported `Unknown: ChildProcess.kill`; no runtime result. Numeric examples above are static derivations. |
| `git diff --check && pnpm build` | Tool reported `Unknown: ChildProcess.kill`; neither a completed build nor an independent diff-check pass is claimed. |
| Typecheck / local app startup | Not completed. Next and TypeScript package paths were not readable/resolvable in the installed tree. |
| Supabase integration/concurrency/migration tests | Not run; no live database or payment-provider operations performed. |

The dependency-verification failure is an environment/reproducibility blocker, not proof the new verification guard is defective. Do not remove the guard merely to obtain a green command. Restore a lockfile-consistent installation and repeat the real project checks.

The bundled Next.js documentation path was unavailable with the broken installation. No Next.js implementation changes were made. HeroUI's local introduction and existing component usage were inspected, but no library-specific certification is implied.

## Recommended release gates

1. Correct F1-F5 and add report action tests for database errors, large result sets and tenant switches.
2. Reconcile reports against known folios/nightly records, including tax, variable nightly rates, discounts, partial-period stays and indivisible minor-unit totals.
3. Resolve the existing night-audit close defect before presenting it as financial day closure. Verify concurrent retries and after-midnight business dates.
4. Specify historical inventory, property-day boundaries, guest classification and effective date-range behavior; fix F6-F9 accordingly.
5. Restore reproducible dependencies and pass the full test suite, typecheck, lint and production build.
6. Run a staging rehearsal: booking to check-in to payment to checkout to close, plus cancellation/no-show/refund, tenant isolation and concurrent last-room booking/payment replay tests. Verify restore procedures, monitoring and applicable compliance separately.

**Bottom line:** there are useful foundations and a well-tested offline fallback, but the financial reporting and business-date closure guarantees are insufficient for a production PMS sign-off.
