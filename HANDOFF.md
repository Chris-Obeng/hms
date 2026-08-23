# RoomLine PMS — Dashboard UI Migration Handoff

HeroUI v3 migration of dashboard pages. Session ended mid-verification. Read this fully before touching code.

## Stack / Conventions

- Next.js **16.3.0** (App Router, React 19.2.4, Tailwind v4). AGENTS.md warns: read `node_modules/next/dist/docs/` for breaking changes.
- **HeroUI React v3.2.2** (`@heroui/react`) — compound dot-notation API. Docs local at `.heroui-docs/react/` (components in `components/(category)/*.mdx`, live examples in `demos/en/<component>/*.tsx`). ALWAYS check docs before using a HeroUI part — API differs from memory.
- Auth: Clerk (`@clerk/nextjs`). DB: Supabase (`lib/supabase/server.ts` in RSC, `client.ts` in client comps).
- Design tokens: shadcn-style CSS vars (`--background`, `--muted`, `--border`...) bridged with `@import "@heroui/styles"` in `app/globals.css`. Semantic typography utilities: `text-page-title`, `text-section`, `text-body`, `text-label`, `text-caption` (11px floor), `text-kpi`. Status pill classes: `status-confirmed`, `status-checked-in`, `status-checked-out`, `status-pending`, `status-cancelled`, `status-no-show`.
- Existing HeroUI wrapper: `components/ui/hero-select.tsx` (`HeroSelectField`).
- New shared component I created: `components/ui/hero-table-pagination.tsx` (`HeroTablePagination`) — HeroUI `Pagination` (Prev / numbered pages w/ ellipsis / Next + summary line) bound to a TanStack table instance. Render inside `<Table.Footer>`.
- Table pattern: **TanStack Table for logic + HeroUI `Table` for rendering**. Reference demo: `.heroui-docs/react/demos/en/table/tanstack-table.tsx`. Anatomy: `Table > Table.ScrollContainer > Table.Content > Table.Header/Table.Column (+Table.SortableColumnHeader w/ sortDirection render prop) + Table.Body/Table.Row/Table.Cell` + `Table.Footer`.
- HeroUI overlays are controlled on the **Backdrop**: `<Modal.Backdrop isOpen onOpenChange><Modal.Container><Modal.Dialog>...`. Same for `AlertDialog`. `Button`: `onPress`, `isPending`, `isDisabled`, variants `primary/secondary/tertiary/outline/ghost/danger/danger-soft`. `Switch`: `isSelected`/`onChange` with `Switch.Content > Switch.Control > Switch.Thumb`. `SearchField`: `SearchField.Group > SearchIcon + Input + ClearButton`, controlled `value`/`onChange`. `Dropdown`: `<Dropdown><Button/><Dropdown.Popover><Dropdown.Menu><Dropdown.Item id textValue onAction><Label>`.
- Toast: `toast.success` / `toast.danger` from `@heroui/react`.
- Server actions in `app/actions/rooms.ts` / `bookings.ts` (zod-validated, role-gated via `requireMinRole`). Never bypass.

## Completed

1. **`app/dashboard/rooms/types/room-types-table.tsx`** — full rewrite. HeroUI Table (variant="secondary", desktop `hidden md:block`) + mobile card list (`md:hidden`), Chip statuses, Dropdown row actions (edit/deactivate/delete), **AlertDialog confirm before deleteRoomType** (was instant — destructive), SearchField toolbar, `HeroTablePagination` (pageSize 10). Row click → edit page. `toggleBusyRef` guards double-toggles. Data arrives sorted by `sort_order` from server; no sortOrder column.
2. **`app/dashboard/rooms/types/room-types-client.tsx`** — HeroUI Button + controlled Modal (`Modal.Backdrop isOpen onOpenChange`) wrapping RoomTypeForm; `h-[85dvh] flex flex-col p-0` dialog, scrollable `Modal.Body`.
3. **`app/dashboard/rooms/_components/room-type-form.tsx`** — full rewrite. HeroUI Input/Switch/Card/Button. `FormSection` renders **flat labeled sections when `isModal`** (no nested cards inside modal — user rejected card-in-modal look) and Cards on the standalone edit page. **Custom amenities added**: input + "Add" button (Enter key works, dedupes case-insensitive, 60-char cap, `custom` badge on chips); `allAmenityOptions` = `AMENITIES_LIST` + custom; selection state unchanged (`selectedAmenities: string[]`).
4. **`lib/amenities.ts`** — added `toAmenityObjects(labels)` (known icon or `"check"` fallback; icons not rendered guest-facing, label-only). Replaced the 3 duplicated label→object mappings in `room-types-client.tsx`, `types/new/page.tsx`, `types/[id]/page.tsx`.
5. **`app/dashboard/rooms/directory/rooms-directory-client.tsx`** — full rewrite. Kept intact: react-query rooms query, realtime postgres_changes subscription, optimistic status mutation + audit log (`writeAuditLog`), `BlockRoomSheet`. New: HeroUI Table desktop + mobile cards, **status cell = chip-button opening Dropdown of allowed transitions only** (`STATUS_TRANSITIONS` map — removed the old per-row Select, prevents accidental audit-logged flips), Add Room via HeroUI Modal (form id="add-room-form", submit Button `form=` attr), SearchField, status filter chips with counts, pageSize 20.
6. **`components/customers/customers-table.tsx`** — full rewrite. HeroUI Table desktop + tappable guest cards mobile, HeroUI Chip tags (color map: vip→warning, corporate→accent, flagged→danger, new→success), GuestDetailSheet wiring incl. guestId URL-param auto-open + `router.replace` cleanup on close, tag filter via HeroSelectField, CSV export kept, default sort = server order (created_at desc = newest first), pageSize 15.
7. **`components/bookings/bookings-table.tsx`** — full rewrite. Columns: Guest(+ref+source line) / Stay (in→out · nights · room) / Status / Payment (both via `StatusChip` using `.status-*` classes) / Total(+due) / actions. Newest first (server order). **AlertDialog confirm before cancel** (was instant). Check-in/out/reinstate via `runStatusUpdate` + `router.refresh()`. View toggle = HeroUI `ToggleButtonGroup` single-selection (desktop only); mobile ALWAYS cards. Realtime subscription + NewBookingModal + BookingDetailDrawer kept.
8. **`app/dashboard/bookings/page.tsx`** — server query `.order("created_at", { ascending: false })` (was check_in) so newest bookings top.

## TODO (user-reported bugs, not yet fixed)

1. **Table headers nearly invisible** (reservations + guests + room tables). HeroUI `table__column` header color has poor contrast in this theme (only readable on hover). Fix in `app/globals.css` with a `.table__column` override (after the `@import`s / near the other component overrides ~line 331): ~12px, font-weight 600, uppercase, letter-spacing, `color: color-mix(in oklch, var(--foreground) 75%, transparent)`. Verify against `.heroui-docs/react/components/(data-display)/table.mdx` CSS classes section (`.table__column`, variant `.table-root--primary/--secondary`).
2. **Row click does not open drawer/sheet on desktop** (bookings + guests; same pattern in room-types). I used native `onClick` on HeroUI `Table.Row` — React Aria swallows it. Fix: use the React Aria **`onAction` prop on `Table.Row`** instead (supported for row interactivity; interactive children like buttons/dropdowns automatically don't trigger it — then the `<span onClick={stopPropagation}>` wrappers around action cells can be removed). Files: `components/bookings/bookings-table.tsx` (→ `handleViewDetails(row.original.id)`), `components/customers/customers-table.tsx` (→ `handleGuestClick(row.original)`), `app/dashboard/rooms/types/room-types-table.tsx` (→ `router.push`). Check `.heroui-docs/react` demos for onAction usage on rows first.
3. **Verification pass not run** since last edits: `npx tsc --noEmit` (was clean before form rewrite) and `npx eslint` on the 8 touched files. Known remaining lint items: `react-hooks/set-state-in-effect` error at `room-type-form.tsx` slug auto-gen effect (PRE-EXISTING pattern — derive slug during render or keep, decide + justify), `react-hooks/incompatible-library` warnings for `useReactTable` (expected, ignore). Do not reintroduce `any`.
4. Sanity-check the Add Room Type modal visually (dev server): flat sections, consistent h-9 inputs, amenities custom-add row. Also confirm mobile views: room types cards, rooms directory cards, guests cards, bookings forced-cards.

## Gotchas

- HeroUI `Modal.Description` / `CloseTrigger isDisabled` DO NOT EXIST — only parts listed in modal.mdx API table.
- `AlertDialog` controlled props go on `AlertDialog.Backdrop`, not root.
- HeroUI `Table.Column` children render-prop receives `{ sortDirection }`; use `Table.SortableColumnHeader` to show it. Non-sortable columns (e.g. actions) → return `null`.
- Hidden data-only columns (e.g. `createdAt` accessor in bookings) work by rendering header/cell `null` + `className="hidden"`.
- `formatCurrency`/`formatDate` come from `lib/format.ts`; status labels from `lib/booking-status.ts` (`SOURCE_BADGES`, `getStatusLabel`, `getPaymentLabel`). Never re-declare.
- `qk` query keys in `lib/query-keys.ts`; audit writes need `staff_profiles` row.
- Windows/PowerShell environment: no `head`, use `Select-Object -First`.
- Run `graphify update .` after code changes (repo rule).
