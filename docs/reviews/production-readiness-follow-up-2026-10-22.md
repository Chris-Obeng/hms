# Production-readiness implementation and verification follow-up

Date: 2026-10-22. Workspace: RoomLine, `main`, pending uncommitted changes.

**Release decision: not yet approved.** The reporting, dashboard and operational-close fixes have automated regression coverage, and the final production build now completes. Repository-wide lint, real database authorization/concurrency tests, and authenticated browser acceptance remain open gates. The two pending migrations were subsequently applied to the linked remote RoomLine project on October 22, 2026 after a CLI dry-run and remote identity/health checks.

This follows `docs/reviews/production-readiness-2026-10-21.md`; that document preserves the original pre-fix findings and line references. It is not a description of the current implementation.

## Implemented scope

- Reports separate net room revenue from tax-inclusive receipts and balances, reconcile full-stay nightly prices with exact minor-unit allocation, reject partial snapshots and failed reads, and paginate deterministically instead of trusting a truncated API response.
- Reports use property-local dates, strict ranges, dated physical inventory, and arrival-time guest classification. Unknown historical capacity is unavailable, never inferred from today's room list.
- Reports UI supplies exact values, explicit basis/warnings, accessible chart-data tables, scoped caching, draft/apply dates, error/retry states and guarded current-tab CSV export.
- Dashboard rooms-sold donut uses one reconciled sellable-inventory model for its arcs, percentage and text. Active holds are distinct from sold rooms; inconsistent/oversold inventory is not silently clamped.
- Night audit now requires a persisted immutable hotel/business-date operational-review receipt, with SQL authorization, idempotency and exception/reconciliation gates. A best-effort audit log is not a successful close.

### Additional integration fixes on October 22

1. **Bind each report to the expected authenticated property.** All four report actions take `(startDate, endDate, { orgId, hotelId })`. Runtime scope validation occurs after authentication and before report reads. Metadata contains server-authenticated tenant IDs. The client validates this metadata before caching, displaying or exporting, rather than stamping a client-selected tenant onto an unchecked response. Missing scope, older cached payloads, wrong tenant/date responses and late requests are covered.
2. **Require consistent room quantities.** A booking's room quantity must be a positive safe integer; every stored nightly quantity must match it. Full-stay validation occurs before slicing the requested dates. Invalid/missing quantities no longer default to one or silently distort room-nights and allocation weights. Valid discounted multi-room stays conserve minor units across zero-, two- and three-decimal currencies.
3. **Do not compare unequal completed-night spans.** A range including property-local today excludes today's incomplete room night, while its prior date range is complete. All room KPI deltas are therefore unavailable for that selection, with an explanatory warning. Completed historical comparisons remain unchanged. Requested dates, cash receipts, guest arrivals and newly-created booking counts are not silently shifted.

These integration changes added 94 regressions: the full suite increased from 540 to 634 passing tests.

## Verification actually performed

Environment: Windows, Node `v24.20.0`, pnpm `10.32.1`, TypeScript `7.0.2`, Next.js `16.3.0`, Vitest `3.2.4`.

| Check | Result |
| --- | --- |
| `pnpm test` | **635 tests passed across 46 files**, clean exit after reinstalling with `pnpm install --frozen-lockfile`. Expected mocked error-path logs were emitted by passing tests. |
| `pnpm run typecheck` | **Passed**, clean exit after the lockfile/module state was repaired with `pnpm install --frozen-lockfile`. |
| Scoped ESLint for reports, dashboard, night audit and their regression tests | **Passed**. Final actions/test edits were checked again with `pnpm exec eslint app/dashboard/reports/actions.ts tests/reports-actions.test.ts`. |
| `pnpm test:tooling` | **4 tests passed**, including startup dependency-verification behavior. |
| `node --test tests/pwa/regressions.mjs` | **29 passed**. Standalone worker/cache/document harness, not additional proof of a real-browser flow. |
| `git diff --check` | **Passed**, with existing LF-to-CRLF Git notices. |
| `pnpm exec eslint .` | **Failed: 13 errors, 8 warnings**, outside the reporting/dashboard/night-audit changes. See below. |
| `pnpm build` | **Passed.** The final run compiled successfully in 3.9 minutes, completed TypeScript, generated 19 static pages, finalized optimization, and wrote `.next/server`. It emitted only the existing `metadataBase` warning for local Open Graph/Twitter URL resolution. |
| `pnpm build --debug` | Timed out after **600 seconds** at the same stage. Diagnostics recorded `buildStage: compile`; no cause was established. |
| `pnpm exec next build --webpack` | Diagnostic alternative also timed out after **300 seconds** during optimization. No package/config change was made to switch bundlers. |
| Local database availability | Docker/Supabase local stack is now available. PostgreSQL 17.6 is healthy; CLI `supabase` is v2.109.1. |
| `supabase db push --local --yes` | **Succeeded locally.** Applied the three pending migrations: `20261001095517_split_legacy_multi_unit_bookings.sql`, `20261021223243_reports_inventory_history.sql`, and `20261021223247_durable_business_date_close.sql`. The CLI emitted a non-fatal pg-delta catalog-cache timeout after applying them. Migration history and required tables/functions were independently verified with Postgres. |
| `supabase migration list --local` | **Passed after local push.** The three migrations appear applied in local history. |
| `supabase/tests/durable_business_date_close.sql` | **Passed after one test correction.** The inventory trigger correctly rejects invalid timezone writes; the rollback-only test now temporarily disables that trigger to model a legacy invalid row before exercising the close RPC's fail-closed validation. Fixtures and receipts roll back. |
| `supabase projects list --output json` | **Passed.** The linked remote target is project `RoomLine`, ref `wtgldgyxtpbzjmaygeif`, region `eu-west-1`, status `ACTIVE_HEALTHY`. |
| `supabase db push --linked --dry-run` | **Passed.** Only `20261021223243_reports_inventory_history.sql` and `20261021223247_durable_business_date_close.sql` were pending. |
| `supabase db push --linked --yes` | **Applied remotely.** Both pending migrations completed successfully. The CLI reported a non-fatal pg-delta certificate/catalog-cache warning after applying them. |
| Remote post-push verification | **Passed.** A remote SQL check found `public.reports_inventory_history`, `public.business_date_closes`, `public.close_night_audit(uuid,text,text)`, and `public.get_night_audit_summary(uuid,text)`. A subsequent dry-run reported the remote database up to date. |
| Earlier `pnpm build` attempts | Two earlier runs timed out at the compile stage under the previous cache/process state; the later clean production build completed successfully. |
| `pnpm run lint` | **Failed: 21 problems (13 errors, 8 warnings)**. These are existing/unrelated findings in `.tmp/landing-audit`, `app/dashboard/settings/audit-log/audit-log-client.tsx`, `components/bookings/new-booking-modal.tsx`, and `components/payouts/payouts-panel.tsx`; no lint failures were reported in the reporting/dashboard/night-audit paths changed here. |
| Authenticated browser acceptance | Built-in browser opening of the local reports route timed out; a subsequent tab listing was empty. **No screenshot, responsive/accessibility sign-off or live login/org-switch test is claimed.** |
| `graphify update .` | Completed: **6,813 nodes, 10,934 edges, 601 communities**. Eleven source files produced zero nodes; HTML was skipped because the graph exceeded the 5,000-node visualization limit. The code graph is updated; this is not semantic extraction of this follow-up document. |

Expected error-path logs during Vitest are mocked read/currency failures exercised by passing tests. They are not observed production incidents. Test totals are not a benchmark or performance claim.

### Repository-wide lint remains separate

The errors were in:

- `.tmp/landing-audit/audit.cjs` and `create-assets.cjs`: CommonJS import rules (5 errors).
- `app/dashboard/settings/audit-log/audit-log-client.tsx`: render-time ref writes, effect-driven derived state and impure render-time clock access (5 errors).
- `components/bookings/new-booking-modal.tsx`: effect-driven synchronous state changes (2 errors).
- `components/payouts/payouts-panel.tsx`: effect-driven pagination reset (1 error).

The eight warnings concern existing table/compiler compatibility, hook dependencies and unused variables elsewhere. Read-only Git checks showed no pending diff in the affected tracked components. They were deliberately not changed or suppressed during this focused integration pass; the pre-existing temporary landing scripts were also preserved.

## Metric and close semantics to retain

| Surface | Meaning and limitation |
| --- | --- |
| Reports occupancy / RevPAR | Completed checked-in/out room-nights divided by dated **active physical inventory**. OOS, maintenance and blocks are not deducted. Historical capacity before the observation baseline is unavailable. |
| Dashboard rooms sold | Confirmed/checked-in room units divided by **sellable inventory**, excluding OOS and distinct applicable blocks. Active holds are separate; future capacity uses current inventory and is explicitly qualified. It is not the Reports denominator or physically occupied-room count. |
| Live report nightly revenue | Net booking subtotal allocated over complete stored nightly weights. Discounts/corrections can be allocated proportionally with warnings. Entirely absent legacy snapshots have a warned equal-date fallback. Partial or quantity-inconsistent snapshots fail. |
| Night-audit room revenue | Closure requires stored nightly amounts themselves to reconcile to the net booking subtotal, with matching quantity/currency and complete dates. Missing snapshots or unallocated charge differences block close even if live Reports can provide an allocated estimate. |
| Night-audit close | Immutable operational-review receipt, not financial journal posting, source-record freezing, accounting-date advancement or reopening. Later source corrections do not rewrite the receipt and may differ from live reports. |
| Collections / outstanding | Collections are successful receipts by property-local payment date, including deposits/tax; not net-of-refund room revenue. Outstanding is the current positive tax-inclusive booking balance, not historical receivables. |
| Occupancy deltas | Relative percentage changes, not percentage-point changes. No room KPI delta is shown for ranges including today's incomplete night. |

Do not collapse these definitions merely to make different screens show the same number. No USALI/PCI/HTNG or jurisdictional tax/privacy certification is claimed.

## Database deployment and release checklist

The migrations that were pending before the deployment were:

1. `supabase/migrations/20261021223243_reports_inventory_history.sql`
2. `supabase/migrations/20261021223247_durable_business_date_close.sql`

Both are now applied locally and remotely. Reports and night audit can find their required schema on the linked remote project. The CLI's post-application pg-delta certificate warning did not prevent migration application; the remote dry-run and object checks confirmed the target is up to date. Reports and night audit must still retain explicit failure behavior for future schema/read problems rather than replacing them with plausible empty reports.

Before approval:

- [ ] Restore a running **isolated local test database** and verify its target before any schema command. Use the existing migration workflow; do not reset a shared/staging/production database.
- [ ] Rehearse both forward migrations and inspect table privileges/RLS/function execution using authenticated staff, inactive staff, read-only users, managers and a second property. Test the actual deployed Clerk JWT shape, not only mocks.
- [ ] Test inventory observation baseline, room creation/activation/deactivation/type changes, concurrent room writes, local midnight and timezone changes. Confirm pre-baseline reports stay unavailable instead of being backfilled from today's rooms. The initial inventory migration locks room/hotel tables and needs a deployment window.
- [ ] Run `supabase/tests/durable_business_date_close.sql` against the migrated local database using the documented command in `lib/night-audit/README.md`. Then run true two-session close/retry/rollback races; the supplied single-session SQL tests alone do not prove concurrent scheduling.
- [ ] Check after-midnight close, mandatory insert failure, duplicate retry preserving original actor/notes/summary, unresolved arrivals/departures, quantity/rate/currency mismatches, and source edits after close.
- [ ] Regenerate database types from the **verified intended migrated schema** and replace the isolated temporary table/RPC typing extensions. Review the target of `db:types` rather than invoking its hard-coded remote project blindly.
- [x] Complete the original `pnpm build` after the earlier timeout runs. The final Turbopack build completed without disabling checks or changing bundler configuration; the earlier timeout was environmental/cache/process-state related and produced no compiler error.
- [ ] Resolve the separately listed repository lint failures and rerun `pnpm lint` plus the full suite/typecheck/build on the final combined tree.
- [ ] Verify Reports, dashboard donut and night audit in an authenticated browser on desktop and narrow/mobile layouts: keyboard navigation, chart data tables, exact money, errors, empty states, unknown history, incomplete periods, CSV, organization switch during requests, and cross-property denial.
- [ ] Reconcile representative known stays/receipts against reports and receipts in staging, including tax, multi-room variable rates, discounts, partial periods, zero revenue, missing snapshots and large result sets. Measure representative performance before claiming optimization.

## Resume pointers

Start with the remaining repository-wide lint findings and authenticated/concurrency gates. The local and linked remote database migrations are now applied and the single-session durable-close SQL test passes, but true two-session concurrency and authenticated authorization checks remain open. The detailed reporting contract is in `lib/reports/README.md`; deployment and close/concurrency limitations are in `lib/night-audit/README.md`.

Preserved unrelated landing/PWA/configuration work. No Git commit or push was performed in this continuation. The two requested Supabase migrations were applied to the linked remote project with the installed Supabase CLI; no application deployment was performed. The existing local dev process was left untouched. Browser verification requires restoring the built-in browser session and signing in there; credentials should not be supplied in chat or added to reports.
