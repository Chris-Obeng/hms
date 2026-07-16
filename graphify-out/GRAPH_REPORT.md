# Graph Report - hms  (2026-07-13)

## Corpus Check
- 300 files · ~196,222 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1683 nodes · 3786 edges · 127 communities (106 shown, 21 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2a8d11c7`
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
- calendar-resources.ts
- actions.ts
- PlatformLoginForm
- stats-bar.tsx
- layout.tsx
- page.tsx
- page.tsx
- page.tsx
- page.tsx
- page.tsx
- 12 Guest-Facing Booking Application
- 1 Executive Summary
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- extraction-spec.md
- bookings.ts
- stats-bar.tsx
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
1. `cn()` - 232 edges
2. `createClient()` - 120 edges
3. `react` - 63 edges
4. `Button()` - 51 edges
5. `HotelOS Pro` - 33 edges
6. `toActionError()` - 29 edges
7. `requireMinRole()` - 27 edges
8. `createClient()` - 27 edges
9. `Badge()` - 25 edges
10. `supabaseAdmin` - 25 edges

## Surprising Connections (you probably didn't know these)
- `getPendingStaffCount()` --calls--> `createClient()`  [EXTRACTED]
  app/actions/staff.ts → lib/supabase/server.ts
- `Tier1Card()` --calls--> `cn()`  [EXTRACTED]
  app/dashboard/_components/activity-tabs.tsx → lib/utils.ts
- `Tier2Card()` --calls--> `cn()`  [EXTRACTED]
  app/dashboard/_components/activity-tabs.tsx → lib/utils.ts
- `AlertStrip()` --calls--> `cn()`  [EXTRACTED]
  app/dashboard/_components/activity-tabs.tsx → lib/utils.ts
- `InventoryGrid()` --calls--> `cn()`  [EXTRACTED]
  app/dashboard/availability/availability-matrix-client.tsx → lib/utils.ts

## Import Cycles
- None detected.

## Communities (127 total, 21 thin omitted)

### Community 1 - "arkesel.ts"
Cohesion: 0.05
Nodes (75): getNotificationTemplates(), getSuperAdmin(), saveNotificationTemplates(), getHotelProfile(), getHotelScopedClient(), getNotificationPrefs(), HotelProfileInput, HotelProfileSchema (+67 more)

### Community 2 - "room-type-form.tsx"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 3 - "rooms.ts"
Cohesion: 0.18
Nodes (23): AvailabilityBlockInput, AvailabilityBlockSchema, createAvailabilityBlock(), createRoom(), createRoomType(), deleteRoomType(), getAvailabilityBlocks(), getHotelId() (+15 more)

### Community 4 - "writeAuditLog"
Cohesion: 0.16
Nodes (28): BulkDailyOverrideDeleteSchema, BulkDailyOverrideSchema, bulkDeleteDailyRateOverrides(), bulkUpsertDailyRateOverrides(), createSeasonalRate(), DailyOverrideDeleteSchema, DailyOverrideSchema, deleteDailyRateOverride() (+20 more)

### Community 5 - "FullBookingDetail"
Cohesion: 0.05
Nodes (46): fetchPaystackBanks(), getPaymentsSettings(), getSuperAdminHotel(), PaymentPolicy, savePaystackBankAccount(), updatePaymentPolicy(), verifyBankAccount(), GET() (+38 more)

### Community 6 - "createClient"
Cohesion: 0.06
Nodes (30): getCurrentUserRole(), DeactivatedPage(), DeactivatedPageProps, SuspendedPage(), BookingDetailPage(), Props, BookingsPage(), CustomersPage() (+22 more)

### Community 7 - "bookings-detail.ts"
Cohesion: 0.22
Nodes (12): buildHotelShape(), GET(), HotelRow, POST(), Schema, initializeTransaction(), buildNightDates(), isWeekendNight() (+4 more)

### Community 8 - "sidebar.tsx"
Cohesion: 0.09
Nodes (28): getRoleBadgeClass(), getRoleLabel(), NavItem, navItems, PlatformAdmin, PlatformSidebar(), PlatformSignOutButton(), AppSidebar() (+20 more)

### Community 9 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 10 - "dependencies"
Cohesion: 0.07
Nodes (29): dependencies, @base-ui/react, class-variance-authority, @clerk/nextjs, clsx, cmdk, date-fns, @daypilot/daypilot-lite-react (+21 more)

### Community 11 - "Tables"
Cohesion: 0.08
Nodes (25): Adding a new column (recipe), Append-only Tables, `audit_logs`, `availability_blocks`, `beds24_property_mappings`, `beds24_sync_log`, `bookings`, Conventions (+17 more)

### Community 12 - "Page Descriptions"
Cohesion: 0.08
Nodes (25): 11 Hotel Admin Dashboard — All Pages, `/bookings`, `/bookings/calendar`, `/bookings/\\\[id]`, `/bookings/new`, Complete Page Directory, `/guests`, `/guests/\\\[id]` (+17 more)

### Community 13 - "utils.ts"
Cohesion: 0.22
Nodes (12): bulkUpdateHousekeepingStatus(), deriveOccupancyStatus(), getHotelScopedClient(), getHousekeepingData(), updateCleaningStatus(), updateHousekeepingStatus(), updateRoomNote(), VALID_CLEANING_STATUSES (+4 more)

### Community 14 - "components.json"
Cohesion: 0.09
Nodes (22): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+14 more)

### Community 15 - "guest-detail-sheet.tsx"
Cohesion: 0.15
Nodes (21): getGuestBookings(), GuestBookingSummary, UpdateContactSchema, updateGuestContact(), updateGuestNotes(), updateGuestTags(), UpdateNotesSchema, UpdateTagsSchema (+13 more)

### Community 16 - "booking-detail-drawer.tsx"
Cohesion: 0.07
Nodes (57): FullBookingDetail, getFullBookingDetail(), getHotelScopedClient(), PaymentRecord, recordPayment(), RecordPaymentInput, RecordPaymentSchema, StaffRoleInfo (+49 more)

### Community 17 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 18 - "HotelOS Pro"
Cohesion: 0.09
Nodes (21): 10 Platform Admin, 12.1 Tenant Resolution, 12.2 Guest Pages, 12 Guest-Facing Booking Application, 17 Availability Color Coding, 21 Reports, 24 Performance Requirements, 28 Open Source Licenses (+13 more)

### Community 19 - "8 Database Schema"
Cohesion: 0.12
Nodes (17): 8 Database Schema, Append-only Tables, `audit\\\_logs`, `availability\\\_blocks`, `beds24\\\_property\\\_mappings`, `beds24\\\_sync\\\_log`, `bookings`, Design Principles (+9 more)

### Community 20 - "housekeeping.ts"
Cohesion: 0.20
Nodes (14): createShareableInvite(), approveStaff(), changeStaffRole(), getHotelScopedClient(), getPendingStaff(), getPendingStaffCount(), getStaffList(), PendingStaffRequest (+6 more)

### Community 21 - "HotelOS Pro — Platform Admin Setup Guide"
Cohesion: 0.12
Nodes (16): Architecture Overview, File Reference, HotelOS Pro — Platform Admin Setup Guide, Manual reset (HotelOS team resets for another admin), Method A — "Add user" (instant, no email required), Method B — "Invite user" (sends a magic-link setup email), New Environment Checklist, Redirect URLs (add both) (+8 more)

### Community 22 - "kanban-board.tsx"
Cohesion: 0.18
Nodes (13): ActivityBooking, ActivityList(), ActivityListProps, DesktopBookingRow(), formatDate(), getEmptyDescription(), getEmptyTitle(), getNights() (+5 more)

### Community 23 - "bookings-table.tsx"
Cohesion: 0.13
Nodes (20): getPageTitle(), PlatformHeader(), Sidebar(), SidebarContext, SidebarContextProps, SidebarGroupAction(), SidebarInput(), SidebarInset() (+12 more)

### Community 24 - "devDependencies"
Cohesion: 0.15
Nodes (13): devDependencies, eslint, eslint-config-next, fallow, knip, shadcn, sharp, tailwindcss (+5 more)

### Community 25 - "beds24.ts"
Cohesion: 0.11
Nodes (23): forceBeds24Sync(), getIntegrationsData(), getLastSyncTime(), getSuperAdmin(), saveBeds24Config(), testArkeselSms(), testBeds24(), toggleHotelNotifications() (+15 more)

### Community 26 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, db:diff, db:pull, db:push, db:reset, db:types, dev (+3 more)

### Community 27 - "dashboard-header.tsx"
Cohesion: 0.23
Nodes (10): HousekeepingRoom, COLUMN_ROOM_FILTER, HousekeepingBoard(), HousekeepingBoardProps, sortRooms(), ActionConfig, CLEANING_STATUS_CONFIG, getQuickActions() (+2 more)

### Community 28 - "hotel-client.tsx"
Cohesion: 0.13
Nodes (19): formatDate(), getInitials(), PendingStaffClient(), PendingStaffClientProps, PendingStaffRow, Avatar(), AvatarBadge(), AvatarFallback() (+11 more)

### Community 29 - "page.tsx"
Cohesion: 0.11
Nodes (17): CleaningStatus, RoomOccupancyStatus, HousekeepingTableProps, CLEANING_STATUS_OPTIONS, CleaningStatusDropdown(), CleaningStatusDropdownProps, CleaningStatusOption, getCleaningStatusOption() (+9 more)

### Community 30 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 31 - "proxy.ts"
Cohesion: 0.29
Nodes (7): config, isBookingRoute, isPlatformPublic, isPlatformRoute, isPublicDashboardRoute, IMPORTANT: Must call getClaims() between createServerClient and any redirect, updatePlatformSession()

### Community 32 - "staff-client.tsx"
Cohesion: 0.16
Nodes (12): AppHeaderProps, bottomVariants, MenuIcon, MenuIconHandle, MenuIconProps, middleVariants, topVariants, bellVariants (+4 more)

### Community 33 - "invitations.ts"
Cohesion: 0.14
Nodes (23): assignBookingToRoom(), AssignResult, AvailabilityCheckResult, AvailabilityConflict, checkRoomAvailability(), createAvailabilityBlock(), deleteAvailabilityBlock(), getBookingById() (+15 more)

### Community 34 - "Supabase Realtime — Setup & Status"
Cohesion: 0.22
Nodes (8): How the Realtime pipeline works, If you ever need to re-apply manually, Migration applied, RLS note, Status checklist, Subscription code (calendar-client.tsx), Supabase Realtime — Setup & Status, What was done

### Community 35 - "Booking Page Setup Guide"
Cohesion: 0.25
Nodes (7): 1. Access Your Hotel's Booking Page, 2. Development Access Methods, 3. Production Setup, Booking Page Setup Guide, How It Works, Quick Start, Troubleshooting

### Community 36 - "page.tsx"
Cohesion: 0.10
Nodes (21): createHotelProfile(), OnboardingInput, OnboardingSchema, slugify(), OnboardingInput, OnboardingInputProps, OnboardingSelect, OnboardingSelectOption (+13 more)

### Community 37 - "13 Payment System — Paystack Subaccounts"
Cohesion: 0.25
Nodes (8): 13.1 Architecture: One Master Account, Per-Hotel Subaccounts, 13.2 Creating a Hotel Subaccount, 13.3 Account Verification Before Saving, 13.4 Pay Now Flow, 13.5 Paystack Webhook, 13.6 Pay at Check-In, 13.7 Refunds, 13 Payment System — Paystack Subaccounts

### Community 38 - "payments-client.tsx"
Cohesion: 0.14
Nodes (17): ACTIVE, getHotelId(), getOccupancyReport(), getRevenueReport(), getSourcesReport(), OccupancyReportData, RevenueReportData, SourcesReportData (+9 more)

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
Cohesion: 0.16
Nodes (13): fetchNotificationsAction(), markAllReadAction(), markSingleReadAction(), NotificationItem, searchGlobal(), SearchResult, GlobalSearch(), AppHeader() (+5 more)

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
Cohesion: 0.15
Nodes (14): DashboardNotFound(), POLICY_OPTIONS, Props, OfflinePage(), formatCurrency(), NewBookingSheet(), NewBookingSheetProps, RoomTypeOption (+6 more)

### Community 61 - "5 Multi-Tenancy Architecture"
Cohesion: 0.50
Nodes (4): 5 Multi-Tenancy Architecture, Isolation Layers, Model: Shared Database, Row-Level Isolation, New Hotel Provisioning Flow

### Community 62 - "calendar-store.ts"
Cohesion: 0.50
Nodes (3): CalendarUIState, RoomTypeFilter, useCalendarStore

### Community 63 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 67 - "12 Guest-Facing Booking Application"
Cohesion: 0.11
Nodes (21): AvailabilityMatrixClient(), AvailabilityMatrixData, DateHeader(), DAY_PRESETS, InventoryCell(), InventoryGrid(), MatrixTotalCell, RoomAvailabilityCell (+13 more)

### Community 68 - "16 Guest Directory"
Cohesion: 0.67
Nodes (3): 16 Guest Directory, `/guests/\\\[id]` — Profile Page, `/guests` — List Page

### Community 69 - "1 Executive Summary"
Cohesion: 0.14
Nodes (19): CLEANING_FILTER_OPTIONS, DatePickerPopover(), DatePickerPopoverProps, DateTab, DateTabButton(), DateTabButtonProps, FilterSelect(), FilterSelectProps (+11 more)

### Community 74 - "upload.ts"
Cohesion: 0.12
Nodes (15): Accessing Documentation & Component Information, Component Patterns, Core Principles, CORRECT (v3 patterns), Critical Setup Requirements, CRITICAL: v3 Only - Ignore v2 Knowledge, Direct MDX URLs, Framework Setup (Next.js App Router - Recommended) (+7 more)

### Community 82 - "admin.ts"
Cohesion: 0.16
Nodes (5): STATUS_MAP, cormorant, dmSans, Props, supabaseAdmin

### Community 88 - "database.types.ts"
Cohesion: 0.20
Nodes (16): CalendarAvailabilityBlock, buildEvents(), CalendarEvent, escapeHtml(), titleCase(), BLOCK_REASONS, CALENDAR_LEGEND, escapeHtml() (+8 more)

### Community 89 - "transactions-client.tsx"
Cohesion: 0.09
Nodes (24): ActivityTabData, ActivityTabs(), ActivityTabsProps, AlertStrip(), buildActivityTabs(), Tier1Card(), Tier2Card(), OccupancyCard() (+16 more)

### Community 90 - "onboarding-select.tsx"
Cohesion: 0.22
Nodes (11): DateSearchBar(), P, RoomCard(), HotelLandingPage(), Props, Props, RoomsPage(), GalleryImage (+3 more)

### Community 91 - "buttonVariants"
Cohesion: 0.22
Nodes (14): BookingsTable(), BookingsTableProps, exportToCsv(), formatCurrency(), formatDate(), getColumns(), getPaymentLabel(), getStatusLabel() (+6 more)

### Community 92 - "tooltip.tsx"
Cohesion: 0.17
Nodes (8): CalendarData, CalendarClientProps, DayPilotScheduler, FilterToggle(), MenuButton(), RoomTypeFilter, SOURCE_OPTIONS, STATUS_OPTIONS

### Community 93 - "unassigned-tray.tsx"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 94 - "resend.ts"
Cohesion: 0.23
Nodes (11): GET(), GET(), approveHotel(), assertPlatformAdmin(), changeHotelPlan(), getHotelSupportView(), reactivateHotel(), suspendHotel() (+3 more)

### Community 95 - "availability-matrix-client.tsx"
Cohesion: 0.26
Nodes (8): DashboardPwaShell(), OfflineIndicator(), PwaInstallPrompt(), wasDismissedRecently(), SidebarProvider(), BeforeInstallPromptEvent, usePwaInstall(), WindowEventMap

### Community 97 - "card.tsx"
Cohesion: 0.07
Nodes (33): deleteStorageFile(), getHotelId(), saveHotelImageUrl(), saveRoomImages(), OccupancyDonut(), Props, RoomPreviewSheet(), RoomType (+25 more)

### Community 98 - "calendar-resources.ts"
Cohesion: 0.24
Nodes (7): Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay(), SheetTitle()

### Community 99 - "actions.ts"
Cohesion: 0.47
Nodes (4): fmt(), OutstandingClient(), OutstandingRow, OutstandingPage()

### Community 100 - "PlatformLoginForm"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 101 - "stats-bar.tsx"
Cohesion: 0.31
Nodes (8): CalendarRoom, BlockRoomSheetProps, getRoomStatusColor(), buildResources(), buildRoomRowHtml(), buildSectionHeaderHtml(), CalendarResource, escapeHtml()

### Community 102 - "layout.tsx"
Cohesion: 0.27
Nodes (8): DashboardHeader(), DashboardHeaderProps, Popover(), PopoverContent(), PopoverDescription(), PopoverHeader(), PopoverTitle(), PopoverTrigger()

### Community 103 - "page.tsx"
Cohesion: 0.20
Nodes (7): HotelsTable(), FILTERS, FilterTab(), Props, PlatformDashboard(), StatCard(), StatCardProps

### Community 104 - "page.tsx"
Cohesion: 0.33
Nodes (8): ALL_TAG_OPTIONS, CustomersTable(), CustomersTableProps, exportToCsv(), formatCurrency(), formatDate(), getTagStyle(), TAG_STYLES

### Community 105 - "page.tsx"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 106 - "page.tsx"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 107 - "page.tsx"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 108 - "12 Guest-Facing Booking Application"
Cohesion: 0.39
Nodes (7): CalendarBooking, BookingDetailPanelProps, getNights(), getStatusColor(), isDue(), UnassignedTray(), UnassignedTrayProps

### Community 109 - "1 Executive Summary"
Cohesion: 0.67
Nodes (3): 1 Executive Summary, Core Problems Solved, Why Ghana

### Community 116 - "bookings.ts"
Cohesion: 0.33
Nodes (6): ALLOWED_TRANSITIONS, createBooking(), CreateBookingResult, MANAGER_ONLY_STATUSES, NewBookingInput, NewBookingSchema

### Community 117 - "stats-bar.tsx"
Cohesion: 0.33
Nodes (5): HousekeepingData, HousekeepingClientProps, HK_COLUMNS, HousekeepingStatsBarProps, StatChip()

### Community 165 - "layout.tsx"
Cohesion: 0.18
Nodes (10): geistMono, jakarta, metadata, viewport, getQueryClient(), makeQueryClient(), Providers(), ThemeProvider() (+2 more)

### Community 167 - "createPlatformClient"
Cohesion: 0.18
Nodes (7): Hotel, HotelActionsMenuProps, HotelCardProps, PLAN_CLASSES, STATUS_CLASSES, Badge(), badgeVariants

### Community 171 - "hotels-table.tsx"
Cohesion: 0.19
Nodes (16): OccupancyCardProps, formatCurrency(), QuickStats(), QuickStatsData, QuickStatsProps, TodaySummary(), TodaySummaryData, TodaySummaryProps (+8 more)

### Community 176 - "dropdown-menu.tsx"
Cohesion: 0.14
Nodes (24): RoomRow, RoomsDirectoryProps, STATUS_CONFIG, STATUS_TRANSITIONS, formatCurrency(), getColumns(), RoomTypesTableProps, ROLE_CONFIG (+16 more)

### Community 183 - "page.tsx"
Cohesion: 0.17
Nodes (7): Amenity, BookingWizard(), Hotel, Props, RoomImage, RoomType, Props

### Community 187 - "page.tsx"
Cohesion: 0.24
Nodes (7): ConfirmationPage(), Props, scalar(), SearchParamValue, CopyButton(), PaymentVerifier(), Props

### Community 274 - "cn"
Cohesion: 0.11
Nodes (31): Td(), Th(), GlobalSearchProps, QuickStatRow(), SummaryRow(), CardAction(), CardFooter(), Command() (+23 more)

## Knowledge Gaps
- **600 isolated node(s):** `FALLBACK_THEME`, `supabase`, `DeactivatedPageProps`, `OnboardingInputProps`, `OnboardingSelectOption` (+595 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `arkesel.ts`, `rooms.ts`, `writeAuditLog`, `FullBookingDetail`, `createClient`, `sidebar.tsx`, `guest-detail-sheet.tsx`, `booking-detail-drawer.tsx`, `housekeeping.ts`, `kanban-board.tsx`, `bookings-table.tsx`, `dashboard-header.tsx`, `hotel-client.tsx`, `page.tsx`, `staff-client.tsx`, `invitations.ts`, `payments-client.tsx`, `createPlatformClient`, `hotels-table.tsx`, `dropdown-menu.tsx`, `providers.tsx`, `settings.ts`, `12 Guest-Facing Booking Application`, `1 Executive Summary`, `transactions-client.tsx`, `buttonVariants`, `tooltip.tsx`, `availability-matrix-client.tsx`, `card.tsx`, `calendar-resources.ts`, `layout.tsx`, `page.tsx`, `page.tsx`, `12 Guest-Facing Booking Application`, `stats-bar.tsx`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `react` connect `card.tsx` to `arkesel.ts`, `rooms.ts`, `FullBookingDetail`, `sidebar.tsx`, `dependencies`, `guest-detail-sheet.tsx`, `booking-detail-drawer.tsx`, `housekeeping.ts`, `kanban-board.tsx`, `bookings-table.tsx`, `beds24.ts`, `hotel-client.tsx`, `page.tsx`, `invitations.ts`, `payments-client.tsx`, `providers.tsx`, `page.tsx`, `page.tsx`, `settings.ts`, `pending-client.tsx`, `12 Guest-Facing Booking Application`, `1 Executive Summary`, `transactions-client.tsx`, `onboarding-select.tsx`, `buttonVariants`, `availability-matrix-client.tsx`, `actions.ts`, `layout.tsx`, `page.tsx`, `page.tsx`, `12 Guest-Facing Booking Application`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Why does `createClient()` connect `createClient` to `arkesel.ts`, `rooms.ts`, `writeAuditLog`, `FullBookingDetail`, `utils.ts`, `guest-detail-sheet.tsx`, `booking-detail-drawer.tsx`, `housekeeping.ts`, `beds24.ts`, `invitations.ts`, `payments-client.tsx`, `page.tsx`, `providers.tsx`, `pending-client.tsx`, `12 Guest-Facing Booking Application`, `availability-matrix-client.tsx`, `card.tsx`, `actions.ts`, `bookings.ts`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **What connects `FALLBACK_THEME`, `supabase`, `DeactivatedPageProps` to the rest of the system?**
  _604 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `arkesel.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.054075235109717866 - nodes in this community are weakly interconnected._
- **Should `room-type-form.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `FullBookingDetail` be split into smaller, more focused modules?**
  _Cohesion score 0.05493863237872589 - nodes in this community are weakly interconnected._