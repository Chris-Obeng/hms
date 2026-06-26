# Supabase Realtime — Setup & Status

> **TL;DR — The migration has already been applied.**
> `supabase/migrations/20240105000000_enable_realtime_publications.sql` was
> pushed to the remote database. Realtime is now live for `bookings` and
> `availability_blocks`. No manual Dashboard steps are needed.

---

## What was done

The calendar (`app/dashboard/calendar/calendar-client.tsx`) subscribes to
Supabase Realtime `postgres_changes` events on two tables:

| Table | Events listened for | Filter |
|-------|---------------------|--------|
| `bookings` | INSERT, UPDATE, DELETE | `hotel_id = <current hotel>` |
| `availability_blocks` | INSERT, UPDATE, DELETE | `hotel_id = <current hotel>` |

Supabase Realtime is **opt-in per table** — tables must be added to the
`supabase_realtime` PostgreSQL publication before changes are broadcast.
The migration below does exactly that.

---

## Migration applied

**File:** `supabase/migrations/20240105000000_enable_realtime_publications.sql`

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE availability_blocks;
```

This was applied to the remote database via `supabase db push` on
2026-06-14. You can verify it is active by running in the Supabase SQL
Editor:

```sql
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
```

You should see `availability_blocks` and `bookings` in the results.

---

## How the Realtime pipeline works

```
DB change (INSERT / UPDATE / DELETE on bookings or availability_blocks)
  → Supabase Realtime broadcasts the event to subscribed clients
    → calendar-client.tsx receives the event via postgres_changes listener
      → silentRefresh() is called (no loading overlay shown)
        → getCalendarData() server action re-fetches fresh data
          → React state updated → calendar re-renders instantly
            → New bookings get a 3-second CSS pulse animation
```

### Subscription code (calendar-client.tsx)

```tsx
React.useEffect(() => {
  const supabase = createClient();
  const channel = supabase
    .channel(`hotel:${hotelId}:calendar`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "bookings",
      filter: `hotel_id=eq.${hotelId}`,
    }, silentRefresh)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "availability_blocks",
      filter: `hotel_id=eq.${hotelId}`,
    }, silentRefresh)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [silentRefresh, hotelId]);
```

---

## Status checklist

| Item | Status |
|------|--------|
| Realtime subscription code in `calendar-client.tsx` | ✅ Correctly implemented |
| `silentRefresh` callback wired up | ✅ Correct |
| Supabase browser client uses correct public key | ✅ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| `bookings` added to `supabase_realtime` publication | ✅ **Applied via migration** |
| `availability_blocks` added to `supabase_realtime` publication | ✅ **Applied via migration** |
| RLS policies allow authenticated reads on both tables | ✅ `hotel_id IN (SELECT get_user_hotel_ids())` |
| New-booking pulse animation wired to Realtime updates | ✅ `knownBookingIdsRef` + `newBookingIds` |

---

## If you ever need to re-apply manually

If you set up a fresh Supabase project or reset the database, run this in
the Supabase Dashboard → SQL Editor:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE availability_blocks;
```

Or use the Dashboard UI:
1. Go to **Database → Replication** (or **Publications**)
2. Click on **`supabase_realtime`**
3. Toggle **ON** both `bookings` and `availability_blocks`
4. Save

---

## RLS note

The Realtime subscription uses the browser (anon) Supabase client. The
`postgres_changes` event delivery itself is not blocked by RLS — Supabase
Realtime handles authorization at the channel level. The actual data
re-fetch (`silentRefresh → getCalendarData`) uses the **server-side**
Supabase client with the authenticated user's session, so RLS applies
normally and only the hotel's own data is returned.
