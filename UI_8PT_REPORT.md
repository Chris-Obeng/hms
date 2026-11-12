# UI 8-point grid report

Branch: `ui/8pt-grid`. Scope: visual-only (spacing, sizes, radii, line-heights). No logic, copy, routes, server actions, auth, DB or payment code was changed. Inventory: `UI_8PT_INVENTORY.md`. Audit data: `ui-audit/baseline.json`, `ui-audit/after.json` (`node scripts/ui-8pt-audit.mjs --json <file>`).

**Verification status, read first:** the build, typecheck, lint and tests pass. **No visual verification of any page except `/offline` was possible.** With placeholder env values (no Clerk, Supabase, Sentry or Paystack credentials) every route except `/offline` returns HTTP 500, and dashboard and platform pages also need authentication. All visual results below are therefore UNVERIFIED (see section 7). The numbers in this report come from static analysis of source, not from computed styles in a browser.

## 1. SUMMARY

### What changed
- Design token layer (`app/globals.css`): documented the scales, snapped text line-heights to multiples of 4px.
- Shared components in `components/ui/*` and `components/layout/*`: half steps (0.5, 1.5, 2.5, 3.5) snapped to whole 4px steps.
- Public pages, booking flow, auth, onboarding, landing (`app/[slug]`, `booking.css`, `landing.css`, `onboarding.css`, auth pages): half steps and arbitrary px values snapped to 4px multiples; CSS px and rem spacing, size and radius values snapped (max 4px shift).
- Dashboard and platform pages and their components (including `calendar.css`, `availability.css`): half steps snapped up, off-scale arbitrary px snapped to 4px multiples, CSS px snapped.

### What was skipped
- Radius token scale, 28/36px control heights, page padding 16/24/32, ratio line-heights, `text-[Npx]` font sizes, steps 5/7/9/11. See sections 5 and NEEDS DECISION.

### Conformance before vs after (static audit)

| Metric | Baseline | After | Change |
|---|---|---|---|
| oddSteps (half steps and 5/7/9/11 Tailwind steps) | 1577 | 634 | -943 |
| arbitrary (total) | 1026 | 991 | -35 |
| arbText (`text-[..px]`) | 584 | 584 | 0 (kept) |
| arbRounded (`rounded-[..]`) | 146 | 146 | 0 (values moved onto 4px multiples, count unchanged; rest are kept exceptions) |
| arbLeading (`leading-[..]`) | 7 | 5 | -2 |
| inlineStylePx | 86 | 83 | -3 |
| cssPxValues (all px values in css) | 400 | 400 | 0 (values changed, count same) |
| cssOffGrid (css px not a multiple of 4) | 191 | 65 | -126 |
| Files with findings | 157 / 268 | 146 / 268 | -11 |

Notes on reading these numbers: the audit counts patterns, not violations. Of the remaining 634 oddSteps, the large majority are steps 5, 7, 9, 11 (20, 28, 36, 44px) which are 4px multiples, not off-grid (see Exceptions). `arbRounded` and `cssPxValues` did not change in count because values were edited in place. The 65 remaining `cssOffGrid` are hairlines (<=2px), ratio line-heights, safe-area values and similar documented exceptions; they were not individually re-classified after the last pass.

Largest remaining files by audit score: `booking-wizard.tsx` 320 (was 400), `onboarding.css` 145 (178), `calendar.css` 123 (180), `pricing-client.tsx` 118 (155), `confirmation/page.tsx` 103 (128). Most of that remainder is `text-[Npx]` font sizes and kept 4px-multiple odd steps.

### Commands (final run on this branch)
- `pnpm typecheck`: pass
- `pnpm lint`: pass (0 errors, 8 warnings, same as baseline)
- `pnpm test`: pass (52 files, 665 tests)
- `pnpm build`: pass (with gitignored `.env.local` copied from `.env.example`)

## 2. DESIGN TOKENS (final)

Defined in `app/globals.css` `@theme inline` (comment block at top) and Tailwind v4 defaults.

- **Spacing:** Tailwind `--spacing` = 4px. Preferred steps 1, 2, 3, 4, 6, 8, 12, 16 = 4, 8, 12, 16, 24, 32, 48, 64px. Steps 5, 7, 9, 11 (20, 28, 36, 44px) are 4px multiples and tolerated for icons and sizes. Half steps are no longer used in migrated files.
- **Page padding (documented target):** 16 mobile / 24 tablet / 32 desktop; section spacing 32/48/64. Documented only, not retrofitted (Needs decision).
- **Control heights:** 32 (h-8), 40 (h-10), 48 (h-12); mobile touch targets >= 44px (min-h-11). Existing h-7/h-9 (28/36px) remain (Needs decision). Onboarding desktop control 42 -> 40px.
- **Radius (unchanged):** `--radius` 0.625rem = 10px gives sm 6, md 8, lg 10, xl 14, 2xl 18, 3xl 22, 4xl 26px. Target scale 4/8/12/16/full not applied (Needs decision).
- **Type sizes (unchanged):** 11 (caption), 12 (label), 14 (body), 15 (section), 22 (page title), 28 (KPI), 36px.
- **Line-heights (changed):**

| Token | Before | After |
|---|---|---|
| `--text-page-title-lh` | 1.2 (26.4px) | 1.75rem (28px) |
| `--text-section-lh` | 1.3 (19.5px) | 1.25rem (20px) |
| `--text-body-lh` | 1.6 (22.4px) | 1.5rem (24px) |
| `--text-label-lh` | 1.4 (16.8px) | 1rem (16px) |
| `--text-caption-lh` | 1.4 (15.4px) | 1rem (16px) |
| KPI 28/36 | 1.0 | unchanged |

## 3. SHARED COMPONENT CHANGES

All half-step and token snaps; max shift 2px per property, except line-heights (max 1.6px).

| Component | What changed | Before | After |
|---|---|---|---|
| `app/globals.css` text tokens | line-heights to px multiples of 4 | see section 2 | see section 2 |
| `components/ui/button-styles.ts` | half-step padding/gap | e.g. 1.5 / 2.5 steps | 2 / 3 steps (8/12px) |
| `components/ui/input.tsx`, `textarea.tsx` | half-step padding | .5 steps | whole steps |
| `components/ui/input-group.tsx` | padding and gap | half steps | whole steps |
| `components/ui/dropdown-menu.tsx`, `popover.tsx`, `tooltip.tsx` | item/content padding | half steps | whole steps |
| `components/ui/badge.tsx`, `avatar.tsx`, `mini-stat.tsx`, `stat-strip.tsx` | padding/gap | half steps | whole steps |
| `components/ui/tabs.tsx`, `calendar.tsx`, `entity-filters.tsx`, `contact-row.tsx` | padding/gap | half steps | whole steps |
| `components/ui/page-header.tsx`, `section-card.tsx`, `sidebar.tsx` | padding/gap | half steps | whole steps |
| `components/ui/pen/*` (card, kpi, table, range-control) | padding/gap | half steps | whole steps |
| `components/ui/hero-select.tsx`, `image-upload.tsx`, `room-images-upload.tsx`, `notes-*`, `notification-bell.tsx`, `segmented-donut.tsx` | padding/gap/size | half steps | whole steps |
| `components/layout/app-header.tsx`, `app-sidebar-overlay.tsx` | padding/gap | half steps | whole steps |

Exact per-line before/after values are in git: `git diff ec11573 HEAD -- components/ui components/layout app/globals.css` (commits ff1c2b9, 6d58e57, 9a76da6). Because these components are shared, the change touches every page that uses them; it was not visually checked.

## 4. PAGE-BY-PAGE LOG

All pages: visual verification UNVERIFIED unless noted. Per-page status for all 65 route files is in `UI_8PT_INVENTORY.md` (all DONE).

| Page / area | Changes | Remaining exceptions | Why |
|---|---|---|---|
| `/offline` | none needed | none | Only page rendered in a browser; before screenshots at 390 and 1440 in `ui-audit/before/`. Not re-captured after changes. |
| `/` landing (`app/landing.css`, `components/landing/*`) | CSS px/rem snapped to 4px multiples, half steps removed | fractional line-heights 0.98/1.04/1.25/1.4/1.45/1.55, `text-[Npx]` | Ratio line-heights on display type; snapping alters heading rhythm |
| `/sign-in`, `/sign-up` | spacing and arbitrary sizes snapped | `leading-[1.05]` on display titles, logo glyph bars `w-[6px]`, `gap-[3px]`, `rounded-[1px]` | Brand mark and display type |
| `/onboarding` (`onboarding.css`, `_components/*`) | CSS px snapped; desktop control height 42 -> 40px; skeleton uses `var(--ob-control-h)` | coarse-pointer 44px, `text-[Npx]` | Touch target guidance |
| `/deactivated`, `/suspended` | spacing snapped | `text-[Npx]` | Type hierarchy |
| `/[slug]` booking wizard (`booking.css`, `_components/booking-wizard.tsx`) | half steps, arbitrary px, CSS px snapped | 320 audit hits remain, mostly `text-[Npx]`, steps 5/7/9/11, `rounded-[20/24/28px]` | Type hierarchy; 4px multiples |
| `/[slug]/confirmation` | spacing snapped | 103 hits remain, same causes | same |
| `/dashboard` (home) | half steps, arbitrary px snapped | page padding not unified | Needs decision |
| `/dashboard/bookings`, `bookings/[id]`, `bookings-table`, `booking-deep-link-client` | snapped | `text-[Npx]`, odd 4px steps | same |
| `/dashboard/calendar` (`calendar.css`) | CSS px snapped | hairlines, cell dimensions that are 4px multiples | Grid layout kept |
| `/dashboard/availability` (`availability.css`) | CSS px snapped | hairlines | same |
| `/dashboard/customers`, `guest-detail-sheet` | snapped | `text-[Npx]` | same |
| `/dashboard/rooms`, `rooms/pricing` | snapped | `pricing-client.tsx` 118 hits, mostly font sizes | same |
| `/dashboard/payments`, `night-audit`, `reports`, `settings` (incl. audit-log), `staff` | snapped | `text-[Npx]`, odd 4px steps | same |
| `/platform/*` | snapped | same | same |
| Notifications, payouts, errors, pwa components | snapped | same | same |

## 5. EXCEPTIONS (intentional off-grid or non-snapped values)

| Value | Where | Justification |
|---|---|---|
| `text-[Npx]` (584 occurrences; 9, 10, 11, 12.5, 13px etc.) | many files | Font sizes are not spacing; changing them alters type hierarchy, which the brief forbids |
| Unitless line-height ratios (0.98 to 1.55) | `landing.css`, `onboarding.css`, `booking.css`, `leading-[1.05]` | Ratio keeps rhythm on large type; snapping to px visibly changes headings |
| Steps 5, 7, 9, 11 (20, 28, 36, 44px) | icons, sizes, shared components | They are multiples of 4px (4pt-compliant); 44px is a touch target |
| h-7 / h-9 (28 / 36px) | button-styles, view-mode-toggle, segmented-tab, entity-filters | Mapping to 32/40 changes many screens |
| Hairlines and borders <= 2px, ring widths | everywhere | Borders, shadows, focus rings exempt |
| Brand logo glyph bars (`w-[6px]`, `gap-[3px]`, `rounded-[1px]`) | auth, landing | Logo artwork |
| `rounded-[20px]`, `[24px]`, `[28px]`, pill radius 99px | various | On a 4px multiple or pill; not changed |
| Radius tokens 6/10/14/18/22/26px | `--radius` derived | Shared by every component (Needs decision) |
| Safe-area `env()` paddings, breakpoints `min-[..]`/`max-[..]`, tracking | various | Not spacing |
| `max-w` / `w` measures that are 4px multiples | various | On grid |
| 65 CSS px values not multiples of 4 (`cssOffGrid`) | css files | Hairlines and similar; not individually re-reviewed after final pass |
| Third-party widgets (Clerk, HeroUI internals, Paystack) | n/a | Exempt |

## 6. ISSUES OUTSIDE SCOPE (noticed, not changed)

- Placeholder env makes every route except `/offline` return 500 (invalid Sentry DSN and Clerk values); there is no way to preview the app without real credentials or a mock mode.
- Lint has 8 pre-existing warnings (for example unused `userEvent` in `tests/reports-ui.test.tsx`).
- Mixed spacing systems (Tailwind classes, CSS files with px/rem, inline styles; 83 inline px styles remain) make the grid hard to enforce; a lint rule or shared spacing tokens would help.
- No shared page padding wrapper exists, so each page sets its own padding.
- 28/36px controls are below the 44px touch target on desktop-sized layouts when used on touch tablets.
- Small `text-[9px]`/`[10px]` copy may fail readability and accessibility guidance (caption token floor is 11px).
- Known repo docs `AUDIT_REPORT.md` and `REMEDIATION_PLAN.md` exist and were not touched.

## 7. UNVERIFIED ITEMS

Nothing below was checked in a browser. Check at 390 and 1440, and also 360, 768 and 1024. Look for overflow, clipped text, shifted alignment, changed row heights, wrapping that changed, and sticky/overlay positioning.

Public pages (need real or mocked Clerk/Sentry env):
- `/` landing: hero, pricing, footer; 360, 390, 768, 1024, 1440
- `/sign-in`, `/sign-up`: 390, 1440
- `/onboarding` all steps (control height 42 -> 40px): 390, 768, 1440
- `/deactivated`, `/suspended`: 390, 1440
- `/[slug]` booking wizard every step, room gallery: 360, 390, 768, 1024, 1440
- `/[slug]/confirmation` including payment panel: 390, 1440

Authenticated (need Clerk and Supabase):
- `/dashboard` home and activity list; `/dashboard/bookings`, `/dashboard/bookings/[id]` and the booking drawer; `/dashboard/calendar` (grid cell sizes); `/dashboard/availability` (grid); `/dashboard/customers` and guest detail sheet; `/dashboard/rooms` and `/dashboard/rooms/pricing`; `/dashboard/payments`; `/dashboard/night-audit`; `/dashboard/reports`; `/dashboard/settings` incl. audit log; `/dashboard/staff`; `/platform/*`; `/join`
- Notification center, sidebar, header, dropdown menus, popovers, tooltips, date picker (shared components changed): every viewport above
- Body line-height 22.4 -> 24px on `.text-body` copy: check dense tables for row-height growth at 1440 and 390

Only `/offline` was rendered. Its before screenshots exist at 390 and 1440 (`ui-audit/before/`); no after screenshots were taken and no automated computed-style (DOM-walking) audit was run. Do not treat the audit counts as proof of rendered conformance.

## NEEDS DECISION

Withheld because they visibly change many screens or move values by more than 8px, or need a design call:

1. **Radius tokens.** `--radius` 10px yields 6/8/10/14/18/22/26px. Options: set `--radius` to 0.5rem or 0.75rem and rebase multipliers to get 4/8/12/16/24. Affects every component.
2. **Control heights 28/36px (h-7 / h-9).** Map to 32/40? Changes buttons, view toggle, segmented tabs, entity filters on many screens; mobile already 44px.
3. **Page padding 16 / 24 / 32.** No shared wrapper; needs a layout-level change per area and a visual check.
4. **Ratio line-heights.** Landing fractional ratios and `leading-[1.05]` on auth titles; snapping to px multiples changes heading rhythm.
5. **Font sizes `text-[9/10/11/12.5/13px]`** (584 uses): fold into the type scale (11/12/14/15) or keep.
6. **Odd steps 5/7/9/11** (20/28/36/44px): keep as 4px multiples or restrict to 8px multiples only.
7. **Body line-height 24px** was applied (from 22.4px). Revert `--text-body-lh` in `app/globals.css` if denser text is preferred.
8. **Onboarding control height 40px** (from 42px) was applied on desktop; confirm.
9. **Section spacing 32/48/64** is documented but not enforced.
