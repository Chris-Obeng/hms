# UI 8-point grid report

## Follow-up: 8-point system (branch `ui/8pt-system`)

This pass settles NEEDS DECISION items 1, 2, 3 (partly), 5 and 6 below, and adds enforcement. The rules are documented at the top of `app/globals.css` and checked by `pnpm lint:ui` (also run in CI).

**Rules**
- Layout spacing (page padding, gaps between sections and cards, card padding): 16 / 24 / 32 / 48 / 64. Inside components: 4 / 8 / 12 / 16. No half steps, no 20 or 28px padding, margin or gap.
- Control heights: 32 / 40 / 48, with 44 as the mobile touch target. No 28 or 36.
- Radius: sm 4, md 8, lg 8, xl 12, 2xl 16, 3xl 24, 4xl 24, full.
- Type: `text-2xs` 11/16, `text-xs` 12/16, `text-sm` 14/20, `text-md` 15/24, `text-base` 16/24, `text-lg` 18/28, `text-xl` 20/28, `text-2xl` 24/32. Arbitrary `text-[Npx]` only for 22px+ display type.

**What changed**
- Tokens (`app/globals.css`): `--radius` 10 -> 8px (HeroUI's default, so HeroUI's own radii land on 4/8/12/16/24). Tailwind radius tokens set to fixed values (was 6/8/10/14/18/22/26). Added `text-2xs` and `text-md`. Custom size names stay t-shirt sizes because tailwind-merge (used by `cn()` and HeroUI's `tv()`) treats other `text-*` names as colours and drops them.
- HeroUI control heights re-based in a `@layer components` block: buttons and toggle buttons md 36 -> 40 on desktop, sm 36 -> 40 on mobile (32 on desktop unchanged), lg -> 48; search, number, date and colour fields, input groups, selects and autocomplete 36 -> 40; standalone inputs pinned to 44 (mobile) / 40.
- Class changes in 111 TSX files (codemod, then hand fixes for multi-line strings):
  - 533 arbitrary font sizes folded into the scale. 9/10/11px -> `text-2xs` (11px floor), 12/12.5px -> `text-xs`, 13/13.5/14px -> `text-sm`, 15 -> `text-md`, 16 -> `text-base`, 17-19 -> `text-lg`, 20 -> `text-xl`, 24 -> `text-2xl`. 23 display sizes (22px+) kept.
  - 132 arbitrary radii mapped to tokens (3/5/6 -> sm, 7/9/10 -> lg, 12/14 -> xl, 16/18 -> 2xl, 20-28 -> 3xl).
  - 198 control sizes: `h-7`/`h-9`, `min-h-*`, `size-*` and matching `min-w`/`w` on interactive elements moved up one step to 32/40 (for example `h-11 sm:h-9` -> `h-11 sm:h-10`). Non-interactive 28/36px tiles, avatars and thumbnails were left alone.
  - 162 spacing classes at 20/28px: steps 5 -> 6 (24px), except horizontal padding on buttons -> 4 (16px) and `p-5 sm:p-6` style pairs -> `p-4 sm:p-6`; step 7 -> 8.
  - Page layout: dashboard page sections `space-y-4 md:space-y-5` -> `md:space-y-6`, card grids `md:gap-5` -> `md:gap-6`, platform stat-card grids `gap-3` -> `gap-4`.
- CSS files: calendar, availability, booking, onboarding and landing radii snapped (6/5 -> 4, 10 -> 8, 14 -> 12, 20 -> 24, `--ob-radius` 10 -> 8); 20/28/36px gaps and margins in onboarding and landing -> 24/32. Fluid `clamp()` values were left alone.
- Small fixes: tab list `p-[3px]` -> `p-1`, KPI chip 26 -> 24px, notification bell icon 19/18 -> 20px and badge 18 -> 20px, sidebar role chip 18 -> 20px, ledger column widths 190/150/70/130 -> 192/152/72/128px.

**Enforcement.** `pnpm lint:ui` runs `scripts/ui-8pt-audit.mjs --check`. It fails on half steps, 20/28/36/44px padding, margin or gap, `h-7`/`h-9`, arbitrary font sizes under 22px, arbitrary radii over 2px, arbitrary values not on 4px, and CSS spacing, size or radius values off the scale. Exceptions need an entry with a reason in `ui-audit/8pt-allowlist.json` (currently logo artwork, nested 7px calendar radii, icon-aligned `pl-9` indents, one photo thumbnail and the two items kept after the PR #28 review). The CI workflow now also triggers on `components/**` and `ui-audit/**`.

**Not changed**
- `body` line-height (14px / 1.6). Text without a size class still inherits it.
- HeroUI menu and list-box rows (36px min height), badges and anything HeroUI computes internally (a few 2/6/20px radii from its `--radius` multipliers).
- Calendar geometry constants in `timeline-geometry.ts` (52px rows, 62px header, 92px days). They drive drag-and-drop maths.
- `clamp()` fluid spacing on the landing and onboarding pages.

**Verification.** `pnpm typecheck`, `pnpm lint` (0 errors, the same 8 warnings), `pnpm test` (52 files, 667 tests), `pnpm test:tooling`, `pnpm lint:ui` and `pnpm build` pass. The compiled CSS was checked for the new radius values, the type utilities with their line-heights, and the control-height overrides sitting after HeroUI's rules in the same layer. **No page was rendered in a browser** (the sandbox has no Clerk or Supabase credentials). Check these first at 390 and 1440px:
- Dense rows where 13px text became 14px and 10px became 11px: bookings table, calendar toolbar and chips, activity list, audit log, notification centre, booking wizard summary.
- Toolbars and filter rows where 36px controls became 40px: calendar toolbar, rooms and pricing headers, entity filters, view-mode toggle.
- Cards whose padding went from 20 to 24px in fixed-width columns (dashboard 312px column, booking detail 340px side column).
- Sidebar navigation rows (36 -> 40px).

---

Branch: `ui/8pt-grid`. Scope: visual-only (spacing, sizes, radii, line-heights). No logic, copy, routes, server actions, auth, DB or payment code was changed. Inventory: `UI_8PT_INVENTORY.md`. Audit data: `ui-audit/baseline.json`. Regenerate the after data with `node scripts/ui-8pt-audit.mjs --json <file>` (not tracked).

**Verification status, read first:** the build, typecheck, lint and tests pass. **No visual verification of any page except `/offline` was possible.** With placeholder env values (no Clerk, Supabase, Sentry or Paystack credentials) every route except `/offline` returns HTTP 500, and dashboard and platform pages also need authentication. All visual results below are therefore UNVERIFIED (see section 7). The numbers in this report come from static analysis of source, not from computed styles in a browser.

## Marks, dots, accent bars and touch areas (all changes)

Calendar and availability CSS (`calendar.css`, `availability.css`):
- Status dots 7 -> 8px (4 places: calendar lines ~39, ~262, ~771 and availability equivalent); availability corner dot 5 -> 4px with offset 6 -> 8px.
- Chip icon/marker widths 10 -> 12px and 11 -> 12px; 11 -> 12px square marks.
- Accent bar `.rl-*` 3px -> 4px wide, left 3 -> 4px, top/bottom 5 -> 4px; second accent bar 2.5 -> 4px wide, 13 -> 12px tall.
- `.rl-block-bar` top 9 -> 8px, height 34 -> 36px.
Tailwind marks: legend swatches, status markers and tooltip arrow `size-2.5` (10px) -> `size-3` (12px); `size-[34px]` button -> `size-8`.
Touch areas: no hit-area change. The notification bell `max-md:after:-inset-0.5` overhang was reverted to main (2px) after review.

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
| arbRounded (`rounded-[..]`) | 146 | 146 | 0 (count unchanged; values restored to main, none moved) |
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
- **Radius (unchanged, CSS and TSX):** no radius value was changed. CSS `border-radius`, `--ob-radius` (10px) and all TSX `rounded-[Npx]` values (including 9/10/14/18px) were restored to their original values after review (verified: the `git diff main` of `rounded-[..]` tokens is empty). Tokens: `--radius` 0.625rem = 10px gives sm 6, md 8, lg 10, xl 14, 2xl 18, 3xl 22, 4xl 26px. Target scale 4/8/12/16/full not applied (Needs decision).
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
| `/` landing (`app/landing.css`) | CSS px/rem snapped to 4px multiples, half steps removed | fractional line-heights 0.98/1.04/1.25/1.4/1.45/1.55, `text-[Npx]` | Ratio line-heights on display type; snapping alters heading rhythm |
| `/sign-in`, `/sign-up` | spacing and arbitrary sizes snapped | `leading-[1.05]` on display titles, logo glyph bars `w-[6px]`, `gap-[3px]`, `rounded-[1px]` | Brand mark and display type |
| `/onboarding` (`onboarding.css`, `page.tsx` skeleton) | CSS px snapped; desktop control height 42 -> 40px; skeleton uses `var(--ob-control-h)` | coarse-pointer 44px, `text-[Npx]` | Touch target guidance |
| `/deactivated`, `/suspended` | spacing snapped | `text-[Npx]` | Type hierarchy |
| `/[slug]` booking wizard (`booking.css`, `_components/booking-wizard.tsx`) | half steps, arbitrary px, CSS px snapped | 320 audit hits remain, mostly `text-[Npx]`, steps 5/7/9/11, `rounded-[20/24/28px]` | Type hierarchy; 4px multiples |
| `/[slug]/confirmation` | spacing snapped | 103 hits remain, same causes | same |
| `/dashboard` (home) | half steps, arbitrary px snapped | page padding not unified | Needs decision |
| `/dashboard/bookings`, `bookings/[id]`, `bookings-table`, `booking-deep-link-client` | snapped | `text-[Npx]`, odd 4px steps | same |
| `/dashboard/calendar` (`calendar.css`) | CSS px snapped | hairlines, cell dimensions that are 4px multiples; chip/pill horizontal padding 6 -> 8px and 5 -> 4px, 3px accent bars -> 4px (`.rl-block-bar` top 9 -> 8px, height 34 -> 36px). Dot/chip radii kept. Not visually verified | Grid layout kept |
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
| Brand logo glyph bars (`w-[6px]`, `gap-[3px]`, `rounded-[1px]`), landing `.rl-mark` (2.5px gap, 4.5px bars, 19/15px heights), onboarding `.ob-brand-mark` (26px, 7px radius), header Plus icon `sm:size-3.5` | auth, landing, onboarding, header | Logo artwork |
| `rounded-[Npx]` (all TSX values), pill radius 99px | various | Not changed; radii are an owner decision |
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
