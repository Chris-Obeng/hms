# RoomLine — Database Schema Reference

> Last regenerated: 2026-06-14
> Source of truth: `supabase/migrations/*.sql` (apply with `pnpm db:push`)
> Regenerate TypeScript types: `pnpm db:types`

This file is the human-readable companion to the live PostgreSQL schema.
For the machine-readable form, see `types/database.types.ts` (auto-generated
from the same schema).

---

## Conventions

- **Primary keys**: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` on every
  table. No serial / integer PKs anywhere.
- **Timestamps**: every table has `created_at timestamptz NOT NULL DEFAULT now()`
  and (where mutated) `updated_at timestamptz NOT NULL DEFAULT now()`.
  `updated_at` is auto-bumped by the `handle_updated_at()` trigger function.
  Append-only tables (`audit_logs`, `beds24_sync_log`) deliberately omit
  `updated_at` and instead block UPDATE/DELETE entirely with
  `prevent_modification()` (see [Append-only Tables](#append-only-tables)).
- **Tenant isolation**: all hotel-scoped tables have a `hotel_id uuid` FK to
  `hotels.id` and RLS policies keyed on `clerk_org_id` (see the
  `staff_profiles` callout below).
- **Money**: stored as `NUMERIC(10,2)` per the PRD. Do not migrate to integer
  pesewas without a PRD update — the task spec's "integer money" rule
  carves out an exception when the PRD explicitly chose decimal.
- **Soft delete**: most tables use `is_active boolean DEFAULT true` rather
  than a `deleted_at` column. The PRD does not use `deleted_at` anywhere.

---

## Tables

### `hotels`

Stores hotel / property profiles. One row per Clerk Organization.
The `clerk_org_id` column is the bridge to Clerk's Organization.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `slug` | `text` | UNIQUE. URL-safe hotel identifier (e.g. `golden-palm`) |
| `name` | `varchar(255)` | Hotel display name |
| `description` | `text` | Public marketing description |
| `address` | `text` | |
| `city` | `text` | |
| `country` | `text` | DEFAULT `'Ghana'` |
| `phone` | `varchar(32)` | |
| `email` | `varchar(320)` | |
| `logo_url` | `text` | Supabase Storage path |
| `cover_image_url` | `text` | Supabase Storage path |
| `timezone` | `text` | DEFAULT `'Africa/Accra'` |
| `currency` | `text` | DEFAULT `'GHS'` |
| `check_in_time` | `time` | DEFAULT `'14:00'` |
| `check_out_time` | `time` | DEFAULT `'11:00'` |
| `cancellation_policy` | `text` | |
| `custom_domain` | `text` | UNIQUE. e.g. `book.theirhotel.com` |
| `clerk_org_id` | `text` | UNIQUE. Bridge to Clerk Organization |
| `paystack_subaccount_code` | `text` | UNIQUE. e.g. `ACCT_xxxxxxxxxx` |
| `paystack_business_name` | `text` | |
| `paystack_bank_code` | `text` | |
| `paystack_account_number` | `text` | |
| `paystack_settlement_schedule` | `text` | DEFAULT `'auto'` |
| `beds24_property_id` | `text` | |
| `beds24_api_key` | `text` | Encrypted at app layer |
| `arkesel_api_key` | `text` | Encrypted at app layer |
| `arkesel_sender_name` | `text` | |
| `plan` | `text` | CHECK in (`starter`, `growth`, `professional`) |
| `status` | `text` | CHECK in (`pending`, `active`, `suspended`, `cancelled`) |
| `settings` | `jsonb` | DEFAULT `'{}'` |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Auto-bumped by trigger |

- **CHECK**: `plan IN ('starter','growth','professional')`, `status IN ('pending','active','suspended','cancelled')`
- **UNIQUE**: `slug`, `clerk_org_id`, `custom_domain`, `paystack_subaccount_code`
- **RLS**: org isolation via `get_user_hotel_ids()`
- **Indexes**: `idx_hotels_slug`, `idx_hotels_status`, GIN on `settings`

### `staff_profiles`

One row per staff member per hotel. Synced from Clerk via the
`organizationMembership.*` webhooks.

**Schema optimization (overrides PRD):** this table does **not** have a
`hotel_id` UUID FK. Instead it has `clerk_org_id text NOT NULL` and a
UNIQUE `(clerk_user_id, clerk_org_id)` constraint. This avoids the race
condition where the Clerk webhook fires before the `hotels` row is inserted.

To join staff to hotel, use:
```sql
JOIN hotels ON hotels.clerk_org_id = staff_profiles.clerk_org_id
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `clerk_user_id` | `text` | UNIQUE was on (user, hotel) — now (user, org) |
| `clerk_org_id` | `text` | NOT NULL. Bridge to Clerk Organization |
| `email` | `text` | NOT NULL |
| `full_name` | `text` | |
| `avatar_url` | `text` | |
| `role` | `text` | CHECK in (`pending`, `super_admin`, `manager`, `front_desk`, `read_only`) |
| `is_active` | `boolean` | DEFAULT `false` until manager approval |
| `granted_at` | `timestamptz` | When access was approved |
| `granted_by` | `uuid` | FK → `staff_profiles.id` (self-ref) |
| `last_login_at` | `timestamptz` | |
| `notification_prefs` | `jsonb` | Default `{new_booking:true, payment_received:true, cancellation:true, ota_conflict:true}` |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Auto-bumped by trigger |

- **CHECK**: `role IN ('pending','super_admin','manager','front_desk','read_only')`
- **UNIQUE**: `(clerk_user_id, clerk_org_id)`
- **RLS**: org isolation via `clerk_org_id IN (SELECT get_user_clerk_org_ids())`
- **Indexes**: `idx_staff_profiles_clerk_user_id`, `idx_staff_profiles_clerk_org_id`, GIN on `notification_prefs`

### `room_types`

Categorical room definitions. The "Deluxe King", "Standard Twin", etc.
A physical `room` references one `room_type`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `hotel_id` | `uuid` | FK → `hotels.id` ON DELETE CASCADE |
| `name` | `text` | NOT NULL |
| `slug` | `text` | NOT NULL |
| `short_description` | `text` | |
| `description` | `text` | |
| `bed_configuration` | `text` | e.g. "1 King + 1 Sofa" |
| `max_adults` | `int` | DEFAULT 2 |
| `max_children` | `int` | DEFAULT 0 |
| `base_price` | `numeric(10,2)` | NOT NULL. CHECK ≥ 0 |
| `weekend_price` | `numeric(10,2)` | |
| `amenities` | `jsonb` | `[{icon, label}, ...]` |
| `images` | `jsonb` | `[{url, caption, order}, ...]` |
| `is_active` | `boolean` | DEFAULT `true` |
| `sort_order` | `int` | DEFAULT 0 |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Auto-bumped |

- **UNIQUE**: `(hotel_id, slug)`
- **RLS**: org isolation via `get_user_hotel_ids()`
- **Indexes**: `idx_room_types_hotel_id`, GIN on `amenities` and `images`

### `rooms`

Individual physical rooms. Each has a `room_number` and belongs to a
`room_type`. The `status` column tracks whether a room can be sold or occupied.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `hotel_id` | `uuid` | FK → `hotels.id` ON DELETE CASCADE |
| `room_type_id` | `uuid` | FK → `room_types.id` ON DELETE RESTRICT |
| `room_number` | `text` | NOT NULL |
| `floor` | `text` | |
| `notes` | `text` | |
| `status` | `text` | CHECK in (`available`, `occupied`, `maintenance`, `out_of_service`) |
| `is_active` | `boolean` | DEFAULT `true` |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Auto-bumped |

- **UNIQUE**: `(hotel_id, room_number)`
- **RLS**: org isolation via `get_user_hotel_ids()`
- **Indexes**: `idx_rooms_hotel_id`, `idx_rooms_room_type_id`, `idx_rooms_status`

### `guests`

Guest profiles. Always scoped to a single hotel (no cross-hotel guest DB).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `hotel_id` | `uuid` | FK → `hotels.id` ON DELETE CASCADE |
| `full_name` | `text` | NOT NULL |
| `email` | `text` | |
| `phone` | `text` | |
| `national_id` | `text` | Ghana Card / passport |
| `nationality` | `text` | |
| `notes` | `text` | |
| `tags` | `jsonb` | `['vip', 'regular', 'flagged']` |
| `total_stays` | `int` | DEFAULT 0 |
| `total_spend` | `numeric(12,2)` | DEFAULT 0 |
| `last_stay_date` | `date` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Auto-bumped |

- **RLS**: org isolation via `get_user_hotel_ids()`
- **Indexes**: `idx_guests_hotel_id`, `(hotel_id, email)`, `(hotel_id, phone)`, trigram GIN on `full_name`, GIN on `tags`

### `bookings`

The heart of the app. Every reservation regardless of source.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `hotel_id` | `uuid` | FK → `hotels.id` ON DELETE CASCADE |
| `reference` | `text` | UNIQUE. Format `HOP-YYYY-NNNNN` |
| `guest_id` | `uuid` | FK → `guests.id` ON DELETE SET NULL |
| `room_id` | `uuid` | FK → `rooms.id` ON DELETE SET NULL |
| `room_type_id` | `uuid` | FK → `room_types.id` ON DELETE SET NULL |
| `check_in` | `date` | NOT NULL |
| `check_out` | `date` | NOT NULL. CHECK ≥ `check_in` |
| `nights` | `int` | GENERATED `check_out - check_in` |
| `adults` | `int` | DEFAULT 1 |
| `children` | `int` | DEFAULT 0 |
| `room_rate` | `numeric(10,2)` | NOT NULL |
| `subtotal` | `numeric(10,2)` | NOT NULL |
| `tax_amount` | `numeric(10,2)` | DEFAULT 0 |
| `total_amount` | `numeric(10,2)` | NOT NULL |
| `amount_paid` | `numeric(10,2)` | DEFAULT 0 |
| `outstanding_balance` | `numeric(10,2)` | GENERATED `total_amount - amount_paid` |
| `currency` | `text` | DEFAULT `'GHS'` |
| `status` | `text` | CHECK in (`pending`, `confirmed`, `checked_in`, `checked_out`, `cancelled`, `no_show`) |
| `payment_status` | `text` | CHECK in (`unpaid`, `partial`, `paid`, `refunded`) |
| `payment_preference` | `text` | CHECK in (`pay_now`, `pay_at_checkin`) |
| `source` | `text` | CHECK in (`direct`, `bookings_com`, `manual`, `phone`, `walk_in`) |
| `special_requests` | `text` | |
| `estimated_arrival` | `time` | |
| `internal_notes` | `text` | |
| `check_in_at` | `timestamptz` | Set on check-in |
| `check_out_at` | `timestamptz` | Set on check-out |
| `cancelled_at` | `timestamptz` | |
| `cancellation_reason` | `text` | |
| `beds24_booking_id` | `text` | Set for OTA bookings |
| `created_by` | `uuid` | FK → `staff_profiles.id` |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Auto-bumped |

- **CHECK**: `status`, `payment_status`, `payment_preference`, `source` enums; `check_out >= check_in`
- **UNIQUE**: `reference`
- **RLS**: org isolation via `get_user_hotel_ids()`
- **Indexes**: `idx_bookings_hotel_id`, `idx_bookings_checkin` (`hotel_id, check_in`), `idx_bookings_checkout`, `idx_bookings_status`, `idx_bookings_ref`, partial `idx_bookings_active` on `(hotel_id, check_in) WHERE status NOT IN ('cancelled','checked_out','no_show')`

### `payments`

Every payment transaction against a booking. Cash, POS, Paystack, refunds.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `hotel_id` | `uuid` | FK → `hotels.id` ON DELETE CASCADE |
| `booking_id` | `uuid` | FK → `bookings.id` ON DELETE CASCADE |
| `amount` | `numeric(10,2)` | NOT NULL |
| `currency` | `text` | DEFAULT `'GHS'` |
| `method` | `text` | CHECK in (`card`, `bank_transfer`, `ussd`, `mobile_money`, `cash`, `pos`, `paystack_link`, `refund`) |
| `paystack_reference` | `text` | UNIQUE |
| `paystack_id` | `text` | |
| `paystack_subaccount` | `text` | Subaccount used for this txn |
| `platform_fee` | `numeric(10,2)` | RoomLine cut (post-MVP) |
| `status` | `text` | CHECK in (`pending`, `success`, `failed`, `refunded`) |
| `paid_at` | `timestamptz` | |
| `recorded_by` | `uuid` | FK → `staff_profiles.id` |
| `notes` | `text` | |
| `metadata` | `jsonb` | DEFAULT `'{}'` |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Auto-bumped (added in `20240101001400_add_updated_at.sql`) |

- **RLS**: org isolation via `get_user_hotel_ids()`
- **Indexes**: `idx_payments_booking_id`, `idx_payments_hotel_id`, `idx_payments_ref`, GIN on `metadata`

### `availability_blocks`

Soft-blocks a room for a date range — maintenance, owner use, renovation.
The booking flow excludes these dates from availability.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `hotel_id` | `uuid` | FK → `hotels.id` ON DELETE CASCADE |
| `room_id` | `uuid` | FK → `rooms.id` ON DELETE CASCADE |
| `start_date` | `date` | NOT NULL |
| `end_date` | `date` | NOT NULL. CHECK > `start_date` |
| `reason` | `text` | CHECK in (`maintenance`, `deep_cleaning`, `owner_use`, `renovation`, `other`) |
| `notes` | `text` | |
| `created_by` | `uuid` | FK → `staff_profiles.id` |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Auto-bumped (added in `20240101001400_add_updated_at.sql`) |

- **RLS**: org isolation via `get_user_hotel_ids()`
- **Indexes**: `idx_availability_blocks_hotel_id`, `idx_availability_blocks_room_id`

### `notifications`

In-app bell-icon notifications for staff.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `hotel_id` | `uuid` | FK → `hotels.id` ON DELETE CASCADE |
| `type` | `text` | CHECK in (`new_booking`, `booking_cancelled`, `payment_received`, `payment_failed`, `ota_conflict`, `staff_access_request`, `check_in_reminder`, `check_out_reminder`) |
| `title` | `text` | NOT NULL |
| `message` | `text` | NOT NULL |
| `booking_id` | `uuid` | FK → `bookings.id` ON DELETE SET NULL |
| `is_read` | `boolean` | DEFAULT `false` |
| `read_at` | `timestamptz` | |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Auto-bumped (added in `20240101001400_add_updated_at.sql`) |

- **RLS**: org isolation via `get_user_hotel_ids()`
- **Indexes**: `(hotel_id, created_at DESC)`, partial `idx_notifications_unread` on `(hotel_id) WHERE is_read = false`

### `beds24_property_mappings`

Maps a Beds24 `room_id` to a RoomLine `room_type_id`. Set up once during
onboarding by RoomLines staff.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `hotel_id` | `uuid` | FK → `hotels.id` ON DELETE CASCADE |
| `beds24_property_id` | `text` | NOT NULL |
| `beds24_room_id` | `text` | NOT NULL |
| `room_type_id` | `uuid` | FK → `room_types.id` |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Auto-bumped (added in `20240101001400_add_updated_at.sql`) |

- **UNIQUE**: `(hotel_id, beds24_room_id)`
- **RLS**: org isolation via `get_user_hotel_ids()`

### `beds24_sync_log`

**APPEND-ONLY.** Each row is an immutable record of one Beds24 sync event.
A `BEFORE UPDATE OR DELETE` trigger blocks all mutations at the database
level — to "amend" a sync event, insert a new row with
`status = 'ignored'` or a `conflict_details` note referencing the original
`entity_id`. See [Append-only Tables](#append-only-tables) below.

Append-only log of every Beds24 sync event. Used for debugging OTA
conflicts.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `hotel_id` | `uuid` | FK → `hotels.id` ON DELETE CASCADE |
| `direction` | `text` | CHECK in (`inbound`, `outbound`) |
| `event_type` | `text` | |
| `beds24_booking_id` | `text` | |
| `booking_id` | `uuid` | FK → `bookings.id` |
| `payload` | `jsonb` | |
| `status` | `text` | CHECK in (`success`, `conflict`, `error`, `ignored`) |
| `conflict_details` | `text` | |
| `error_message` | `text` | |
| `processed_at` | `timestamptz` | DEFAULT `now()` |

- **RLS**: org isolation via `get_user_hotel_ids()`
- **Indexes**: `idx_beds24_sync_log_hotel_id`, `idx_beds24_sync_log_booking_id`, GIN on `payload`

### `audit_logs`

**APPEND-ONLY.** Each row is an immutable record of one staff action — a
`BEFORE UPDATE OR DELETE` trigger blocks mutations at the database level.
A "correction" or "reversal" is a new row (e.g. with `action = 'reverted'`
and the original `entity_id`). See [Append-only Tables](#append-only-tables)
below.

Append-only log of staff actions. Captures `before`/`after` JSONB state
for diffing.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `hotel_id` | `uuid` | FK → `hotels.id` ON DELETE CASCADE |
| `staff_id` | `uuid` | FK → `staff_profiles.id` ON DELETE SET NULL |
| `staff_name` | `text` | Denormalized for read-after-deletion |
| `action` | `text` | NOT NULL. e.g. `booking.cancelled` |
| `entity_type` | `text` | e.g. `booking` |
| `entity_id` | `uuid` | |
| `before_state` | `jsonb` | |
| `after_state` | `jsonb` | |
| `created_at` | `timestamptz` | |

- **RLS**: org isolation via `get_user_hotel_ids()`
- **Indexes**: `idx_audit_logs_hotel_id`, `idx_audit_logs_staff_id`, GIN on `before_state` and `after_state`

### `platform_admins`

RoomLines internal team. Completely separate from `staff_profiles` — a
platform admin signs in via **Supabase Auth** (email + password) at
`/platform/sign-in`. They manage all tenants but are NOT staff of any hotel.

New users are **auto-synced** from `auth.users` by the
`on_auth_user_created` trigger (`handle_new_platform_admin()`). New rows
default to `is_active = false` — a super_admin must activate them via the
SQL editor before they can log in.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `supabase_user_id` | `uuid` | UNIQUE. FK-equivalent to `auth.users.id` |
| `email` | `text` | NOT NULL, UNIQUE |
| `full_name` | `text` | |
| `role` | `text` | CHECK in (`super_admin`, `admin`, `support`). DEFAULT `admin` |
| `is_active` | `boolean` | DEFAULT `false`. Must be set `true` by a super_admin |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | Auto-bumped |

- **UNIQUE**: `supabase_user_id`, `email`
- **RLS**: self-access — `(select auth.uid()) = supabase_user_id AND is_active = true`
- **Indexes**: `idx_platform_admins_supabase_user_id`, `idx_platform_admins_email`
- **Trigger**: `on_auth_user_created` on `auth.users` → `handle_new_platform_admin()`

---

## Helper functions (SQL)

### `public.get_user_hotel_ids() → setof uuid`

Returns the set of `hotels.id` rows the current Clerk user has active staff
access to. SECURITY DEFINER (so the policy evaluator isn't itself blocked
by RLS on `staff_profiles` / `hotels`), STABLE.

```sql
USING (hotel_id IN (SELECT public.get_user_hotel_ids()))
```

### `public.get_user_clerk_org_ids() → setof text`

Same idea, but for the `clerk_org_id` column on `staff_profiles`. Used by
the `staff_profiles` RLS policy.

---

## Triggers

### `set_updated_at` (auto-bump on UPDATE)

The `set_updated_at` trigger on each table with `updated_at` calls
`public.handle_updated_at()` BEFORE UPDATE, setting
`NEW.updated_at = now()`. The trigger function is `CREATE OR REPLACE`'d by
`supabase/migrations/20240101000200_trigger_functions.sql` so it can be
edited in place without a migration version bump.

Tables with the trigger (11 total — every mutable table): `hotels`,
`staff_profiles`, `room_types`, `rooms`, `guests`, `bookings`, `payments`,
`availability_blocks`, `notifications`, `beds24_property_mappings`,
`platform_admins`.

### Append-only Tables

`audit_logs` and `beds24_sync_log` are **append-only** — the
`prevent_modification()` function raises an exception on any `UPDATE` or
`DELETE` attempt. This is enforced by the `BEFORE UPDATE OR DELETE`
triggers `audit_logs_no_modify` and `beds24_sync_log_no_modify`, installed
in `20240101001500_enforce_append_only.sql`. Verified via the PostgREST
API: PATCH / DELETE both return `P0001` with the message "Table X is
append-only. Create a compensating row instead of modifying X".

These tables deliberately do **not** have `updated_at` (the trigger would
never fire because no UPDATEs are allowed). Amendments are made by
inserting a new row that references the original (e.g. an `action =
'reverted'` audit row, or a sync event with `status = 'ignored'`).

---

## RLS cheat sheet

| Table | Policy name | USING expression |
|-------|-------------|------------------|
| `hotels` | `hotels_org_isolation` | `id IN (SELECT get_user_hotel_ids())` |
| `staff_profiles` | `staff_profiles_org_isolation` | `clerk_org_id IN (SELECT get_user_clerk_org_ids())` |
| `room_types`, `rooms`, `guests`, `bookings`, `payments`, `availability_blocks`, `notifications`, `beds24_property_mappings`, `beds24_sync_log`, `audit_logs` | `<table>_org_isolation` | `hotel_id IN (SELECT get_user_hotel_ids())` |
| `platform_admins` | `platform_admins_self_read` | `(select auth.uid()) = supabase_user_id AND is_active` |

The `SUPABASE_SERVICE_ROLE_KEY` bypasses all of the above automatically.
Webhooks and any server-to-server code can use it freely. The anon key and
any user JWT are subject to RLS.

---

## Adding a new column (recipe)

1. Edit the PRD (`RoomLine_Pro_PRD_v5.md` section 8) to document the column
   and its purpose.
2. Add a new migration file under `supabase/migrations/`. Use a timestamp
   in the `YYYYMMDDHHMMSS_name.sql` format. Slot it in chronological order
   (e.g. after the most recent constraint file). Use idempotent patterns:
   - `CREATE INDEX IF NOT EXISTS`
   - `CREATE OR REPLACE FUNCTION`
   - `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` for
     constraints and policies
3. Run `pnpm db:push` — the supabase CLI applies the migration to the
   linked remote DB and updates the migration tracking table.
4. Run `pnpm db:types` to regenerate `types/database.types.ts`.
5. Commit the new SQL file + the updated types file together.
6. (Optional) Verify with `pnpm db:diff` — should report "No schema
   changes found" once the migration has been pushed.

Never edit an already-applied migration file. Always write a new one.

---

## Migration order

The 17 files in `supabase/migrations/` are applied in timestamp order:

| # | File | Purpose | Idempotent? |
|---|------|---------|-------------|
| 1 | `20231231235959_initial_schema.sql` | `CREATE TABLE IF NOT EXISTS` for all 13 tables in the post-refactor shape | yes (IF NOT EXISTS on every CREATE) |
| 2 | `20240101000000_refactor_staff_profiles.sql` | Adds `clerk_org_id`, drops `hotel_id` (no-op on a fresh DB; necessary for a DB still in the pre-refactor shape) | yes (DO blocks + IF EXISTS) |
| 3 | `20240101000100_extensions.sql` | `pgcrypto`, `pg_trgm` | yes |
| 4 | `20240101000200_trigger_functions.sql` | `handle_updated_at()` | yes (CREATE OR REPLACE) |
| 5–9 | `20240101000300` … `20240101000900` | CHECK + UNIQUE constraints for each table | yes (DO blocks) |
| 10 | `20240101001000_helper_functions.sql` | `get_user_hotel_ids()`, `get_user_clerk_org_ids()` | yes |
| 11 | `20240101001100_rls_policies.sql` | RLS on all 13 tables | yes |
| 12 | `20240101001200_indexes.sql` | GIN + partial + FK indexes | yes (CREATE INDEX IF NOT EXISTS) |
| 13 | `20240101001300_triggers.sql` | `set_updated_at` on every mutable table | yes (DROP TRIGGER IF EXISTS) |
| 14 | `20240101001400_add_updated_at.sql` | Adds `updated_at` + trigger to `payments`, `notifications`, `availability_blocks`, `platform_admins`, `beds24_property_mappings` (tables where the PRD omitted it) | yes |
| 15 | `20240101001500_enforce_append_only.sql` | `BEFORE UPDATE OR DELETE` BLOCK triggers on `audit_logs`, `beds24_sync_log` | yes |

`supabase start` on a fresh local DB applies the whole chain — initial
schema creates the tables, the refactor becomes a no-op, constraints/RLS/
indexes/triggers layer on top.

`supabase db push` against the live remote DB skips the initial schema
(IF NOT EXISTS = no-op) and skips the refactor (no legacy `hotel_id` to
drop). It also only applies the migrations the live DB hasn't seen yet,
tracked in the `_supabase_migrations` table.
