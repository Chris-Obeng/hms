# HotelOS Pro — Platform Admin Setup Guide

> **Who this is for**: Internal HotelOS team members who need access to the
> `/platform/*` dashboard to manage hotels, plans, and billing.

---

## Architecture Overview

| Layer | Tech | Notes |
|-------|------|-------|
| Authentication | **Supabase Auth** (email + password) | Never Clerk — Clerk is hotel-staff only |
| Authorisation | `platform_admins` table whitelist | Valid session alone is not enough; `is_active` must be `true` |
| Session refresh | `proxy.ts` (`updatePlatformSession`) | Runs on every `/platform/*` request via `getClaims()` |
| Server client | `lib/supabase/platform-server.ts` | Cookie-based SSR, no Clerk JWT |
| Admin queries | `supabaseAdmin` (service role) | Bypasses RLS — authoritative whitelist check |

> **IMPORTANT**: Do NOT use Clerk tokens in the platform area, and do NOT use
> Supabase Auth in the hotel-staff dashboard. These two auth systems are completely isolated.

---

## Step 1 — Supabase Auth URL Configuration (once per environment)

Go to **Supabase Dashboard → Authentication → URL Configuration**.

### Site URL

| Environment | Value |
|-------------|-------|
| Development | `http://localhost:3000` |
| Production  | `https://hotelosprp.com` |

### Redirect URLs (add both)

```
http://localhost:3000/platform/auth/confirm
https://hotelosprp.com/platform/auth/confirm
```

These are used by the password-reset email flow.
`app/platform/auth/confirm/route.ts` handles the OTP token exchange.

---

## Step 2 — Disable Email Confirmations for Platform Admins

Go to **Supabase Dashboard → Authentication → Providers → Email**.

Set **"Confirm email"** to **OFF**.

Platform admins are added manually by the HotelOS team via SQL — not via public sign-up —
so email confirmation adds friction with no benefit.

> **NOTE**: If you use the **Invite user** flow (Step 3B), Supabase sends a magic-link
> email handled by `/platform/auth/confirm`. That is fine — the invite link IS the
> confirmation step.

---

## Step 3 — Creating a New Platform Admin Account

There are two methods. **Method A is simpler.**

### Method A — "Add user" (instant, no email required)

1. **Supabase Dashboard → Authentication → Users → Add user**
   Enter email + a strong temporary password → **Create user**.

2. **Copy the UUID** of the new user (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

3. **Supabase SQL Editor → New query** — run:

```sql
INSERT INTO platform_admins (supabase_user_id, email, full_name, role, is_active)
VALUES (
  '<paste-uuid-here>',
  'admin@hotelosprp.com',
  'Admin Full Name',
  'super_admin',
  true
);
```

4. Share the email + temporary password with the admin.
   They can reset it at `/platform/forgot-password`.

**Valid `role` values:**
- `super_admin` — full access, including plan changes
- `admin` — approve/suspend hotels, but cannot change plans

---

### Method B — "Invite user" (sends a magic-link setup email)

1. **Supabase Dashboard → Authentication → Users → Invite user**
   Enter the admin's email. Supabase sends a magic-link email.

2. Admin clicks the link → `/platform/auth/confirm` → `/platform/update-password`
   They set their own password.

3. **After** the admin sets their password, insert them into the whitelist:

```sql
-- Find their UUID first
SELECT id, email FROM auth.users WHERE email = 'admin@hotelosprp.com';

-- Then insert
INSERT INTO platform_admins (supabase_user_id, email, full_name, role, is_active)
VALUES ('<uuid-from-above>', 'admin@hotelosprp.com', 'Admin Full Name', 'super_admin', true);
```

> **CAUTION**: The admin **cannot sign in** until the `platform_admins` row exists
> with `is_active = true`. Attempting to sign in before the row is inserted shows an
> "unauthorized" error and immediately signs them out.

---

## Step 4 — Signing In

- **Dev**: `http://localhost:3000/platform/sign-in`
- **Prod**: `https://hotelosprp.com/platform/sign-in`

Enter email + password → redirected to `/platform/dashboard`.

**What happens under the hood:**
1. `proxy.ts` runs `getClaims()` on every request (local JWT — no network round-trip)
2. `app/platform/layout.tsx` double-checks the `platform_admins` whitelist via service role
3. Either check failing → signed out → `/platform/sign-in?error=unauthorized`

---

## Step 5 — Resetting a Password

### Self-service (admin resets their own password)

1. `/platform/sign-in` → click **"Forgot password?"**
2. Enter email → receive a password reset email
3. Click the link → `/platform/auth/confirm` → `/platform/update-password`
4. Enter new password → sign in

### Manual reset (HotelOS team resets for another admin)

**Supabase Dashboard → Authentication → Users** → find the user → **Send password reset email**.

Emergency SQL reset (bypasses validation — use sparingly):

```sql
UPDATE auth.users
SET encrypted_password = crypt('NewTemporaryPass!', gen_salt('bf'))
WHERE email = 'admin@hotelosprp.com';
```

> **WARNING**: Always ask the admin to change their password immediately after a manual reset.

---

## Step 6 — Deactivating a Platform Admin

Revoke access (keeps the Supabase Auth user intact):

```sql
UPDATE platform_admins SET is_active = false WHERE email = 'admin@hotelosprp.com';
```

The next request they make will fail the whitelist check — they are signed out automatically.

Full deletion:

```sql
-- Remove from whitelist
DELETE FROM platform_admins WHERE email = 'admin@hotelosprp.com';

-- Delete from Supabase Auth (or Dashboard → Authentication → Users → Delete)
DELETE FROM auth.users WHERE email = 'admin@hotelosprp.com';
```

---

## New Environment Checklist

- [ ] Supabase → Authentication → URL Configuration → **Site URL** set correctly
- [ ] Supabase → Authentication → URL Configuration → **Redirect URLs** include
      `/platform/auth/confirm` for both dev and prod
- [ ] Supabase → Authentication → Providers → Email → **"Confirm email" OFF**
- [ ] At least one row in `platform_admins` with `is_active = true` and `supabase_user_id` set
- [ ] Environment variables present:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

---

## File Reference

| File | Purpose |
|------|---------|
| `proxy.ts` | Middleware — session refresh + redirect for `/platform/*` |
| `lib/supabase/platform-server.ts` | SSR Supabase client (cookie-based, no Clerk JWT) |
| `app/platform/layout.tsx` | Auth gate + `platform_admins` whitelist check |
| `app/platform/sign-in/page.tsx` | Sign-in page (public route — outside the auth layout) |
| `app/platform/sign-in/_components/login-form.tsx` | Client-side email + password login form |
| `app/platform/forgot-password/` | Password reset request flow |
| `app/platform/update-password/` | Password update form (after reset link) |
| `app/platform/auth/confirm/route.ts` | OTP token exchange (magic-link + reset emails) |
| `app/platform/auth/error/page.tsx` | Auth error display page |
| `app/platform/dashboard/layout.tsx` | Dashboard shell — sidebar, nav, admin identity, sign-out |
| `app/platform/dashboard/_actions.ts` | Server actions — approve / suspend / reactivate / plan |
| `app/platform/dashboard/_sign-out.tsx` | Client-side sign-out button |
| `app/platform/dashboard/page.tsx` | Overview with hotel stats |
| `app/platform/dashboard/hotels/page.tsx` | Hotels list with filters |
| `app/platform/dashboard/_components/hotels-table.tsx` | Hotels table with action buttons |
