# Graph Report - hms  (2026-07-13)

## Corpus Check
- 280 files · ~179,641 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1575 nodes · 3670 edges · 120 communities (97 shown, 23 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `31822bb8`
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
1. `cn()` - 232 edges
2. `createClient()` - 119 edges
3. `react` - 63 edges
4. `Button()` - 51 edges
5. `HotelOS Pro` - 33 edges
6. `toActionError()` - 28 edges
7. `createClient()` - 27 edges
8. `requireMinRole()` - 26 edges
9. `Badge()` - 25 edges
10. `supabaseAdmin` - 25 edges

## Surprising Connections (you probably didn't know these)
- `DeactivatedPage()` --calls--> `createClient()`  [EXTRACTED]
  app/(admin)/deactivated/page.tsx → lib/supabase/server.ts
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

## Communities (120 total, 23 thin omitted)

### Community 1 - "arkesel.ts"
Cohesion: 0.11
Nodes (43): ArkeselSmsRecipientResult, ArkeselSmsResponse, BookingNotifyData, getMasterApiKey(), HotelNotifyConfig, normalizePhone(), notifyBookingCancelled(), notifyBookingConfirmed() (+35 more)

### Community 2 - "room-type-form.tsx"
Cohesion: 0.19
Nodes (17): getNotificationTemplates(), getSuperAdmin(), saveNotificationTemplates(), updateNotificationPrefs(), EVENT_TYPES, NotificationSettingsPage(), NotificationTemplatesClient(), TemplatesState (+9 more)

### Community 3 - "rooms.ts"
Cohesion: 0.15
Nodes (27): getCurrentUserRole(), AvailabilityBlockInput, AvailabilityBlockSchema, createAvailabilityBlock(), createRoom(), createRoomType(), deleteRoomType(), getAvailabilityBlocks() (+19 more)

### Community 4 - "writeAuditLog"
Cohesion: 0.17
Nodes (28): createBooking(), NewBookingSchema, BulkDailyOverrideDeleteSchema, BulkDailyOverrideSchema, bulkDeleteDailyRateOverrides(), bulkUpsertDailyRateOverrides(), createSeasonalRate(), DailyOverrideDeleteSchema (+20 more)

### Community 5 - "FullBookingDetail"
Cohesion: 0.10
Nodes (26): fetchPaystackBanks(), getPaymentsSettings(), getSuperAdminHotel(), PaymentPolicy, savePaystackBankAccount(), updatePaymentPolicy(), verifyBankAccount(), GET() (+18 more)

### Community 6 - "createClient"
Cohesion: 0.06
Nodes (19): DeactivatedPage(), DeactivatedPageProps, BookingDetailPage(), Props, CustomersPage(), DashboardHomePage(), ReportsPage(), SettingsPage() (+11 more)

### Community 7 - "bookings-detail.ts"
Cohesion: 0.17
Nodes (17): buildHotelShape(), GET(), HotelRow, DateSearchBar(), P, RoomCard(), HotelLandingPage(), Props (+9 more)

### Community 8 - "sidebar.tsx"
Cohesion: 0.09
Nodes (39): getRoleBadgeClass(), getRoleLabel(), NavItem, navItems, PlatformAdmin, PlatformSidebar(), AppSidebar(), getRoleBadgeClass() (+31 more)

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
Cohesion: 0.28
Nodes (9): bulkUpdateHousekeepingStatus(), deriveOccupancyStatus(), getHotelScopedClient(), getHousekeepingData(), updateCleaningStatus(), updateHousekeepingStatus(), updateRoomNote(), VALID_CLEANING_STATUSES (+1 more)

### Community 14 - "components.json"
Cohesion: 0.09
Nodes (22): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+14 more)

### Community 15 - "guest-detail-sheet.tsx"
Cohesion: 0.15
Nodes (21): getGuestBookings(), GuestBookingSummary, UpdateContactSchema, updateGuestContact(), updateGuestNotes(), updateGuestTags(), UpdateNotesSchema, UpdateTagsSchema (+13 more)

### Community 16 - "booking-detail-drawer.tsx"
Cohesion: 0.06
Nodes (66): ALLOWED_TRANSITIONS, CreateBookingResult, FullBookingDetail, getFullBookingDetail(), getHotelScopedClient(), PaymentRecord, recordPayment(), RecordPaymentInput (+58 more)

### Community 17 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 18 - "HotelOS Pro"
Cohesion: 0.11
Nodes (18): 10 Platform Admin, 17 Availability Color Coding, 21 Reports, 24 Performance Requirements, 28 Open Source Licenses, 29 MVP Acceptance Criteria, 30 Post-MVP Features Backlog, 6 Technology Stack (+10 more)

### Community 19 - "8 Database Schema"
Cohesion: 0.12
Nodes (17): 8 Database Schema, Append-only Tables, `audit\\\_logs`, `availability\\\_blocks`, `beds24\\\_property\\\_mappings`, `beds24\\\_sync\\\_log`, `bookings`, Design Principles (+9 more)

### Community 20 - "housekeeping.ts"
Cohesion: 0.24
Nodes (13): approveStaff(), changeStaffRole(), getHotelScopedClient(), getPendingStaff(), getPendingStaffCount(), getStaffList(), PendingStaffRequest, rejectStaff() (+5 more)

### Community 21 - "HotelOS Pro — Platform Admin Setup Guide"
Cohesion: 0.12
Nodes (16): Architecture Overview, File Reference, HotelOS Pro — Platform Admin Setup Guide, Manual reset (HotelOS team resets for another admin), Method A — "Add user" (instant, no email required), Method B — "Invite user" (sends a magic-link setup email), New Environment Checklist, Redirect URLs (add both) (+8 more)

### Community 22 - "kanban-board.tsx"
Cohesion: 0.10
Nodes (21): ActivityList(), ActivityListProps, DesktopBookingRow(), formatDate(), getEmptyDescription(), getEmptyTitle(), getNights(), getStatusLabel() (+13 more)

### Community 23 - "bookings-table.tsx"
Cohesion: 0.12
Nodes (20): NewBookingInput, getResolvedRatesForBooking(), StaffResolvedPricing, CalendarRoom, BlockRoomSheetProps, BLOCK_REASONS, formatCurrency(), NewBookingSheet() (+12 more)

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
Nodes (17): RoomTypesPage(), RoomTypesClient(), RoomTypesClientProps, RoomTypeRow, PendingStaffPage(), formatDate(), getInitials(), PendingStaffClient() (+9 more)

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
Cohesion: 0.12
Nodes (18): AppHeaderProps, Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup(), AvatarGroupCount(), AvatarImage(), bottomVariants (+10 more)

### Community 33 - "invitations.ts"
Cohesion: 0.16
Nodes (17): AssignResult, AvailabilityCheckResult, AvailabilityConflict, createAvailabilityBlock(), deleteAvailabilityBlock(), getBookingById(), getCalendarData(), getCurrentStaffRole() (+9 more)

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
Nodes (19): CLEANING_FILTER_OPTIONS, DatePickerPopover(), DatePickerPopoverProps, DateTab, DateTabButton(), DateTabButtonProps, FilterSelect(), FilterSelectProps (+11 more)

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
Cohesion: 0.18
Nodes (11): fetchNotificationsAction(), markAllReadAction(), markSingleReadAction(), NotificationItem, SearchResult, AppHeader(), AuthContext, AuthError (+3 more)

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
Cohesion: 0.15
Nodes (15): getHotelProfile(), getHotelScopedClient(), getNotificationPrefs(), HotelProfileInput, HotelProfileSchema, updateHotelProfile(), HotelSettingsClient(), HotelSettingsClientProps (+7 more)

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
Cohesion: 0.23
Nodes (14): CalendarAvailabilityBlock, buildEvents(), CalendarEvent, escapeHtml(), titleCase(), CALENDAR_LEGEND, escapeHtml(), getBookingBarColor() (+6 more)

### Community 82 - "admin.ts"
Cohesion: 0.13
Nodes (9): STATUS_MAP, HotelsTable(), FILTERS, FilterTab(), Props, PlatformDashboard(), StatCard(), StatCardProps (+1 more)

### Community 88 - "database.types.ts"
Cohesion: 0.27
Nodes (5): DashboardNotFound(), OfflinePage(), Hero(), Button(), buttonVariants

### Community 89 - "transactions-client.tsx"
Cohesion: 0.22
Nodes (9): formatCurrency(), QuickStatRow(), QuickStats(), QuickStatsData, QuickStatsProps, SummaryRow(), TodaySummary(), TodaySummaryData (+1 more)

### Community 90 - "onboarding-select.tsx"
Cohesion: 0.24
Nodes (8): ActivityBooking, buildActivityTabs(), OccupancyCard(), DashboardClient(), DashboardClientProps, defaultEmptyStats, fetchDashboardClientData(), qk

### Community 91 - "buttonVariants"
Cohesion: 0.33
Nodes (8): BookingDetailPanel(), formatCurrency(), formatDateFull(), FullBooking, getNights(), getSourceLabel(), getStatusLabel(), getStatusVariant()

### Community 92 - "tooltip.tsx"
Cohesion: 0.39
Nodes (7): CalendarBooking, BookingDetailPanelProps, getNights(), getStatusColor(), isDue(), UnassignedTray(), UnassignedTrayProps

### Community 93 - "unassigned-tray.tsx"
Cohesion: 0.38
Nodes (6): getFromAddress(), getResend(), ResendEmailParams, ResendSendResult, sendEmailViaResend(), resend

### Community 94 - "resend.ts"
Cohesion: 0.39
Nodes (5): GET(), GET(), PlatformDashboardLayout(), PlatformLayout(), createPlatformClient()

### Community 95 - "availability-matrix-client.tsx"
Cohesion: 0.17
Nodes (13): OccupancyDonut(), EditRoomTypePage(), EventCard(), CollapsibleNavItem(), DashboardPwaShell(), OfflineIndicator(), PwaInstallPrompt(), wasDismissedRecently() (+5 more)

### Community 97 - "card.tsx"
Cohesion: 0.14
Nodes (19): deleteStorageFile(), getHotelId(), saveHotelImageUrl(), saveRoomImages(), Props, RoomPreviewSheet(), RoomType, DEFAULT_VALUES (+11 more)

### Community 98 - "calendar-resources.ts"
Cohesion: 0.43
Nodes (6): getRoomStatusColor(), buildResources(), buildRoomRowHtml(), buildSectionHeaderHtml(), CalendarResource, escapeHtml()

### Community 99 - "actions.ts"
Cohesion: 0.15
Nodes (15): assignBookingToRoom(), CalendarData, checkRoomAvailability(), moveBooking(), CalendarClient(), CalendarClientProps, DayPilotScheduler, FilterToggle() (+7 more)

### Community 101 - "stats-bar.tsx"
Cohesion: 0.33
Nodes (5): HousekeepingData, HousekeepingClientProps, HK_COLUMNS, HousekeepingStatsBarProps, StatChip()

### Community 102 - "layout.tsx"
Cohesion: 0.33
Nodes (3): cormorant, dmSans, Props

### Community 108 - "12 Guest-Facing Booking Application"
Cohesion: 0.67
Nodes (3): 12.1 Tenant Resolution, 12.2 Guest Pages, 12 Guest-Facing Booking Application

### Community 109 - "1 Executive Summary"
Cohesion: 0.67
Nodes (3): 1 Executive Summary, Core Problems Solved, Why Ghana

### Community 143 - "reports-client.tsx"
Cohesion: 0.14
Nodes (17): ACTIVE, getHotelId(), getOccupancyReport(), getRevenueReport(), getSourcesReport(), OccupancyReportData, RevenueReportData, SourcesReportData (+9 more)

### Community 165 - "layout.tsx"
Cohesion: 0.17
Nodes (11): geistMono, jakarta, metadata, viewport, getQueryClient(), makeQueryClient(), Providers(), ThemeProvider() (+3 more)

### Community 167 - "createPlatformClient"
Cohesion: 0.18
Nodes (11): approveHotel(), assertPlatformAdmin(), changeHotelPlan(), getHotelSupportView(), reactivateHotel(), suspendHotel(), Hotel, HotelActionsMenuProps (+3 more)

### Community 171 - "hotels-table.tsx"
Cohesion: 0.24
Nodes (10): OccupancyCardProps, UpdatePasswordForm(), metadata, Card(), CardAction(), CardContent(), CardDescription(), CardFooter() (+2 more)

### Community 176 - "dropdown-menu.tsx"
Cohesion: 0.09
Nodes (41): createShareableInvite(), RoomRow, RoomsDirectoryProps, STATUS_CONFIG, STATUS_TRANSITIONS, formatCurrency(), getColumns(), RoomTypesTableProps (+33 more)

### Community 183 - "page.tsx"
Cohesion: 0.14
Nodes (9): Amenity, BookingWizard(), Hotel, Props, RoomImage, RoomType, Props, RoomGallery() (+1 more)

### Community 187 - "page.tsx"
Cohesion: 0.24
Nodes (7): ConfirmationPage(), Props, scalar(), SearchParamValue, CopyButton(), PaymentVerifier(), Props

### Community 274 - "cn"
Cohesion: 0.11
Nodes (31): searchGlobal(), GlobalSearch(), GlobalSearchProps, Command(), CommandDialog(), CommandEmpty(), CommandGroup(), CommandInput() (+23 more)

## Knowledge Gaps
- **545 isolated node(s):** `supabase`, `DeactivatedPageProps`, `OnboardingInputProps`, `OnboardingSelectOption`, `OnboardingSelectProps` (+540 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `room-type-form.tsx`, `rooms.ts`, `writeAuditLog`, `FullBookingDetail`, `createClient`, `sidebar.tsx`, `reports-client.tsx`, `booking-detail-drawer.tsx`, `guest-detail-sheet.tsx`, `kanban-board.tsx`, `bookings-table.tsx`, `dashboard-header.tsx`, `hotel-client.tsx`, `page.tsx`, `staff-client.tsx`, `invitations.ts`, `payments-client.tsx`, `hotels-table.tsx`, `dropdown-menu.tsx`, `providers.tsx`, `settings.ts`, `pending-client.tsx`, `12 Guest-Facing Booking Application`, `admin.ts`, `database.types.ts`, `transactions-client.tsx`, `onboarding-select.tsx`, `buttonVariants`, `tooltip.tsx`, `availability-matrix-client.tsx`, `card.tsx`, `actions.ts`, `PlatformLoginForm`, `stats-bar.tsx`, `page.tsx`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **Why does `createClient()` connect `rooms.ts` to `room-type-form.tsx`, `writeAuditLog`, `FullBookingDetail`, `createClient`, `sidebar.tsx`, `utils.ts`, `guest-detail-sheet.tsx`, `booking-detail-drawer.tsx`, `reports-client.tsx`, `cn`, `housekeeping.ts`, `bookings-table.tsx`, `beds24.ts`, `hotel-client.tsx`, `invitations.ts`, `page.tsx`, `providers.tsx`, `pending-client.tsx`, `12 Guest-Facing Booking Application`, `card.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Why does `react` connect `availability-matrix-client.tsx` to `room-type-form.tsx`, `rooms.ts`, `FullBookingDetail`, `bookings-detail.ts`, `sidebar.tsx`, `dependencies`, `reports-client.tsx`, `booking-detail-drawer.tsx`, `guest-detail-sheet.tsx`, `cn`, `kanban-board.tsx`, `bookings-table.tsx`, `beds24.ts`, `hotel-client.tsx`, `page.tsx`, `invitations.ts`, `payments-client.tsx`, `hotels-table.tsx`, `dropdown-menu.tsx`, `providers.tsx`, `page.tsx`, `page.tsx`, `settings.ts`, `pending-client.tsx`, `12 Guest-Facing Booking Application`, `admin.ts`, `onboarding-select.tsx`, `buttonVariants`, `tooltip.tsx`, `card.tsx`, `actions.ts`, `PlatformLoginForm`, `page.tsx`, `page.tsx`, `page.tsx`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **What connects `supabase`, `DeactivatedPageProps`, `OnboardingInputProps` to the rest of the system?**
  _549 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `arkesel.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1099290780141844 - nodes in this community are weakly interconnected._
- **Should `rooms.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1471264367816092 - nodes in this community are weakly interconnected._
- **Should `FullBookingDetail` be split into smaller, more focused modules?**
  _Cohesion score 0.09848484848484848 - nodes in this community are weakly interconnected._