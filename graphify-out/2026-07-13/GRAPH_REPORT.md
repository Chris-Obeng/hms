# Graph Report - hms  (2026-07-13)

## Corpus Check
- 279 files · ~176,781 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1533 nodes · 3585 edges · 113 communities (93 shown, 20 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `58bae59e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- System Architecture
- arkesel.ts
- room-type-form.tsx
- rooms.ts
- writeAuditLog
- FullBookingDetail
- createClient
- bookings-detail.ts
- sidebar.tsx
- What You Must Do When Invoked
- dependencies
- Tables
- Page Descriptions
- utils.ts
- components.json
- guest-detail-sheet.tsx
- booking-detail-drawer.tsx
- compilerOptions
- HotelOS Pro
- 8 Database Schema
- housekeeping.ts
- HotelOS Pro — Platform Admin Setup Guide
- kanban-board.tsx
- bookings-table.tsx
- devDependencies
- beds24.ts
- scripts
- dashboard-header.tsx
- hotel-client.tsx
- page.tsx
- graphify reference: extra exports and benchmark
- proxy.ts
- staff-client.tsx
- invitations.ts
- Supabase Realtime — Setup & Status
- Booking Page Setup Guide
- page.tsx
- 13 Payment System — Paystack Subaccounts
- payments-client.tsx
- 27 MVP Implementation Roadmap
- 15 Notification System
- 18 Timeline Calendar — DayPilot Lite
- page.tsx
- graphify reference: query, path, explain
- 19 PWA Features
- 20 UI/UX Design System
- generate-pwa-icons.mjs
- 22 Settings
- 25 Additional Operational Features
- 9 Authentication  Role-Based Access Control
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- providers.tsx
- 14 Beds24  OTA Channel Sync
- 23 Security
- 26 Subdomain  Custom Domain Routing
- 2 Product Vision  Goals
- 3 Business Model
- 4 System Architecture
- settings.ts
- 5 Multi-Tenancy Architecture
- calendar-store.ts
- package.json
- graphify reference: GitHub clone and cross-repo merge
- pending-client.tsx
- graphify reference: transcribe video and audio
- 12 Guest-Facing Booking Application
- 16 Guest Directory
- 1 Executive Summary
- next.config.ts
- AGENTS.md
- upload.ts
- CLAUDE.md
- CLAUDE.md
- extraction-spec.md
- eslint.config.mjs
- .mcp.json
- admin.ts
- postcss.config.mjs
- Booking Page Development Access
- Multi-Tenancy Architecture
- Database Schema Conventions
- database.types.ts
- transactions-client.tsx
- onboarding-select.tsx
- buttonVariants
- tooltip.tsx
- unassigned-tray.tsx
- resend.ts
- availability-matrix-client.tsx
- invitations.ts
- card.tsx
- actions.ts
- PlatformLoginForm
- page.tsx
- page.tsx
- page.tsx
- reports-client.tsx
- layout.tsx
- createPlatformClient
- hotels-table.tsx
- dropdown-menu.tsx
- page.tsx
- page.tsx
- Payment System (Paystack)
- cn
- HMS Brand Logo Icon

## God Nodes (most connected - your core abstractions)
1. `cn()` - 223 edges
2. `createClient()` - 119 edges
3. `react` - 59 edges
4. `Button()` - 51 edges
5. `HotelOS Pro` - 33 edges
6. `toActionError()` - 27 edges
7. `createClient()` - 27 edges
8. `requireMinRole()` - 26 edges
9. `Badge()` - 25 edges
10. `Input()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `getCurrentUserRole()` --calls--> `createClient()`  [EXTRACTED]
  app/actions/bookings-detail.ts → lib/supabase/server.ts
- `getPendingStaffCount()` --calls--> `createClient()`  [EXTRACTED]
  app/actions/staff.ts → lib/supabase/server.ts
- `Th()` --calls--> `cn()`  [EXTRACTED]
  app/dashboard/_components/activity-list.tsx → lib/utils.ts
- `Td()` --calls--> `cn()`  [EXTRACTED]
  app/dashboard/_components/activity-list.tsx → lib/utils.ts
- `Tier1Card()` --calls--> `cn()`  [EXTRACTED]
  app/dashboard/_components/activity-tabs.tsx → lib/utils.ts

## Import Cycles
- None detected.

## Communities (113 total, 20 thin omitted)

### Community 1 - "arkesel.ts"
Cohesion: 0.11
Nodes (43): ArkeselSmsRecipientResult, ArkeselSmsResponse, BookingNotifyData, getMasterApiKey(), HotelNotifyConfig, normalizePhone(), notifyBookingCancelled(), notifyBookingConfirmed() (+35 more)

### Community 2 - "room-type-form.tsx"
Cohesion: 0.17
Nodes (19): getNotificationTemplates(), getSuperAdmin(), saveNotificationTemplates(), updateNotificationPrefs(), EVENT_TYPES, NotificationSettingsPage(), NotificationTemplatesClient(), TemplatesState (+11 more)

### Community 3 - "rooms.ts"
Cohesion: 0.20
Nodes (19): AvailabilityBlockSchema, createAvailabilityBlock(), createRoom(), createRoomType(), deleteRoomType(), getAvailabilityBlocks(), getHotelId(), getHotelSlug() (+11 more)

### Community 4 - "writeAuditLog"
Cohesion: 0.20
Nodes (23): BulkDailyOverrideDeleteSchema, BulkDailyOverrideSchema, bulkDeleteDailyRateOverrides(), bulkUpsertDailyRateOverrides(), createSeasonalRate(), DailyOverrideDeleteSchema, DailyOverrideSchema, deleteDailyRateOverride() (+15 more)

### Community 5 - "FullBookingDetail"
Cohesion: 0.16
Nodes (17): Sidebar(), SidebarContext, SidebarContextProps, SidebarGroupAction(), SidebarInput(), SidebarInset(), SidebarMenuAction(), SidebarMenuBadge() (+9 more)

### Community 6 - "createClient"
Cohesion: 0.07
Nodes (27): fetchNotificationsAction(), markAllReadAction(), markSingleReadAction(), getResolvedRatesForBooking(), searchGlobal(), DeactivatedPage(), DeactivatedPageProps, SuspendedPage() (+19 more)

### Community 7 - "bookings-detail.ts"
Cohesion: 0.20
Nodes (14): buildHotelShape(), GET(), HotelRow, DateSearchBar(), HotelLandingPage(), Props, Props, RoomsPage() (+6 more)

### Community 8 - "sidebar.tsx"
Cohesion: 0.11
Nodes (25): getRoleBadgeClass(), getRoleLabel(), NavItem, navItems, PlatformSidebar(), AppSidebar(), getRoleBadgeClass(), getRoleLabel() (+17 more)

### Community 9 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 10 - "dependencies"
Cohesion: 0.07
Nodes (27): dependencies, @base-ui/react, class-variance-authority, @clerk/nextjs, clsx, cmdk, date-fns, @daypilot/daypilot-lite-react (+19 more)

### Community 11 - "Tables"
Cohesion: 0.08
Nodes (25): Adding a new column (recipe), Append-only Tables, `audit_logs`, `availability_blocks`, `beds24_property_mappings`, `beds24_sync_log`, `bookings`, Conventions (+17 more)

### Community 12 - "Page Descriptions"
Cohesion: 0.08
Nodes (25): 11 Hotel Admin Dashboard — All Pages, `/bookings`, `/bookings/calendar`, `/bookings/\\\[id]`, `/bookings/new`, Complete Page Directory, `/guests`, `/guests/\\\[id]` (+17 more)

### Community 13 - "utils.ts"
Cohesion: 0.36
Nodes (5): bulkUpdateHousekeepingStatus(), getHotelScopedClient(), getHousekeepingData(), updateHousekeepingStatus(), HousekeepingPage()

### Community 14 - "components.json"
Cohesion: 0.09
Nodes (22): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+14 more)

### Community 15 - "guest-detail-sheet.tsx"
Cohesion: 0.15
Nodes (21): getGuestBookings(), GuestBookingSummary, UpdateContactSchema, updateGuestContact(), updateGuestNotes(), updateGuestTags(), UpdateNotesSchema, UpdateTagsSchema (+13 more)

### Community 16 - "booking-detail-drawer.tsx"
Cohesion: 0.06
Nodes (74): FullBookingDetail, getCurrentUserRole(), getFullBookingDetail(), getHotelScopedClient(), PaymentRecord, recordPayment(), RecordPaymentInput, RecordPaymentSchema (+66 more)

### Community 17 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 18 - "HotelOS Pro"
Cohesion: 0.09
Nodes (21): 10 Platform Admin, 12.1 Tenant Resolution, 12.2 Guest Pages, 12 Guest-Facing Booking Application, 17 Availability Color Coding, 1 Executive Summary, 21 Reports, 24 Performance Requirements (+13 more)

### Community 19 - "8 Database Schema"
Cohesion: 0.12
Nodes (17): 8 Database Schema, Append-only Tables, `audit\\\_logs`, `availability\\\_blocks`, `beds24\\\_property\\\_mappings`, `beds24\\\_sync\\\_log`, `bookings`, Design Principles (+9 more)

### Community 20 - "housekeeping.ts"
Cohesion: 0.18
Nodes (18): approveStaff(), changeStaffRole(), getHotelScopedClient(), getPendingStaff(), getPendingStaffCount(), getStaffList(), PendingStaffRequest, rejectStaff() (+10 more)

### Community 21 - "HotelOS Pro — Platform Admin Setup Guide"
Cohesion: 0.12
Nodes (16): Architecture Overview, File Reference, HotelOS Pro — Platform Admin Setup Guide, Manual reset (HotelOS team resets for another admin), Method A — "Add user" (instant, no email required), Method B — "Invite user" (sends a magic-link setup email), New Environment Checklist, Redirect URLs (add both) (+8 more)

### Community 22 - "kanban-board.tsx"
Cohesion: 0.09
Nodes (27): ActivityBooking, ActivityList(), ActivityListProps, DesktopBookingRow(), formatDate(), getEmptyDescription(), getEmptyTitle(), getNights() (+19 more)

### Community 23 - "bookings-table.tsx"
Cohesion: 0.32
Nodes (7): ALLOWED_TRANSITIONS, createBooking(), CreateBookingResult, MANAGER_ONLY_STATUSES, NewBookingInput, NewBookingSchema, updateBookingStatus()

### Community 24 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, eslint, eslint-config-next, fallow, knip, shadcn, sharp, tailwindcss (+5 more)

### Community 25 - "beds24.ts"
Cohesion: 0.13
Nodes (20): forceBeds24Sync(), getIntegrationsData(), getLastSyncTime(), getSuperAdmin(), saveBeds24Config(), testArkeselSms(), testBeds24(), toggleHotelNotifications() (+12 more)

### Community 26 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, db:diff, db:pull, db:push, db:reset, db:types, dev (+3 more)

### Community 27 - "dashboard-header.tsx"
Cohesion: 0.14
Nodes (18): HousekeepingData, HousekeepingRoom, fetchHousekeepingClientData(), HousekeepingClient(), HousekeepingClientProps, COLUMN_ROOM_FILTER, HousekeepingBoard(), HousekeepingBoardProps (+10 more)

### Community 28 - "hotel-client.tsx"
Cohesion: 0.15
Nodes (16): AvailabilityBlockInput, RoomInput, RoomRow, RoomsDirectoryProps, STATUS_CONFIG, STATUS_TRANSITIONS, RoomTypesClientProps, RoomTypeRow (+8 more)

### Community 29 - "page.tsx"
Cohesion: 0.22
Nodes (14): BookingsTable(), BookingsTableProps, exportToCsv(), formatCurrency(), formatDate(), getColumns(), getPaymentLabel(), getStatusLabel() (+6 more)

### Community 30 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 31 - "proxy.ts"
Cohesion: 0.29
Nodes (7): config, isBookingRoute, isPlatformPublic, isPlatformRoute, isPublicDashboardRoute, IMPORTANT: Must call getClaims() between createServerClient and any redirect, updatePlatformSession()

### Community 32 - "staff-client.tsx"
Cohesion: 0.12
Nodes (20): NotificationItem, getPageTitle(), PlatformHeader(), ROUTE_TITLES, PlatformAdmin, AppHeaderProps, DropdownMenu(), DropdownMenuCheckboxItem() (+12 more)

### Community 33 - "invitations.ts"
Cohesion: 0.26
Nodes (8): DashboardLayout(), DashboardPwaShell(), OfflineIndicator(), PwaInstallPrompt(), wasDismissedRecently(), BeforeInstallPromptEvent, usePwaInstall(), WindowEventMap

### Community 34 - "Supabase Realtime — Setup & Status"
Cohesion: 0.22
Nodes (8): How the Realtime pipeline works, If you ever need to re-apply manually, Migration applied, RLS note, Status checklist, Subscription code (calendar-client.tsx), Supabase Realtime — Setup & Status, What was done

### Community 35 - "Booking Page Setup Guide"
Cohesion: 0.25
Nodes (7): 1. Access Your Hotel's Booking Page, 2. Development Access Methods, 3. Production Setup, Booking Page Setup Guide, How It Works, Quick Start, Troubleshooting

### Community 36 - "page.tsx"
Cohesion: 0.05
Nodes (46): createHotelProfile(), OnboardingInput, OnboardingSchema, slugify(), fetchPaystackBanks(), getPaymentsSettings(), getSuperAdminHotel(), PaymentPolicy (+38 more)

### Community 37 - "13 Payment System — Paystack Subaccounts"
Cohesion: 0.25
Nodes (8): 13.1 Architecture: One Master Account, Per-Hotel Subaccounts, 13.2 Creating a Hotel Subaccount, 13.3 Account Verification Before Saving, 13.4 Pay Now Flow, 13.5 Paystack Webhook, 13.6 Pay at Check-In, 13.7 Refunds, 13 Payment System — Paystack Subaccounts

### Community 38 - "payments-client.tsx"
Cohesion: 0.17
Nodes (14): createShareableInvite(), formatDate(), getInitials(), ROLE_CONFIG, ROLE_OPTIONS, StaffClient(), StaffClientProps, StaffRow (+6 more)

### Community 39 - "27 MVP Implementation Roadmap"
Cohesion: 0.25
Nodes (8): 27 MVP Implementation Roadmap, Phase 1 — Foundation, Phase 2 — Rooms  Inventory, Phase 3 — Guest Booking App, Phase 4 — Payments, Phase 5 — Admin Operations, Phase 6 — OTA Sync + Notifications, Phase 7 — Reports, Settings  PWA

### Community 40 - "15 Notification System"
Cohesion: 0.29
Nodes (7): 15.1 Real-Time Flow, 15.2 Toast (Sonner), 15.3 Notification Sound, 15.4 Notification Bell (Top Nav), 15.5 Per-Staff Preferences (`/settings/notifications`), 15.6 Arkesel — Guest Notifications, 15 Notification System

### Community 41 - "18 Timeline Calendar — DayPilot Lite"
Cohesion: 0.29
Nodes (7): 18.1 Library, 18.2 Why DayPilot Lite vs Alternatives, 18.3 Calendar Configuration, 18.4 Features, 18.5 Booking Block Colours, 18.6 Custom Apple-Inspired Styling, 18 Timeline Calendar — DayPilot Lite

### Community 42 - "page.tsx"
Cohesion: 0.40
Nodes (5): BillingPage(), Feature, FEATURES, PLAN_META, PlanKey

### Community 43 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 44 - "19 PWA Features"
Cohesion: 0.33
Nodes (6): 19.1 Scope, 19.2 Implementation, 19.3 Web App Manifest, 19.4 Service Worker, 19.5 Install Experience, 19 PWA Features

### Community 45 - "20 UI/UX Design System"
Cohesion: 0.33
Nodes (6): 20.1 Philosophy, 20.2 Five Core UX Rules, 20.3 Typography, 20.4 Colour Tokens (CSS Variables), 20.5 Shadcn Component Usage, 20 UI/UX Design System

### Community 46 - "generate-pwa-icons.mjs"
Cohesion: 0.33
Nodes (5): __dirname, iconsDir, inner, sizes, svg

### Community 47 - "22 Settings"
Cohesion: 0.40
Nodes (5): 22 Settings, `/settings/billing` — Paystack Bank Account, `/settings/hotel` — Hotel Profile, `/settings/integrations` — Third-Party Connections, `/settings/notifications` — Notification Preferences

### Community 48 - "25 Additional Operational Features"
Cohesion: 0.40
Nodes (5): 25.1 Check-In / Check-Out, 25.2 Booking Reference, 25.3 Audit Log, 25.4 Room Image Management, 25 Additional Operational Features

### Community 49 - "9 Authentication  Role-Based Access Control"
Cohesion: 0.40
Nodes (5): 9.1 Auth Provider: Clerk, 9.2 Staff Onboarding — Gated Approval Flow, 9.3 Role Permissions Matrix, 9.4 Super Admin Controls, 9 Authentication  Role-Based Access Control

### Community 50 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 51 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 52 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 53 - "providers.tsx"
Cohesion: 0.29
Nodes (4): AuthContext, AuthError, ROLE_LEVEL, StaffRole

### Community 54 - "14 Beds24  OTA Channel Sync"
Cohesion: 0.50
Nodes (4): 14.1 What HotelOS Handles vs Beds24 Dashboard, 14.2 Inbound Sync (Booking.com → HotelOS), 14.3 Outbound Sync (HotelOS → Beds24), 14 Beds24  OTA Channel Sync

### Community 55 - "23 Security"
Cohesion: 0.50
Nodes (4): 23.1 Authentication, 23.2 API  Secrets, 23.3 Data, 23 Security

### Community 56 - "26 Subdomain  Custom Domain Routing"
Cohesion: 0.50
Nodes (4): 26.1 Architecture, 26.2 Custom Domain, 26.3 Render.com Configuration, 26 Subdomain  Custom Domain Routing

### Community 57 - "2 Product Vision  Goals"
Cohesion: 0.50
Nodes (4): 2 Product Vision  Goals, Design Principle, Goals, Vision

### Community 58 - "3 Business Model"
Cohesion: 0.50
Nodes (4): 3 Business Model, Beds24 Cost Structure, One-Time Website Build Fee, SaaS Subscription Tiers (Priced in GHC)

### Community 59 - "4 System Architecture"
Cohesion: 0.50
Nodes (4): 4 System Architecture, Data Flow — Inbound OTA Booking, Data Flow — New Direct Booking, High-Level Overview

### Community 60 - "settings.ts"
Cohesion: 0.27
Nodes (8): DashboardHeader(), DashboardHeaderProps, Popover(), PopoverContent(), PopoverDescription(), PopoverHeader(), PopoverTitle(), PopoverTrigger()

### Community 61 - "5 Multi-Tenancy Architecture"
Cohesion: 0.50
Nodes (4): 5 Multi-Tenancy Architecture, Isolation Layers, Model: Shared Database, Row-Level Isolation, New Hotel Provisioning Flow

### Community 62 - "calendar-store.ts"
Cohesion: 0.50
Nodes (3): CalendarUIState, RoomTypeFilter, useCalendarStore

### Community 63 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 65 - "pending-client.tsx"
Cohesion: 0.14
Nodes (16): getHotelProfile(), getHotelScopedClient(), getNotificationPrefs(), HotelProfileInput, HotelProfileSchema, updateHotelProfile(), deleteStorageFile(), getHotelId() (+8 more)

### Community 67 - "12 Guest-Facing Booking Application"
Cohesion: 0.06
Nodes (36): AvailabilityMatrixClient(), AvailabilityMatrixData, DateHeader(), DAY_PRESETS, InventoryCell(), InventoryGrid(), MatrixTotalCell, RoomAvailabilityCell (+28 more)

### Community 68 - "16 Guest Directory"
Cohesion: 0.67
Nodes (3): 16 Guest Directory, `/guests/\\\[id]` — Profile Page, `/guests` — List Page

### Community 69 - "1 Executive Summary"
Cohesion: 0.60
Nodes (4): POST(), Schema, initializeTransaction(), resolvePublicNightlyTotal()

### Community 74 - "upload.ts"
Cohesion: 0.15
Nodes (14): GET(), GET(), PlatformDashboardLayout(), PlatformLayout(), createPlatformClient(), CompositeTypes, Constants, Database (+6 more)

### Community 82 - "admin.ts"
Cohesion: 0.20
Nodes (5): STATUS_MAP, logSync(), POST(), Beds24BookingWebhookPayload, supabaseAdmin

### Community 88 - "database.types.ts"
Cohesion: 0.23
Nodes (4): ACTION_COLORS, AuditEntry, Hero(), Button()

### Community 89 - "transactions-client.tsx"
Cohesion: 0.22
Nodes (9): formatCurrency(), QuickStatRow(), QuickStats(), QuickStatsData, QuickStatsProps, SummaryRow(), TodaySummary(), TodaySummaryData (+1 more)

### Community 90 - "onboarding-select.tsx"
Cohesion: 0.20
Nodes (7): HotelsTable(), FILTERS, FilterTab(), Props, PlatformDashboard(), StatCard(), StatCardProps

### Community 91 - "buttonVariants"
Cohesion: 0.47
Nodes (4): DashboardNotFound(), OfflinePage(), buttonVariants, CalendarDayButton()

### Community 92 - "tooltip.tsx"
Cohesion: 0.29
Nodes (6): bottomVariants, MenuIcon, MenuIconHandle, MenuIconProps, middleVariants, topVariants

### Community 93 - "unassigned-tray.tsx"
Cohesion: 0.38
Nodes (6): getFromAddress(), getResend(), ResendEmailParams, ResendSendResult, sendEmailViaResend(), resend

### Community 94 - "resend.ts"
Cohesion: 0.33
Nodes (3): cormorant, dmSans, Props

### Community 95 - "availability-matrix-client.tsx"
Cohesion: 0.67
Nodes (3): 6 Technology Stack, Shadcn UI — Component Choices Explained, Why DayPilot Lite for the Timeline Calendar

### Community 97 - "card.tsx"
Cohesion: 0.17
Nodes (14): Props, RoomPreviewSheet(), RoomType, DEFAULT_VALUES, RoomTypeForm(), RoomTypeFormProps, RoomTypeFormValues, slugify() (+6 more)

### Community 99 - "actions.ts"
Cohesion: 0.06
Nodes (61): assignBookingToRoom(), AssignResult, AvailabilityCheckResult, AvailabilityConflict, CalendarAvailabilityBlock, CalendarBooking, CalendarData, CalendarRoom (+53 more)

### Community 100 - "PlatformLoginForm"
Cohesion: 0.12
Nodes (15): BlockRoomSheet(), GlobalSearch(), OccupancyDonut(), EditRoomTypePage(), EventCard(), PlatformLoginForm(), metadata, formatCurrency() (+7 more)

### Community 143 - "reports-client.tsx"
Cohesion: 0.14
Nodes (17): ACTIVE, getHotelId(), getOccupancyReport(), getRevenueReport(), getSourcesReport(), OccupancyReportData, RevenueReportData, SourcesReportData (+9 more)

### Community 165 - "layout.tsx"
Cohesion: 0.18
Nodes (10): geistMono, jakarta, metadata, viewport, getQueryClient(), makeQueryClient(), Providers(), ThemeProvider() (+2 more)

### Community 167 - "createPlatformClient"
Cohesion: 0.18
Nodes (11): approveHotel(), assertPlatformAdmin(), changeHotelPlan(), getHotelSupportView(), reactivateHotel(), suspendHotel(), Hotel, HotelActionsMenuProps (+3 more)

### Community 171 - "hotels-table.tsx"
Cohesion: 0.30
Nodes (9): OccupancyCardProps, Card(), CardAction(), CardContent(), CardDescription(), CardFooter(), CardHeader(), CardTitle() (+1 more)

### Community 176 - "dropdown-menu.tsx"
Cohesion: 0.16
Nodes (20): formatCurrency(), getColumns(), RoomTypesTable(), RoomTypesTableProps, ALL_TAG_OPTIONS, CustomersTable(), CustomersTableProps, exportToCsv() (+12 more)

### Community 183 - "page.tsx"
Cohesion: 0.13
Nodes (12): Amenity, BookingWizard(), Hotel, Props, RoomImage, RoomType, Props, P (+4 more)

### Community 187 - "page.tsx"
Cohesion: 0.24
Nodes (7): ConfirmationPage(), Props, scalar(), SearchParamValue, CopyButton(), PaymentVerifier(), Props

### Community 274 - "cn"
Cohesion: 0.18
Nodes (21): SearchResult, GlobalSearchProps, Command(), CommandDialog(), CommandEmpty(), CommandGroup(), CommandInput(), CommandItem() (+13 more)

## Knowledge Gaps
- **533 isolated node(s):** `supabase`, `DeactivatedPageProps`, `OnboardingInputProps`, `OnboardingSelectOption`, `OnboardingSelectProps` (+528 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `room-type-form.tsx`, `writeAuditLog`, `FullBookingDetail`, `createClient`, `sidebar.tsx`, `reports-client.tsx`, `booking-detail-drawer.tsx`, `guest-detail-sheet.tsx`, `housekeeping.ts`, `kanban-board.tsx`, `dashboard-header.tsx`, `hotel-client.tsx`, `page.tsx`, `staff-client.tsx`, `invitations.ts`, `page.tsx`, `payments-client.tsx`, `hotels-table.tsx`, `dropdown-menu.tsx`, `settings.ts`, `12 Guest-Facing Booking Application`, `database.types.ts`, `transactions-client.tsx`, `onboarding-select.tsx`, `buttonVariants`, `tooltip.tsx`, `card.tsx`, `actions.ts`, `PlatformLoginForm`?**
  _High betweenness centrality (0.132) - this node is a cross-community bridge._
- **Why does `createClient()` connect `createClient` to `pending-client.tsx`, `room-type-form.tsx`, `rooms.ts`, `page.tsx`, `writeAuditLog`, `12 Guest-Facing Booking Application`, `actions.ts`, `invitations.ts`, `page.tsx`, `page.tsx`, `utils.ts`, `guest-detail-sheet.tsx`, `booking-detail-drawer.tsx`, `reports-client.tsx`, `housekeeping.ts`, `providers.tsx`, `bookings-table.tsx`, `beds24.ts`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `react` connect `PlatformLoginForm` to `room-type-form.tsx`, `FullBookingDetail`, `createClient`, `sidebar.tsx`, `dependencies`, `reports-client.tsx`, `booking-detail-drawer.tsx`, `guest-detail-sheet.tsx`, `housekeeping.ts`, `kanban-board.tsx`, `beds24.ts`, `dashboard-header.tsx`, `page.tsx`, `invitations.ts`, `page.tsx`, `payments-client.tsx`, `dropdown-menu.tsx`, `page.tsx`, `page.tsx`, `settings.ts`, `pending-client.tsx`, `12 Guest-Facing Booking Application`, `onboarding-select.tsx`, `buttonVariants`, `card.tsx`, `actions.ts`, `page.tsx`, `page.tsx`, `page.tsx`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **What connects `supabase`, `DeactivatedPageProps`, `OnboardingInputProps` to the rest of the system?**
  _537 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `arkesel.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1099290780141844 - nodes in this community are weakly interconnected._
- **Should `createClient` be split into smaller, more focused modules?**
  _Cohesion score 0.06708595387840671 - nodes in this community are weakly interconnected._
- **Should `sidebar.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10541310541310542 - nodes in this community are weakly interconnected._