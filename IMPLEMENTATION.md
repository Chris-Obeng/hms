# HotelOS Pro — Implementation Tracker

> Room images · Guest gallery · Payment flow · Booking preview

## Status

| # | Task | Status |
|---|------|--------|
| 1 | Fix `staff_profiles` auth bug (`clerk_org_id` → `clerk_user_id`) | ✅ |
| 2 | New room type → return ID → auto-redirect to edit page (images first) | ✅ |
| 3 | Guest-facing room image lightbox gallery | ✅ |
| 4 | Booking wizard room selector: images + amenities | ✅ |
| 5 | Room availability dots on guest booking pages | ✅ |
| 6 | Payment verifier on confirmation page + policy flow | ✅ |
| 7 | Booking page preview panel in admin room type editor | ✅ |
| 8 | Polish, integrate, final wiring + TypeScript clean | ✅ |

---

## Task 1 — Auth Bug Fix ✅

`staff_profiles` has `clerk_org_id` (not `hotel_id`). Fixed `getSuperAdminHotel()` in `paystack.ts`, `getHotelScopedClient()` in `settings.ts` and `staff.ts` — query with `clerk_user_id` + `clerk_org_id`.

**Files:** `app/actions/paystack.ts` · `app/actions/settings.ts` · `app/actions/staff.ts`

---

## Task 2 — New Room Type → Auto-Redirect ✅

`createRoomType()` now returns `{ success, id }`. New page redirects to `/dashboard/rooms/types/{id}?new=1`. Edit page shows "Add photos" banner + `PhotosCard` at top via `photosFirst` prop. `RoomPreviewSheet` created. `RoomTypeForm` gets `photosFirst` + `onPreview` props.

**Files:** `app/actions/rooms.ts` · `app/dashboard/rooms/types/new/page.tsx` · `app/dashboard/rooms/types/[id]/page.tsx` · `app/dashboard/rooms/_components/room-type-form.tsx` · `app/dashboard/rooms/_components/room-preview-sheet.tsx`

---

## Task 3 — Guest Room Image Lightbox Gallery ✅

`RoomGallery`: full-screen, keyboard nav (←→ Esc), touch swipe, thumbnail strip, Book CTA inside. `RoomCard` updated: `images[]` + `amenities[]`, photo count badge on hover, click image → gallery. Rooms page + homepage pass full arrays.

**Files:** `app/(booking)/_components/room-gallery.tsx` · `app/(booking)/_components/room-card.tsx` · `app/(booking)/rooms/page.tsx` · `app/(booking)/page.tsx`

---

## Task 4 — Booking Wizard: Images + Amenities ✅

`RoomType` interface now has `images[]` + `amenities[]`. `RoomOptionCard` shows thumbnail, amenity pills, bed config, short description on selection, photo count badge opens `RoomGallery` inline without leaving the booking flow.

**Files:** `app/(booking)/book/_booking-wizard.tsx` · `app/(booking)/book/page.tsx`

---

## Task 5 — Availability Dots ✅

`RoomCard` accepts `availableCount: number | null`. Green dot ≥3, amber "Only N left" 1-2, red sold-out overlay = 0. No dates = `null` = no indicator shown. Rooms page passes count from `room_type_available_count` RPC.

**Files:** `app/(booking)/_components/room-card.tsx` · `app/(booking)/rooms/page.tsx`

---

## Task 6 — Payment Verifier + Policy Flow ✅

`PaymentVerifier` now polls `/api/booking/{slug}/payments/verify` every 2s up to 8 attempts. Shows "Confirming payment…" spinner → "Payment confirmed ✓" badge → fallback message if exhausted. Shown on confirmation page only when `isPending && trxref` (i.e. Paystack redirect, webhook not yet fired).

**Files:** `app/(booking)/book/confirmation/_payment-verifier.tsx` · `app/(booking)/book/confirmation/page.tsx`

---

## Task 7 — Booking Page Preview Panel ✅

`RoomPreviewSheet`: right-side sheet overlay showing guest-facing room card with hero image, amenity pills, pricing, thumbnail strip. Fetches hotel slug via Clerk `useAuth` + Supabase. Links to live booking page via `NEXT_PUBLIC_BOOKING_BASE_URL`.

**Files:** `app/dashboard/rooms/_components/room-preview-sheet.tsx` · `app/dashboard/rooms/types/[id]/page.tsx`

---

## Task 8 — Polish + Final Wiring ✅

- `saveRoomImages` now also invalidates `/dashboard/rooms/types/{id}` path
- Middleware dev slug override: `NEXT_PUBLIC_DEV_HOTEL_SLUG` env var or `?__slug=` query param routes booking pages locally
- Removed unused `useRouter` imports from `room-type-form.tsx` and `[id]/page.tsx`
- Removed unused `Grid2x2` import from `room-gallery.tsx`
- Fixed operator precedence bug in middleware dev slug condition
- `npx tsc --noEmit` → **0 errors**

**Files:** `middleware.ts` · `app/actions/upload.ts` · `app/dashboard/rooms/_components/room-type-form.tsx` · `app/(booking)/_components/room-gallery.tsx`

---

## End-to-End Flow

```
Staff: Create room type → auto-redirected to edit → uploads photos (shown first)
     → clicks Preview → sees exact guest view
     → sets payment policy in Settings → Paystack subaccount configured

Guest: Visits [slug].hotelosprp.com → sees rooms with photos + availability dots
     → clicks photo → lightbox gallery with Book CTA
     → /book → wizard shows room thumbnail + amenity pills
     → confirms → Paystack redirect (pay_now) or instant confirmation (pay_later)
     → /book/confirmation → PaymentVerifier polls until status confirmed
```

*Last updated: 2026-06-25 — TypeScript: 0 errors*


---

## Calendar Redesign — Dark Ops Theme ✅

**Design:** Deep `#0D1117` grid (GitHub-dark palette), monospace typography, left-stripe event blocks instead of full-fill, amber `#F0B429` primary action, surgical minimal toolbar.

**Changes:**
- `calendar.css` — full rewrite: `cal-wrap` shell, `cal-day-hdr`, `cal-room-hdr`, `cal-section-hdr`, `cal-evt` left-stripe events, dark scrollbar
- `calendar-helpers.ts` — `getEventHtml` uses new `.cal-evt` / `.cal-evt-stripe` / `.cal-evt-body` structure
- `calendar-resources.ts` — `buildSectionHeaderHtml` + `buildRoomRowHtml` use new `.cal-section-hdr` / `.cal-room-hdr` classes
- `calendar-events.ts` — passes `stripeColor` to `getEventHtml`, event `backColor` = `#1C2128` (dark card)
- `calendar-client.tsx` — full toolbar/layout rewrite: dark shell, monospace font, amber CTA, mobile list view fallback, filter panel dark-themed, CSS class names updated to new scheme

**TypeScript: 0 errors**
