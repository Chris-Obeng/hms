# Calendar Page Review — 2026-09-23

**Scope:** `app/dashboard/calendar/**` — page, client, server actions, timeline engine (geometry/conflicts/auto-assign), toolbar, block sheet/drawer, `calendar.css`; supporting libs (`roles.ts`, `calendar-domain.ts`, `business-date.ts`, realtime, query-keys).
**Method:** Full read of all files + 2 review sub-agents (spec-axis, security-axis) + lead-run standards/perf verification. Every finding confirmed against code before inclusion; hypotheses that failed verification were dropped.
**Process caveat:** `docs/agents/issue-tracker.md` (referenced by review skills) does not exist in this repo — open item for repo hygiene.

---

## Verdict

Timeline engine, DnD orchestration, and the move/resize transactional path are solid — better than typical. Gaps concentrate in **authorization on server actions**, **block/booking invariant enforcement**, and **failure-path UX**. Nothing requires a redesign; all fixes are localized.

---

## HIGH

### H1. Booking mutations have no server-side authorization
`assignBookingToRoom` (`actions.ts:386`), `moveBooking` (`actions.ts:527`), `unassignBooking` (`actions.ts:717`) never call `getCurrentStaffRole()`/`can()`. Only block create/delete check capabilities (`actions.ts:754`, `816`). RLS offers no backstop: `20240101001100_rls_policies.sql` gives bookings org-isolation only, and `20260824150411_harden_rls_role_gates…sql` adds RESTRICTIVE role gates for DELETE on rooms/room_types/guests/availability_blocks/payments — **no bookings UPDATE/DELETE role gate exists**.
**Scenario:** any active staff member (including `read_only`) invokes the bundled server action directly and moves/unassigns any booking in the org. Client `canEdit` gates are UX-only.
**Fix direction:** add `can(role,"calendar:edit")` to all three actions; consider a RESTRICTIVE bookings UPDATE policy mirroring `CAPABILITY_MIN_ROLE`.

### H2. Availability blocks don't participate in availability — in either direction
- `checkRoomAvailability` (`actions.ts:319-349`) queries only `bookings`; a booking can be assigned/moved into a room blocked for maintenance.
- `createAvailabilityBlock` (`actions.ts:744-804`) never checks existing bookings; a manager can block a room over confirmed upcoming stays with no warning.
- DB exclusion constraint `bookings_no_room_overlap` (`20240102000000_booking_availability.sql`) covers bookings only.
**Scenario:** room blocked for plumbing; front desk drags a guest into it; guest arrives at an out-of-service room.
**Fix direction:** include blocks in `checkRoomAvailability`; warn-or-block on booking overlap in `createAvailabilityBlock`; longer-term, one DB-side "room occupied" source of truth (exclusion constraint over a union, or blocking trigger).

### H3. Assignment race has a conditional DB backstop
`assignBookingToRoom` does check-then-write (`actions.ts:428` read → `444` write). The only backstop is the `bookings_no_room_overlap` exclusion constraint, whose creation is **conditional on zero pre-existing overlaps** (`20240102000000…sql` skips with a NOTICE otherwise). `moveBooking` is safe (transactional `reprice_booking_stay`, `actions.ts:630-656`).
**Fix direction:** verify the constraint exists in every deployed DB (`pg_constraint`); add a regression migration asserting it; rely on the constraint error path (`actions.ts:452`) rather than the pre-check.

### H4. Silent failure path renders an empty grid
`getCalendarData` (`actions.ts:145-214+`) maps query results with `?? []`-style fallbacks and has no error propagation; `page.tsx:47` awaits it without try/catch (throw → generic dashboard error boundary); the client query (`calendar-client.tsx:132`) never reads `isError`/`error`. On a flaky-network refetch failure with no cached data, `rooms=[]` renders an **empty grid with no error or retry UI** — indistinguishable from a zero-room hotel.
**Fix direction:** surface query error state with a retry; make server data failures explicit (Result type or throw consistently).

### H5. Empty-room rows defeat memoization
`timeline-calendar.tsx:619-620` — `bookings={assignedByRoom.get(room.id) ?? []}` / `blocks={… ?? []}` mint fresh array identities per render for every empty room, defeating `React.memo(RoomRow)` (`:252`). Every search keystroke and drag cell-crossing re-renders all empty rows and their `BookingBar` children.
**Fix direction:** hoist a shared `EMPTY` constant (or normalize in the `useMemo` maps).

### H6. Block edit is missing (spec requirement)
Spec `.agents/prompts/migrate-calendar-drawers-heroui.md` §Functional: "create availability block; **edit/delete existing blocks**". No edit path exists: `block-detail-drawer.tsx:50-63` only deletes; `block-room-sheet.tsx:85` only creates; `actions.ts` exports no block update.
**Fix direction:** add `updateAvailabilityBlock` + reuse the sheet in edit mode, or explicitly descope with the spec owner.


---

## MEDIUM

| # | Finding | Refs |
|---|---------|------|
| M1 | **Isolated QueryClient shadows the app-wide provider.** Calendar mutations/realtime invalidate only `["calendar", orgId, hotelId]`; bookings list, dashboard KPIs, etc. are never invalidated by calendar edits and serve stale data within `staleTime`. Shared components mounted from the calendar resolve against this second cache. Deliberate for preview isolation (comment at :82) but the staleness consequence is undocumented. | `calendar-client.tsx:77-93, 233, 714, 726, 735, 743` |
| M2 | **`getCalendarData` unbounded + unvalidated.** No `days` clamp, no `startDate` validation; direct invocation with `days=3650` dumps full booking history incl. guest PII to any active staff. No role check on `getCalendarData`/`getBookingById` (acceptable for `read_only`; a `pending` active profile would pass RLS). | `actions.ts:145-152` |
| M3 | **AlertDialog copy contradicts behavior.** Type-change dialog says "The rate is not recalculated automatically — review the folio afterwards", but type changes route through `moveBooking` → `reprice_booking_stay`, which re-derives nightly rates, totals, and payment status. Staff are told to manually fix what the system already fixed. | `calendar-client.tsx:682-683` vs `actions.ts:520-521, 630-656` |
| M4 | **Reason taxonomy mismatch.** Sheet emits `deep_cleaning`/`other`; drawer labels key on `cleaning`/`hold` → labels silently fall back to raw stored text. | `calendar-helpers.ts:68-74` vs `block-detail-drawer.tsx:19-25, 170-175` |
| M5 | **Audit gaps.** `assignBookingToRoom` and `unassignBooking` write no audit log (contrast `moveBooking` `actions.ts:682-697`, blocks `:785-795`). `unassignBooking` also lacks a status guard — a `checked_out` booking can be unassigned, corrupting stay history. | `actions.ts:386-465, 717-737` |
| M6 | **No rate limiting on calendar server actions.** `lib/rate-limit.ts` is wired only into public API routes / Sentry tunnel; commit `ebd7e81` ("upstash rate limiting") does not cover actions. Unthrottled `moveBooking` also spams the `reprice_booking_stay` RPC. | `actions.ts` (no call sites); `lib/rate-limit.ts` |
| M7 | **Error surface leaks internals.** Raw `err.message` returned to client (Postgres/PostgREST text: constraint names, RLS messages); conflict toasts embed the occupying guest's name. | `actions.ts:439, 455, 487-489, 703, 729, 801, 858` |
| M8 | **Search re-renders the whole timeline per keystroke.** `SearchField` onChange → `setSearchQuery`, no debounce / `useDeferredValue`; each keystroke rebuilds `visibleBookings` and all memo maps in TimelineCalendar. Janky on low-end Android. | `calendar-toolbar.tsx:204`; `calendar-client.tsx:155, 187` |
| M9 | **No input validation.** No zod/schema anywhere in actions; `reason`/`notes` unbounded free text; date strings unvalidated (`parseISO` on raw input). | `actions.ts` throughout; `block-room-sheet.tsx:89-90` |
| M10 | **Keyboard DnD incomplete.** `KeyboardSensor` is wired but there are no `useDroppable` targets (drop resolves via overlay-center hit-testing), no `announcements` prop, and the only aria-live region announces drag errors — pickup/drop/success are silent. Cell-create is click/dblclick-only. | `timeline-calendar.tsx:336, 446-449, 666-668` |

## LOW

| # | Finding | Refs |
|---|---------|------|
| L1 | Breakpoint mismatch: spec says bottom sheet `<640px`; `useIsMobile` is 768px → 640–767px gets bottom sheet instead of side sheet. | `hooks/use-mobile.ts:3`; spec §Responsive |
| L2 | Tap targets <44px: close triggers `size-8`, footer buttons `min-h-9`, toolbar nav `size-8`; `tap-target` helper never used. | `block-room-sheet.tsx:127`; `calendar-client.tsx:845, 873-876`; `calendar-toolbar.tsx:37, 53` |
| L3 | ~68% of `calendar.css` is dead DayPilot-era CSS (`.scheduler_default_*`, `.cal-evt-*`, `.cal-room-*`, tooltip blocks, `.mobile-scheduler`); `--cal-*` tokens are consumed only by dead rules; `.cal-wrap` on the wrapper div is vestigial. Zero tsx references. | `calendar.css:6-35, 39-511, 713-747`; `calendar-client.tsx:548` |
| L4 | Hardcoded hex outside the token system: bar colors, room status dots, drag preview colors; only 3 `.dark` overrides exist. Bars (colored bg + white text) survive dark mode; dots/preview colors were tuned for light. | `calendar-helpers.ts:14-40`; `calendar.css:618-620, 672-674, 626-627, 667` |
| L5 | Comments rule ("no comments unless non-obvious *why*"): section-banner comments and an unexplained `setTimeout(0)` (the *why* is exactly what needs a comment). | `calendar-helpers.ts:1`; `block-room-sheet.tsx:45` |
| L6 | Eager imports: `NewBookingModal` (614 lines), `BookingDetailDrawer` (272), `BlockRoomSheet` (pulls RangeCalendar) always mounted — `next/dynamic` candidates; first paint is the timeline. | `calendar-client.tsx:13-14, 31` |
| L7 | Scope creep vs spec ("exactly these surfaces"): full toolbar rebuild and block-detail-drawer redesign beyond the 3 listed surfaces. Toolbar badge is a raw `<span>`, not the Chip the mapping table prescribes (the `FilterChip` in the client does use Chip — the toolbar legend badge doesn't). | `calendar-toolbar.tsx` (whole file), `:221`; spec §Scope |
| L8 | Duplicated overlap logic: `findTimelineConflicts` re-implements `findOverlappingBookingIds` from `lib/calendar-domain.ts`; `EXCLUDED_STATUSES` redeclared in 3 files. Divergent-change risk when status taxonomy evolves. | `timeline-conflicts.ts:9-31`; `timeline-calendar.tsx:86-87`; `auto-assign.ts:4` |
| L9 | `calendar-client.tsx` at ~900 lines mixes realtime subscription, DnD orchestration, filters drawer, dialogs, and query management — divergent change; the filters drawer (~lines 790-880) and type-change dialog are extractable. | `calendar-client.tsx` (whole file) |

---

## Verified positives (do not regress)

- **Tenancy:** hotelId always resolved server-side from Clerk `orgId` (`getHotelScopedClient`, `actions.ts:18-33`); no client-supplied hotelId trusted in mutations.
- **Realtime:** fail-closed — `realtime.setAuth`, payload discarded, only invalidation (`calendar-client.tsx:232-256`).
- **moveBooking:** transactional via `reprice_booking_stay` with inventory guard; excellent rejection-code → staff-copy mapping (`actions.ts:478-509`); mass-assignment-safe allowlisted payloads.
- **Blocks create/delete:** capability checks present and mirrored to the RLS DELETE policy.
- **Spec conformance verified OK:** weekend columns via `data-dow`; z-index stack cells(0) < today(2) < weekend(3) < bars(10) < preview(25); HeroUI dot-notation anatomy (Switch/Drawer/RangeCalendar/AlertDialog); `minValue` on RangeCalendar; 85dvh sheet + drag handle + sticky footer.
- **Rendering:** no per-day cell divs (CSS grid-line background); drag is cell-quantized, not per-pointermove; `findTimelineConflicts` memoized with early exit.
- **Server/client boundary:** `'use server'` file exports only async functions + types; page passes data-only props to the client.

## Suggested fix order

1. H1 (authz on mutations) — small diff, biggest risk.
2. H2 (blocks ↔ availability) — invariant gap with direct guest impact.
3. H3 (verify/enforce exclusion constraint in prod).
4. H4 (error surfacing) + M1 (query invalidation scope).
5. H5 + M8 (render hot paths).
6. H6/M3/M4 (functional + copy corrections).
7. L3 (dead CSS deletion — pure win, ~500 lines).

| M11 | **Realtime refetch granularity.** Events are batched (75 ms, good) but every burst refetches the entire ≤45-day window via `getCalendarData`; `visibilitychange` bypasses the batch. Fine at current scale; watch with channel-manager webhook volume. | `calendar-client.tsx:232-256, 308` |
