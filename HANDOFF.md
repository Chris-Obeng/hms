# HotelOS Pro — Agent Handoff Document

> **Purpose:** This file tells the next agent exactly what was done, what is left, and step-by-step how to complete the remaining work. Read every section before writing a single line of code.

---

## 1. What Was Completed (Do NOT redo these)

All TypeScript errors are currently **0** (`npx tsc --noEmit` passes clean).

| Done | What |
|------|------|
| ✅ | Fixed `staff_profiles` auth bug — `clerk_org_id` used correctly throughout all action files |
| ✅ | `createRoomType()` returns `{ success, id }` — new room type redirects to edit page with `?new=1` |
| ✅ | Photos card rendered first in edit mode (`photosFirst` prop), with "Add photos" banner |
| ✅ | `RoomImagesUpload` component wired end-to-end: upload → Supabase Storage → saved to `room_types.images` JSONB |
| ✅ | `RoomGallery` lightbox: full-screen, keyboard nav (←→ Esc), touch swipe, thumbnail strip, Book CTA |
| ✅ | `RoomCard` (guest-facing): `images[]` + `amenities[]`, photo count badge, gallery on click, availability dots |
| ✅ | Booking wizard room selector: thumbnail + amenity pills + description on selection + gallery opens inline |
| ✅ | Payment verifier on confirmation page polls `/api/booking/{slug}/payments/verify` up to 8× at 2s intervals |
| ✅ | `RoomPreviewSheet` in admin: staff see exact guest view, uses `bookingUrl` prop (no runtime Supabase fetch) |
| ✅ | `getHotelSlug()` server action added to `app/actions/rooms.ts` |
| ✅ | Dashboard layout queries `slug` + `custom_domain`, builds `bookingUrl`, passes to `AppHeader` |
| ✅ | `AppHeader` shows booking URL in header bar (copy + open), and in user dropdown for mobile |
| ✅ | `BookingPageCard` component at top of `/dashboard/settings/hotel` — visible to all roles |
| ✅ | Middleware dev slug override: `NEXT_PUBLIC_DEV_HOTEL_SLUG` env var or `?__slug=` param |

---

## 2. What Is NOT Done (The next agent must do these)

All tasks from the original HANDOFF.md have been completed. The only deferred items are:

### Deferred by design — Beds24 / Arkesel internal API calls

The integrations settings page (`/dashboard/settings/integrations`) is built with config UI and save actions, but **no live API test calls** to Beds24 or Arkesel are wired. When ready to implement:

- **Beds24 test:** `GET https://api.beds24.com/api/v2/properties` with `Authorization: {apiKey}` header
- **Arkesel test SMS:** `POST https://sms.arkesel.com/api/v2/sms/send` with `api-key` header, body `{ message, recipients, sender }`
- Add a "Test Connection" button to each card in `integrations-client.tsx` that calls a new server action in `app/actions/integrations.ts`

### 2.1 — Settings: `integrations` page is missing

`/dashboard/settings/integrations` is listed in the sidebar and settings hub but **the page does not exist**. The settings hub links to it at `href: "/dashboard/settings/integrations"`.

**Required:** Create `app/dashboard/settings/integrations/page.tsx` with three integration cards:
- **Beds24** (OTA sync): API key input, Property ID, last sync time, connection status badge, "Test Connection" button, "Force Full Sync" (super_admin only), room mapping table
- **Arkesel** (SMS/Email): API key input, sender name, "Send Test SMS" button, connection status
- **Paystack** status card: shows `paystack_subaccount_code` and last txn date, link to `/dashboard/settings/payments`

The DB columns already exist on `hotels`: `beds24_property_id`, `beds24_api_key`, `arkesel_api_key`, `arkesel_sender_name`.

Save via a server action — update `hotels` table. Only super_admin can edit.

---

### 2.2 — Settings: `notifications` page needs `hotel_id` fix

`app/dashboard/settings/notifications/page.tsx` exists but calls `getNotificationPrefs()` and `updateNotificationPrefs()` from `app/actions/settings.ts`. These were fixed to use `clerk_user_id` + `clerk_org_id` (correct). **Verify the page actually renders** — check for any remaining import or runtime errors.

---

### 2.3 — Booking homepage currency hardcoded to "GHS"

In `app/(booking)/page.tsx`, the homepage room cards pass `currency="GHS"` hardcoded:

```tsx
// Current (wrong):
currency="GHS"

// Fix — hotel.currency is already fetched:
currency={hotel.currency ?? "GHS"}
```

**File:** `app/(booking)/page.tsx` — find the `RoomCard` map and replace `currency="GHS"` with `currency={hotel.currency ?? "GHS"}`.

---

### 2.4 — `RoomPreviewSheet` missing `bookingUrl` in `[id]/page.tsx` for "Save photos" auto-update

When staff saves photos via `PhotosCard`, the preview sheet still shows old images until they close and reopen it. The `images` state in `[id]/page.tsx` and the `roomData` passed to `RoomPreviewSheet` are separate. 

**Fix:** In `[id]/page.tsx`, when `setImages` fires from the form, also update `roomData.images`. Pass an `onImagesChange` callback from the `[id]` page down to `RoomTypeForm` → `PhotosCard`, then call `setRoomData(prev => ({...prev, images: newImages}))`.

This is a polish item — not critical to ship.

---

### 2.5 — `settings/hotel` page: `BookingPageCard` shown to all roles but edit form is super_admin-only

Currently `BookingPageCard` renders before the super_admin check, so all staff can see the booking URL (good — they should). But ensure the `staffName` passed to `HotelSettingsClient` shows correctly. Verify by checking `currentUser?.full_name` is populated in the DB. No code change needed unless you find it always shows blank.

---

### 2.6 — Paystack `createSubaccount` bug: wrong field name

In `app/actions/paystack.ts` → `savePaystackBankAccount()`, the `createSubaccount` call passes:
```ts
primary_contact_email: hotel.name,  // ← BUG: passing hotel name, not email
```
Should be:
```ts
primary_contact_email: hotel.name,  // hotel object only has `name`, not `email`
```
The hotel `email` is not fetched in `getSuperAdminHotel()`. Fix: add `email` to the select query in `getSuperAdminHotel()`, then pass `primary_contact_email: hotel.email ?? ""`.

**File:** `app/actions/paystack.ts`

---

### 2.7 — Dashboard overview page (`/dashboard`) missing KPI data for today

`app/dashboard/page.tsx` and `app/dashboard/dashboard-client.tsx` exist but need verification that the "Today's Arrivals", "Today's Departures", "Available Rooms", and "Revenue Today" KPI cards fetch live data correctly. Check `app/dashboard/actions.ts` — if any query uses wrong column names or returns empty, fix it.

---

### 2.8 — `settings/hotel` page: missing `cancellation_policy` field

The PRD requires a cancellation policy text field in hotel settings. The `hotels` table has `cancellation_policy TEXT` column. The `HotelSettingsClient` and `updateHotelProfile` action do NOT include it.

**Fix:**
1. In `app/actions/settings.ts` → `HotelProfileSchema`: add `cancellationPolicy: z.string().max(500).optional().or(z.literal(""))`
2. In `updateHotelProfile`: add `cancellation_policy: data.cancellationPolicy || null`
3. In `getHotelProfile`: add `cancellationPolicy: data.cancellation_policy || ""`
4. In `app/dashboard/settings/hotel/hotel-client.tsx`: add a textarea for cancellation policy in the Operations card
5. In `app/dashboard/settings/hotel/page.tsx`: add `cancellation_policy` to the select query and pass to `HotelSettingsClient`

---

## 3. Key Architecture Facts (Must Know)

```
Stack: Next.js 16 App Router · Supabase PostgreSQL · Clerk Auth · Paystack · Tailwind v4 · Shadcn UI

Route groups:
  /dashboard/*          → Hotel staff admin (Clerk auth required)
  /(booking)/*          → Guest booking app (no auth, slug from x-hotel-slug header)
  /api/booking/[slug]/* → Public booking API routes

Multi-tenancy:
  - Hotels identified by clerk_org_id (staff) or slug/custom_domain (guests)
  - staff_profiles has clerk_org_id (NOT hotel_id) — join via hotels.clerk_org_id = staff_profiles.clerk_org_id
  - ALL hotel-scoped tables use hotel_id FK

Auth pattern (server actions):
  const { orgId, userId } = await auth()           // Clerk
  supabase.from("hotels").eq("clerk_org_id", orgId) // get hotel
  supabase.from("staff_profiles").eq("clerk_user_id", userId).eq("clerk_org_id", orgId) // check role

Payment policy:
  - Stored in hotels.settings JSONB as { payment_policy: "choice" | "pay_now_only" | "pay_later_only" }
  - Enforced in /api/booking/[slug]/bookings/route.ts
  - Displayed in BookingWizard (book/page.tsx → _booking-wizard.tsx)

Room images:
  - Stored as room_types.images JSONB: [{url, caption, order}]
  - Uploaded to Supabase Storage bucket "hotel-assets" at hotels/{hotel_id}/room-types/{room_type_id}/
  - Saved via saveRoomImages() server action (app/actions/upload.ts)

Paystack flow:
  - Guest pays → Paystack redirect → callback_url = /book/confirmation?reference={bookingRef}&trxref={paystackRef}
  - Webhook fires → /api/webhooks/paystack/route.ts confirms booking
  - PaymentVerifier component polls /api/booking/{slug}/payments/verify as fallback
```

---

## 4. File Map (All Modified/Created Files)

```
app/
  actions/
    paystack.ts          — getSuperAdminHotel() fixed; savePaystackBankAccount has email bug (Task 2.6)
    rooms.ts             — createRoomType() returns id; getHotelSlug() added
    settings.ts          — getHotelScopedClient fixed; cancellationPolicy missing (Task 2.8)
    staff.ts             — getHotelScopedClient fixed
    upload.ts            — saveRoomImages revalidates edit page path too

  (booking)/
    page.tsx             — homepage; currency hardcoded "GHS" bug (Task 2.3)
    rooms/page.tsx       — full images+amenities+availableCount passed to RoomCard
    book/
      page.tsx           — passes images+amenities to BookingWizard
      _booking-wizard.tsx — RoomOptionCard: thumbnail, amenity pills, gallery
      confirmation/
        page.tsx         — shows PaymentVerifier when isPending+trxref
        _payment-verifier.tsx — polls verify endpoint, shows spinner→confirmed

    _components/
      room-card.tsx      — images[], amenities[], availableCount, gallery on click
      room-gallery.tsx   — fullscreen lightbox, keyboard/swipe/thumbnails, Book CTA

  dashboard/
    layout.tsx           — fetches slug+custom_domain, builds bookingUrl, passes to AppHeader
    settings/
      hotel/
        page.tsx         — fetches slug, renders BookingPageCard at top
        booking-page-card.tsx  — copy+open booking link card (NEW)
      integrations/      — DOES NOT EXIST (Task 2.1 — must create)

  api/
    webhooks/paystack/route.ts  — HMAC-validated, idempotent, confirmed ✅

components/
  layout/
    app-header.tsx       — bookingUrl prop: shows URL bar + copy + dropdown items

  dashboard/rooms/
    _components/
      room-type-form.tsx  — photosFirst+onPreview props; PhotosCard at top; no useRouter bug fixed
      room-preview-sheet.tsx — bookingUrl prop (no runtime Supabase fetch)
    types/
      [id]/page.tsx      — fetches bookingUrl via getHotelSlug(), passes to RoomPreviewSheet
      new/page.tsx       — redirects to /dashboard/rooms/types/{id}?new=1 on success

middleware.ts            — dev slug override via NEXT_PUBLIC_DEV_HOTEL_SLUG or ?__slug=
```

---

## 5. Step-by-Step Instructions for Remaining Tasks

### Step 1: Fix the Paystack email bug (Task 2.6) — 5 min

**File:** `app/actions/paystack.ts`

In `getSuperAdminHotel()`, change the select to include `email`:
```ts
.select("id, name, email, paystack_subaccount_code, ...")
```
Then in `savePaystackBankAccount()`, change:
```ts
primary_contact_email: hotel.name,   // wrong
// to:
primary_contact_email: hotel.email ?? "",  // correct
```

---

### Step 2: Fix currency hardcode on booking homepage (Task 2.3) — 2 min

**File:** `app/(booking)/page.tsx`

Find the `<RoomCard ... currency="GHS" ...>` and change to `currency={hotel.currency ?? "GHS"}`.

Also remove the `firstImage` dummy function (`const firstImage = (_: any) => null;`) since it's unused.

---

### Step 3: Add `cancellationPolicy` to hotel settings (Task 2.8) — 20 min

**File 1:** `app/actions/settings.ts`
- Add to `HotelProfileSchema`: `cancellationPolicy: z.string().max(500).optional().or(z.literal(""))`
- Add to `getHotelProfile` return: `cancellationPolicy: data.cancellation_policy || ""`
- Add to `updateHotelProfile` update: `cancellation_policy: data.cancellationPolicy || null`

**File 2:** `app/dashboard/settings/hotel/page.tsx`
- Add `cancellation_policy` to the hotel select query
- Pass `cancellationPolicy: hotel.cancellation_policy || ""` in `initialData`

**File 3:** `app/dashboard/settings/hotel/hotel-client.tsx`
- Add `cancellationPolicy` to the `initialData` type and `values` state
- Add a `<textarea>` in the Operations card below check-out time:
  ```tsx
  <div>
    <label>Cancellation Policy</label>
    <textarea
      placeholder="e.g. Free cancellation up to 24 hours before check-in..."
      value={values.cancellationPolicy}
      onChange={(e) => set("cancellationPolicy", e.target.value)}
      rows={3}
      maxLength={500}
    />
  </div>
  ```

---

### Step 4: Create the Integrations settings page (Task 2.1) — 45 min

**Create:** `app/dashboard/settings/integrations/page.tsx`

This is a server component that:
1. Fetches hotel data: `beds24_property_id`, `beds24_api_key`, `arkesel_api_key`, `arkesel_sender_name`, `paystack_subaccount_code`, from `hotels` table
2. Checks user is super_admin via `staff_profiles`
3. Renders `<IntegrationsClient>` with initial data

**Create:** `app/dashboard/settings/integrations/integrations-client.tsx`

Client component with three cards:

**Card 1 — Beds24:**
```
- Status badge: green "Connected" if beds24_property_id is set, else red "Not connected"
- Input: API Key (type=password, masked)
- Input: Property ID
- Button: "Save Beds24 Config" → calls server action to update hotels.beds24_api_key + beds24_property_id
- Button: "Test Connection" → calls server action that hits Beds24 API /api/v2/properties, shows success/error toast
- Note: "Room mapping is done by HotelOS staff during onboarding."
```

**Card 2 — Arkesel:**
```
- Status badge: green if arkesel_api_key set
- Input: API Key (masked)
- Input: Sender Name
- Button: "Save Arkesel Config"
- Button: "Send Test SMS" → calls server action that sends a test SMS to the super_admin's phone
```

**Card 3 — Paystack:**
```
- Status card showing: subaccount code (if set), "Active" badge
- Link button: "Manage bank account → /dashboard/settings/payments"
```

**Create:** `app/actions/integrations.ts` server action file:
```ts
"use server"
// saveBedsConfig(apiKey, propertyId) — updates hotels table
// testBeds24Connection() — calls Beds24 /api/v2/properties with stored API key
// saveArkeselConfig(apiKey, senderName) — updates hotels table
// sendTestSms(phone) — calls Arkesel API to send test SMS
```

For Beds24 test: `GET https://api.beds24.com/api/v2/properties` with `Authorization: {apiKey}` header.
For Arkesel SMS: `POST https://sms.arkesel.com/api/v2/sms/send` with `api-key` header.

---

### Step 5: Verify notifications page (Task 2.2) — 10 min

Open `app/dashboard/settings/notifications/page.tsx`. Confirm it:
1. Calls `getNotificationPrefs()` from `app/actions/settings.ts`
2. That action uses `.eq("clerk_user_id", userId).eq("clerk_org_id", orgId)` ← should be correct after our fix
3. The page renders toggle switches for each event type
4. Run `npx tsc --noEmit` — should be 0 errors

If it 404s or errors, check the file exists and exports a default function.

---

### Step 6: Final TypeScript check and test

After all changes:
```powershell
cd C:\Users\hp\Desktop\hms
npx tsc --noEmit
```
Must return 0 errors before considering done.

---

## 6. Environment Variables Reference

```
# In .env.local
NEXT_PUBLIC_SUPABASE_URL=https://wtgldgyxtpbzjmaygeif.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
PAYSTACK_SECRET_KEY=...   ← needed for payments; check if set

# For local booking page testing (optional):
NEXT_PUBLIC_DEV_HOTEL_SLUG=your-hotel-slug
NEXT_PUBLIC_BASE_DOMAIN=hotelosprp.com
```

Check `PAYSTACK_SECRET_KEY` is in `.env.local`. If missing, Paystack calls will fail silently.

---

## 7. Running Locally

```powershell
# In C:\Users\hp\Desktop\hms
npm run dev   # or: pnpm dev

# Admin dashboard:    http://localhost:3000/dashboard
# Booking page (dev): http://localhost:3000/?__slug=your-slug
#                  or http://localhost:3000/book?__slug=your-slug
```

---

## 8. Priority Order

1. **Step 2** (currency bug) — 2 min, pure bug fix
2. **Step 1** (Paystack email) — 5 min, pure bug fix  
3. **Step 3** (cancellation policy) — 20 min, missing field
4. **Step 5** (verify notifications) — 10 min, sanity check
5. **Step 4** (integrations page) — 45 min, new page
6. **Step 4 polish** (preview sheet image sync) — optional polish

*Last updated: 2026-06-25*
