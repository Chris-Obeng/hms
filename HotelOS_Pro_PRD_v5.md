# HotelOS Pro

## Product Requirements Document (PRD)

### Version 5.0 — MVP Edition (Single-App Architecture)

> **What changed from v4.0:** The Turborepo monorepo (three separate Next.js apps under `apps/`) has been replaced with a single Next.js 16+ application using route groups and host-based middleware routing. See Sections 4, 6, 7, 26, and 27. Same three subdomains, same page-by-page feature scope, same database/RLS design — just one codebase and one deployment instead of three.

> MVP Scope Note: This document defines the first production-ready release of HotelOS Pro. Features marked as post-MVP are intentionally excluded from v1 to keep scope focused, delivery fast, and the product easy to learn. Every feature included is critical to the core hotel operating workflow.

--

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision  Goals](#2-product-vision--goals)
3. [Business Model](#3-business-model)
4. [System Architecture](#4-system-architecture)
5. [Multi-Tenancy Architecture](#5-multi-tenancy-architecture)
6. [Technology Stack](#6-technology-stack)
7. [Repository  Project Structure](#7-repository--project-structure)
8. [Database Schema](#8-database-schema)
9. [Authentication  Role-Based Access Control](#9-authentication--role-based-access-control)
10. [Platform Admin](#10-platform-admin)
11. [Hotel Admin Dashboard — All Pages](#11-hotel-admin-dashboard--all-pages)
12. [Guest-Facing Booking Application](#12-guest-facing-booking-application)
13. [Payment System — Paystack Subaccounts](#13-payment-system--paystack-subaccounts)
14. [Beds24  OTA Channel Sync](#14-beds24--ota-channel-sync)
15. [Notification System](#15-notification-system)
16. [Guest Directory](#16-guest-directory)
17. [Availability Color Coding](#17-availability-color-coding)
18. [Timeline Calendar — DayPilot Lite](#18-timeline-calendar--daypilot-lite)
19. [PWA Features](#19-pwa-features)
20. [UI/UX Design System](#20-uiux-design-system)
21. [Reports](#21-reports)
22. [Settings](#22-settings)
23. [Security](#23-security)
24. [Performance Requirements](#24-performance-requirements)
25. [Additional Operational Features](#25-additional-operational-features)
26. [Subdomain  Custom Domain Routing](#26-subdomain--custom-domain-routing)
27. [MVP Implementation Roadmap](#27-mvp-implementation-roadmap)
28. [Open Source Licenses](#28-open-source-licenses)
29. [MVP Acceptance Criteria](#29-mvp-acceptance-criteria)
30. [Post-MVP Features Backlog](#30-post-mvp-features-backlog)

--

## 1 Executive Summary

HotelOS Pro is a **multi-tenant SaaS hotel management and direct booking platform** targeting independent hotels, guesthouses, and boutique properties in Ghana and West Africa. It replaces spreadsheets, WhatsApp group chats, and expensive foreign PMS tools with a single, locally-priced platform denominated in GHC.

The platform is built as **one Next.js application**, serving **three logical areas** through host-based middleware routing, all sharing one Supabase PostgreSQL backend:

- `**platform.hotelosprp.com`** — Internal super-admin for the HotelOS Pro team to manage all hotel tenants.
- `**app.hotelosprp.com`** — Multi-tenant hotel staff dashboard. Every hotel's staff logs in here; `hotel_id` scopes everything they see and do.
- `**[slug].hotelosprp.com**` or `**book.theirhotel.com**` — Guest-facing booking experience. Dynamically renders each hotel's branding, rooms, and pricing from the database.

### Core Problems Solved

- Double-booking between direct reservations and Bookings.com (via Beds24)
- Manual, fragmented front-desk workflows with no central system
- No real-time room status visibility across staff shifts
- No centralised guest history for repeat-guest recognition
- Dollar-priced foreign software creating exchange rate risk for hotels
- No local payment gateway integration suited for the Ghanaian market

### Why Ghana

Ghana has **4,613+ licensed tourist accommodation establishments** (Ghana Tourism Authority, 2023), growing year-on-year. The majority are independent properties with no suitable local software. Every competitor is either priced in USD, built overseas with no local support, or is a basic desktop tool with no OTA sync or direct booking capability. The market gap is real and unoccupied.

--

## 2 Product Vision  Goals

### Vision

To be the go-to hotel operating system for independent properties in Ghana — a platform so easy to use that a front-desk receptionist needs zero training, and so reliable that a hotel owner can check live occupancy from their phone at midnight.

### Design Principle

**Simplicity over features.** Every screen has one clear primary action. If a staff member has to think for more than 3 seconds about what to do next, the UI has failed. The MVP is deliberately narrow in scope so that what ships is polished, fast, and easy — not a bloated product that overwhelms new users.

### Goals


| Goal                            | Target                                                |
| ------------------------------- | ----------------------------------------------------- |
| Eliminate double bookings       | Zero OTA/direct conflicts after Beds24 sync is active |
| Front-desk check-in time        | Under 60 seconds per guest via dashboard              |
| New hotel onboarding            | Under 30 minutes from signup to live booking page     |
| Staff adoption without training | 90%+ of daily workflows completable on first use      |
| Guest booking completion        | Under 3 minutes on mobile on a 4G connection          |


--

## 3 Business Model

### SaaS Subscription Tiers (Priced in GHC)


| Plan             | Price/Month | Rooms     | Staff     | OTA Sync | Key Features                                           |
| ---------------- | ----------- | --------- | --------- | -------- | ------------------------------------------------------ |
| **Starter**      | GHC 400     | Up to 15  | 3         | ❌        | Booking engine, admin dashboard, Paystack, Arkesel     |
| **Growth**       | GHC 750     | Up to 40  | 10        | ✅ Beds24 | Everything in Starter + OTA sync, reports, guest CRM   |
| **Professional** | GHC 1,400   | Unlimited | Unlimited | ✅ Beds24 | Everything in Growth + custom domain, priority support |


### One-Time Website Build Fee

Hotels without a website pay a one-time fee of **GHC 3000–4,000** for a custom marketing site. The site has no booking logic — every "Book Now" CTA simply links to `\\\[slug].hotelosprp.com`. This keeps the custom site simple and all booking logic centralised in HotelOS Pro.

### Beds24 Cost Structure

Beds24 costs €16–20/month base + €3/month per additional hotel property. This cost is absorbed into Growth/Professional plan margins. Hotels never pay for or interact with Beds24 directly. The one-time Booking.com room mapping is done by HotelOS Pro staff during onboarding (10 minutes per hotel).

--

## 4 System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│       HOTELOSPRP PLATFORM — single Next.js 16+ app, one deployment      │
│                                                                         │
│   platform.hotelosprp.com    →  (platform)  Internal Platform Admin     │
│   app.hotelosprp.com         →  (admin)     Hotel Staff Dashboard       │
│   [slug].hotelosprp.com /                                               │
│   book.theirhotel.com        →  (booking)   Guest Booking App           │
│                                                                         │
│   All resolved by middleware.ts — reads `host`, rewrites to route group │
│                                                                         │
│                          │                                              │
│        ┌─────────────────┼──────────────────┐                           │
│        │                 │                  │                           │
│   Clerk Auth        Supabase DB       Supabase Storage                  │
│   (RBAC +           (PostgreSQL       (Room images,                     │
│   Organizations)    + Realtime)        hotel assets)                    │
│                          │                                              │
│               ┌──────────┴──────────┐                                   │
│               │                     │                                   │
│       Paystack Master Account   Beds24 API                              │
│       + Hotel Subaccounts       (OTA Sync)                              │
│               │                     │                                   │
│            Arkesel            Booking.com                               │
│         (Email + SMS)         (via Beds24)                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow — New Direct Booking

```
Guest visits \\\[slug].hotelosprp.com
→ Middleware reads slug, resolves hotel\\\_id from DB
→ Hotel config + rooms fetched (hotel\\\_id scoped)
→ Guest selects dates + room type
→ POST /api/bookings/create
  → Availability conflict check (indexed query)
  → Booking inserted to Supabase
  → If Pay Now: Paystack initialized with hotel subaccount\\\_code
  → On payment success: booking status = confirmed
  → Beds24 outbound availability push (Growth/Pro plans)
  → Arkesel email + SMS confirmation to guest
  → Supabase Realtime notification event fires
→ Toast + chime in hotel admin dashboard
```

### Data Flow — Inbound OTA Booking

```
Guest books on Booking.com
→ Beds24 receives and forwards via webhook
→ POST /api/webhooks/beds24
  → Authenticate (secret token)
  → Lookup hotel\\\_id via beds24\\\_property\\\_mappings
  → Conflict check against confirmed direct bookings
  → No conflict: insert booking (source = 'bookings\\\_com')
  → Conflict: log to beds24\\\_sync\\\_log + urgent alert to Super Admin
→ Realtime notification to hotel staff dashboard
```

--

## 5 Multi-Tenancy Architecture

### Model: Shared Database, Row-Level Isolation

All hotels share one Supabase PostgreSQL instance. Every hotel-scoped table has a `hotel\\\_id` foreign key. Supabase Row Level Security (RLS) policies enforce that all queries are scoped to the authenticated user's hotel at the database layer — not just the application layer.

### Isolation Layers


| Layer          | Mechanism                                                            |
| -------------- | -------------------------------------------------------------------- |
| Database rows  | `hotel\\\_id` FK on every table + Supabase RLS policies              |
| Authentication | Clerk Organizations (one per hotel)                                  |
| JWT session    | Custom claims: `hotel\\\_id`, `role`, `is\\\_active`                 |
| File storage   | Supabase Storage paths: `hotels/{hotel\\\_id}/...` + Storage RLS     |
| Realtime       | Channels scoped to `hotel:{hotel\\\_id}`                             |
| Payments       | Paystack Subaccount per hotel (`subaccount\\\_code` in hotels table) |
| OTA sync       | Beds24 property ID → `hotel\\\_id` mapping table                     |


### New Hotel Provisioning Flow

```
1. Hotel owner registers at app.hotelosprp.com/register
2. hotels record inserted: status = 'pending'
3. Clerk Organization created via Clerk Backend API
4. HotelOS Platform Admin approves signup
5. hotels.status = 'active', unique slug assigned (e.g. 'golden-palm')
6. Booking page immediately live at golden-palm.hotelosprp.com
7. Paystack Subaccount created via API using hotel's bank details
8. HotelOS staff performs Beds24 + Booking.com mapping (Growth/Pro, \\\~10 mins)
9. Hotel staff add room types, upload images, and go live
```

--

## 6 Technology Stack


| Layer             | Technology                                          | Purpose                                               |
| ----------------- | --------------------------------------------------- | ----------------------------------------------------- |
| Framework         | **Next.js 16+** (App Router)                        | Full-stack, SSR, API routes, middleware               |
| Database          | **Supabase** (PostgreSQL + Realtime)                | Data store, RLS, live subscriptions                   |
| Auth              | **Clerk**                                           | Auth, Clerk Organizations, RBAC, JWT claims           |
| UI Components     | **Shadcn UI + Tailwind CSS**                        | Fully customisable, accessible components             |
| Data Tables       | **Shadcn UI DataTable**                             | All admin tables (built on TanStack Table internally) |
| Charts            | **Shadcn UI Charts**                                | All dashboard charts (built on Recharts internally)   |
| Date Picker       | **Shadcn UI Calendar**                              | Guest booking calendar + all admin date pickers       |
| Payments          | **Paystack** (v2 API + Subaccounts)                 | Card, bank transfer, USSD, mobile money               |
| OTA Sync          | **Beds24** (API v2)                                 | Channel manager bridging Booking.com                  |
| Email + SMS       | **Arkesel**                                         | Transactional guest notifications                     |
| File Storage      | **Supabase Storage**                                | Room images, hotel logos                              |
| Timeline Calendar | **DayPilot Lite** (`@daypilot/daypilot-lite-react`) | Resource timeline for hotel room scheduling           |
| Forms             | **React Hook Form + Zod**                           | Form state + schema validation                        |
| PWA               | **@ducanh2912/next-pwa**                            | Service worker, offline support                       |
| Toasts            | **Sonner**                                          | Real-time notification toasts                         |
| Package Manager   | **pnpm**                                            | Fast installs, efficient disk usage, single project   |
| Deployment        | **Render.com**                                      | Hosting, wildcard subdomain, CI/CD                    |


### Why DayPilot Lite for the Timeline Calendar

DayPilot Lite is the **industry-standard open-source scheduling component** for resource timeline applications. It is used in hotel, hospital, salon, and facility booking systems worldwide. Its horizontal Scheduler component maps directly to the hotel room timeline use case:

```
DayPilot concept  →  Hotel concept
resources         →  rooms (Y-axis, grouped by room type)
events            →  bookings (horizontal blocks)
start             →  check\\\_in date
end               →  check\\\_out date
```

**Why DayPilot Lite over all alternatives:**


| Library                      | Verdict                                                                                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DayPilot Lite**            | ✅ Apache 2.0 (free, commercial use) · Horizontal Scheduler built-in · React package · Fully CSS-customisable · Drag-and-drop in free tier · Next.js support confirmed · Actively maintained (2025 releases) |
| Planby                       | ❌ Core MIT but advanced features (drag-drop) require paid PRO license                                                                                                                                       |
| FullCalendar (resource view) | ❌ Resource timeline requires $1,099/year Premium license                                                                                                                                                    |
| react-big-calendar           | ❌ No native horizontal resource timeline; needs heavy patching                                                                                                                                              |
| GSTC                         | ❌ Requires commercial license key for production use                                                                                                                                                        |
| react-big-schedule           | ❌ Unmaintained fork; last meaningful update 2022                                                                                                                                                            |


**Key DayPilot Lite capabilities included in the free Apache 2.0 tier:**

- Horizontal Scheduler with multi-day event blocks
- Drag-and-drop event moving and resizing
- Custom event content via JSX/HTML
- CSS themes — full visual customisation with Tailwind
- Next.js support (confirmed in docs)
- Context menus on events and cells
- Click-to-create on empty cells
- Snap-to-grid
- Localization

**npm package:** `@daypilot/daypilot-lite-react`

### Shadcn UI — Component Choices Explained


| Need                        | Choice           | Rationale                                                                            |
| --------------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| Data tables                 | Shadcn DataTable | Ships with TanStack Table v8 internally; fully styled within the design system       |
| Charts                      | Shadcn Charts    | Ships with Recharts internally; fully themed with CSS variables; no separate library |
| Date picker (guest + admin) | Shadcn Calendar  | Ships with react-day-picker internally; consistent with design system                |


Using Shadcn for all three keeps the entire UI in one design system. No external styling conflicts, no separate theming layers, no extra bundle weight from duplicate dependencies.

--

## 7. Repository & Project Structure

Single Next.js 16+ App Router project — one codebase, one deployment. All three domains (`platform.hotelosprp.com`, `app.hotelosprp.com`, `[slug].hotelosprp.com`, and any custom domains like `book.theirhotel.com`) are served by this one app. `middleware.ts` reads the incoming request's `host` header and rewrites into the matching route group.

```
hotelosprp/
├── middleware.ts                  ← host-based routing (domain → route group, slug → hotel_id)
│
├── app/
│   ├── (platform)/                ← platform.hotelosprp.com — HotelOS internal admin
│   │   ├── (auth)/
│   │   ├── dashboard/
│   │   ├── hotels/
│   │   └── settings/
│   │
│   ├── (admin)/                   ← app.hotelosprp.com — Hotel staff dashboard
│   │   ├── (auth)/
│   │   │   ├── sign-in/
│   │   │   ├── sign-up/
│   │   │   └── pending/
│   │   └── (dashboard)/
│   │       ├── overview/
│   │       ├── bookings/
│   │       │   ├── page.tsx
│   │       │   ├── new/
│   │       │   ├── calendar/
│   │       │   └── [id]/
│   │       ├── rooms/
│   │       │   ├── types/
│   │       │   ├── types/[id]/
│   │       │   └── directory/
│   │       ├── guests/
│   │       │   ├── page.tsx
│   │       │   └── [id]/
│   │       ├── payments/
│   │       │   ├── transactions/
│   │       │   └── outstanding/
│   │       ├── staff/
│   │       │   ├── page.tsx
│   │       │   └── pending/
│   │       ├── reports/
│   │       └── settings/
│   │           ├── hotel/
│   │           ├── billing/
│   │           ├── notifications/
│   │           └── integrations/
│   │
│   ├── (booking)/                 ← [slug].hotelosprp.com / custom domains — Guest booking
│   │   ├── page.tsx
│   │   ├── rooms/
│   │   ├── book/
│   │   │   ├── page.tsx
│   │   │   ├── details/
│   │   │   ├── payment/
│   │   │   └── confirmation/
│   │   └── api/
│   │       ├── availability/
│   │       ├── bookings/
│   │       └── payments/
│   │
│   └── api/
│       └── webhooks/
│           └── beds24/            ← inbound OTA webhook, not tied to a route group
│
├── components/                    ← Shared Shadcn UI components, used across all areas
├── lib/
│   ├── supabase/                  ← Supabase client + generated DB types + shared queries
│   ├── clerk/                     ← Clerk helpers, RBAC + session claim utilities
│   └── utils/                     ← Shared utilities (dates, formatting, reference gen)
│
├── next.config.js
├── package.json
├── tsconfig.json
└── .env.local
```

--

## 8 Database Schema

### Design Principles

- Every hotel-scoped table has `hotel\\\_id UUID NOT NULL REFERENCES hotels(id)`
- Every **mutable** table has `created\\\_at TIMESTAMPTZ DEFAULT NOW()` and `updated\\\_at TIMESTAMPTZ DEFAULT NOW()`. A `BEFORE UPDATE` trigger (`handle\\\_updated\\\_at`) auto-bumps `updated\\\_at` on every UPDATE.
- Truly event-sourced / fact tables (`audit\\\_logs`, `beds24\\\_sync\\\_log`) are **APPEND-ONLY** — no `updated\\\_at`, and a `BEFORE UPDATE OR DELETE` trigger (`prevent\\\_modification`) actively blocks mutation by any role, including the service role. "Amendments" are made by inserting a compensating row.
- RLS policies enforce isolation at the database layer — the app layer is a second line of defence
- Indexes placed on every column used in availability queries and booking lookups
- `seasonal\\\_pricing` excluded from MVP schema — added in v2

--

### `hotels`

```sql
CREATE TABLE hotels (
  id                      UUID PRIMARY KEY DEFAULT gen\\\_random\\\_uuid(),
  slug                    TEXT UNIQUE NOT NULL,
  name                    TEXT NOT NULL,
  description             TEXT,
  address                 TEXT,
  city                    TEXT,
  country                 TEXT DEFAULT 'Ghana',
  phone                   TEXT,
  email                   TEXT,
  logo\\\_url                TEXT,
  cover\\\_image\\\_url         TEXT,
  timezone                TEXT DEFAULT 'Africa/Accra',
  currency                TEXT DEFAULT 'GHS',
  check\\\_in\\\_time           TIME DEFAULT '14:00',
  check\\\_out\\\_time          TIME DEFAULT '11:00',
  cancellation\\\_policy     TEXT,
  custom\\\_domain           TEXT UNIQUE,
  clerk\\\_org\\\_id            TEXT UNIQUE NOT NULL,

  -- Paystack Subaccount fields
  paystack\\\_subaccount\\\_code  TEXT UNIQUE,   -- e.g. 'ACCT\\\_xxxxxxxxxx'
  paystack\\\_business\\\_name    TEXT,
  paystack\\\_bank\\\_code        TEXT,          -- Paystack bank code (e.g. '030')
  paystack\\\_account\\\_number   TEXT,          -- Hotel's bank account number
  paystack\\\_settlement\\\_schedule TEXT DEFAULT 'auto',

  -- Beds24 integration
  beds24\\\_property\\\_id      TEXT,
  beds24\\\_api\\\_key          TEXT,            -- Encrypted at app layer

  -- Arkesel integration
  arkesel\\\_api\\\_key         TEXT,            -- Encrypted at app layer
  arkesel\\\_sender\\\_name     TEXT,

  -- SaaS plan
  plan                    TEXT DEFAULT 'starter'
                          CHECK (plan IN ('starter', 'growth', 'professional')),
  status                  TEXT DEFAULT 'pending'
                          CHECK (status IN ('pending', 'active', 'suspended', 'cancelled')),
  settings                JSONB DEFAULT '{}',
  created\\\_at              TIMESTAMPTZ DEFAULT NOW(),
  updated\\\_at              TIMESTAMPTZ DEFAULT NOW()
);
```

--

### `room\\\_types`

```sql
CREATE TABLE room\\\_types (
  id                UUID PRIMARY KEY DEFAULT gen\\\_random\\\_uuid(),
  hotel\\\_id          UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL,
  short\\\_description TEXT,
  description       TEXT,
  bed\\\_configuration TEXT,
  max\\\_adults        INT DEFAULT 2,
  max\\\_children      INT DEFAULT 0,
  base\\\_price        NUMERIC(10,2) NOT NULL,
  weekend\\\_price     NUMERIC(10,2),
  amenities         JSONB DEFAULT '\\\[]',   -- \\\[{icon, label}, ...]
  images            JSONB DEFAULT '\\\[]',   -- \\\[{url, caption, order}, ...]
  is\\\_active         BOOLEAN DEFAULT TRUE,
  sort\\\_order        INT DEFAULT 0,
  created\\\_at        TIMESTAMPTZ DEFAULT NOW(),
  updated\\\_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel\\\_id, slug)
);

CREATE INDEX idx\\\_room\\\_types\\\_hotel ON room\\\_types(hotel\\\_id);
```

--

### `rooms`

```sql
CREATE TABLE rooms (
  id            UUID PRIMARY KEY DEFAULT gen\\\_random\\\_uuid(),
  hotel\\\_id      UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room\\\_type\\\_id  UUID NOT NULL REFERENCES room\\\_types(id) ON DELETE RESTRICT,
  room\\\_number   TEXT NOT NULL,
  floor         TEXT,
  notes         TEXT,
  status        TEXT DEFAULT 'available'
                CHECK (status IN (
                  'available', 'occupied', 'checkout\\\_pending',
                  'maintenance', 'out\\\_of\\\_service', 'cleaning'
                )),
  is\\\_active     BOOLEAN DEFAULT TRUE,
  created\\\_at    TIMESTAMPTZ DEFAULT NOW(),
  updated\\\_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel\\\_id, room\\\_number)
);

CREATE INDEX idx\\\_rooms\\\_hotel ON rooms(hotel\\\_id);
CREATE INDEX idx\\\_rooms\\\_type ON rooms(room\\\_type\\\_id);
```

--

### `guests`

```sql
CREATE TABLE guests (
  id              UUID PRIMARY KEY DEFAULT gen\\\_random\\\_uuid(),
  hotel\\\_id        UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  full\\\_name       TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  national\\\_id     TEXT,
  nationality     TEXT,
  notes           TEXT,
  tags            JSONB DEFAULT '\\\[]',   -- \\\['vip', 'regular', 'flagged']
  total\\\_stays     INT DEFAULT 0,
  total\\\_spend     NUMERIC(12,2) DEFAULT 0,
  last\\\_stay\\\_date  DATE,
  created\\\_at      TIMESTAMPTZ DEFAULT NOW(),
  updated\\\_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx\\\_guests\\\_hotel ON guests(hotel\\\_id);
CREATE INDEX idx\\\_guests\\\_email ON guests(hotel\\\_id, email);
CREATE INDEX idx\\\_guests\\\_phone ON guests(hotel\\\_id, phone);
```

--

### `bookings`

```sql
CREATE TABLE bookings (
  id                  UUID PRIMARY KEY DEFAULT gen\\\_random\\\_uuid(),
  hotel\\\_id            UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  reference           TEXT UNIQUE NOT NULL,        -- HOP-YYYY-NNNNN
  guest\\\_id            UUID REFERENCES guests(id) ON DELETE SET NULL,
  room\\\_id             UUID REFERENCES rooms(id) ON DELETE SET NULL,
  room\\\_type\\\_id        UUID REFERENCES room\\\_types(id) ON DELETE SET NULL,
  check\\\_in            DATE NOT NULL,
  check\\\_out           DATE NOT NULL,
  nights              INT GENERATED ALWAYS AS (check\\\_out::DATE - check\\\_in::DATE) STORED,
  adults              INT DEFAULT 1,
  children            INT DEFAULT 0,
  room\\\_rate           NUMERIC(10,2) NOT NULL,
  subtotal            NUMERIC(10,2) NOT NULL,
  tax\\\_amount          NUMERIC(10,2) DEFAULT 0,
  total\\\_amount        NUMERIC(10,2) NOT NULL,
  amount\\\_paid         NUMERIC(10,2) DEFAULT 0,
  outstanding\\\_balance NUMERIC(10,2)
    GENERATED ALWAYS AS (total\\\_amount - amount\\\_paid) STORED,
  currency            TEXT DEFAULT 'GHS',
  status              TEXT DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'confirmed', 'checked\\\_in',
      'checked\\\_out', 'cancelled', 'no\\\_show'
    )),
  payment\\\_status      TEXT DEFAULT 'unpaid'
    CHECK (payment\\\_status IN ('unpaid', 'partial', 'paid', 'refunded')),
  payment\\\_preference  TEXT DEFAULT 'pay\\\_at\\\_checkin'
    CHECK (payment\\\_preference IN ('pay\\\_now', 'pay\\\_at\\\_checkin')),
  source              TEXT DEFAULT 'direct'
    CHECK (source IN ('direct', 'bookings\\\_com', 'manual', 'phone', 'walk\\\_in')),
  special\\\_requests    TEXT,
  estimated\\\_arrival   TIME,
  internal\\\_notes      TEXT,
  check\\\_in\\\_at         TIMESTAMPTZ,
  check\\\_out\\\_at        TIMESTAMPTZ,
  cancelled\\\_at        TIMESTAMPTZ,
  cancellation\\\_reason TEXT,
  beds24\\\_booking\\\_id   TEXT,
  created\\\_by          UUID REFERENCES staff\\\_profiles(id),
  created\\\_at          TIMESTAMPTZ DEFAULT NOW(),
  updated\\\_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx\\\_bookings\\\_hotel ON bookings(hotel\\\_id);
CREATE INDEX idx\\\_bookings\\\_room ON bookings(room\\\_id);
CREATE INDEX idx\\\_bookings\\\_checkin ON bookings(hotel\\\_id, check\\\_in);
CREATE INDEX idx\\\_bookings\\\_checkout ON bookings(hotel\\\_id, check\\\_out);
CREATE INDEX idx\\\_bookings\\\_status ON bookings(hotel\\\_id, status);
CREATE INDEX idx\\\_bookings\\\_guest ON bookings(guest\\\_id);
CREATE INDEX idx\\\_bookings\\\_ref ON bookings(reference);
```

--

### `payments`

```sql
CREATE TABLE payments (
  id                    UUID PRIMARY KEY DEFAULT gen\\\_random\\\_uuid(),
  hotel\\\_id              UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  booking\\\_id            UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount                NUMERIC(10,2) NOT NULL,
  currency              TEXT DEFAULT 'GHS',
  method                TEXT CHECK (method IN (
                          'card', 'bank\\\_transfer', 'ussd', 'mobile\\\_money',
                          'cash', 'pos', 'paystack\\\_link', 'refund'
                        )),
  paystack\\\_reference    TEXT UNIQUE,
  paystack\\\_id           TEXT,
  paystack\\\_subaccount   TEXT,              -- Subaccount code used for this txn
  platform\\\_fee          NUMERIC(10,2),     -- HotelOS Pro cut (post-MVP)
  status                TEXT DEFAULT 'pending'
                        CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
  paid\\\_at               TIMESTAMPTZ,
  recorded\\\_by           UUID REFERENCES staff\\\_profiles(id),
  notes                 TEXT,
  metadata              JSONB DEFAULT '{}',
  created\\\_at            TIMESTAMPTZ DEFAULT NOW(),
  updated\\\_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx\\\_payments\\\_booking ON payments(booking\\\_id);
CREATE INDEX idx\\\_payments\\\_hotel ON payments(hotel\\\_id);
CREATE INDEX idx\\\_payments\\\_ref ON payments(paystack\\\_reference);
```

--

### `staff\\\_profiles`

```sql
CREATE TABLE staff\\\_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen\\\_random\\\_uuid(),
  hotel\\\_id            UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  clerk\\\_user\\\_id       TEXT UNIQUE NOT NULL,
  email               TEXT NOT NULL,
  full\\\_name           TEXT,
  avatar\\\_url          TEXT,
  role                TEXT DEFAULT 'pending'
                      CHECK (role IN (
                        'pending', 'super\\\_admin', 'manager',
                        'front\\\_desk', 'read\\\_only'
                      )),
  is\\\_active           BOOLEAN DEFAULT FALSE,
  granted\\\_at          TIMESTAMPTZ,
  granted\\\_by          UUID REFERENCES staff\\\_profiles(id),
  last\\\_login\\\_at       TIMESTAMPTZ,
  notification\\\_prefs  JSONB DEFAULT '{
                        "new\\\_booking": true,
                        "payment\\\_received": true,
                        "cancellation": true,
                        "ota\\\_conflict": true
                      }',
  created\\\_at          TIMESTAMPTZ DEFAULT NOW(),
  updated\\\_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx\\\_staff\\\_hotel ON staff\\\_profiles(hotel\\\_id);
CREATE INDEX idx\\\_staff\\\_clerk ON staff\\\_profiles(clerk\\\_user\\\_id);
```

--

### `availability\\\_blocks`

```sql
CREATE TABLE availability\\\_blocks (
  id          UUID PRIMARY KEY DEFAULT gen\\\_random\\\_uuid(),
  hotel\\\_id    UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room\\\_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  start\\\_date  DATE NOT NULL,
  end\\\_date    DATE NOT NULL,
  reason      TEXT CHECK (reason IN (
                'maintenance', 'deep\\\_cleaning',
                'owner\\\_use', 'renovation', 'other'
              )),
  notes       TEXT,
  created\\\_by  UUID REFERENCES staff\\\_profiles(id),
  created\\\_at  TIMESTAMPTZ DEFAULT NOW(),
  updated\\\_at  TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end\\\_date > start\\\_date)
);

CREATE INDEX idx\\\_blocks\\\_room ON availability\\\_blocks(room\\\_id);
CREATE INDEX idx\\\_blocks\\\_dates ON availability\\\_blocks(hotel\\\_id, start\\\_date, end\\\_date);
```

--

### `notifications`

```sql
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen\\\_random\\\_uuid(),
  hotel\\\_id    UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  type        TEXT CHECK (type IN (
                'new\\\_booking', 'booking\\\_cancelled', 'payment\\\_received',
                'payment\\\_failed', 'ota\\\_conflict', 'staff\\\_access\\\_request',
                'check\\\_in\\\_reminder', 'check\\\_out\\\_reminder'
              )),
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  booking\\\_id  UUID REFERENCES bookings(id) ON DELETE SET NULL,
  is\\\_read     BOOLEAN DEFAULT FALSE,
  read\\\_at     TIMESTAMPTZ,
  created\\\_at  TIMESTAMPTZ DEFAULT NOW(),
  updated\\\_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx\\\_notifications\\\_hotel ON notifications(hotel\\\_id, created\\\_at DESC);
CREATE INDEX idx\\\_notifications\\\_unread ON notifications(hotel\\\_id, is\\\_read)
  WHERE is\\\_read = FALSE;
```

--

### `beds24\\\_property\\\_mappings`

```sql
CREATE TABLE beds24\\\\\\_property\\\\\\_mappings (
  id                  UUID PRIMARY KEY DEFAULT gen\\\\\\_random\\\\\\_uuid(),
  hotel\\\\\\_id            UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  beds24\\\\\\_property\\\\\\_id  TEXT NOT NULL,
  beds24\\\\\\_room\\\\\\_id      TEXT NOT NULL,
  room\\\\\\_type\\\\\\_id        UUID NOT NULL REFERENCES room\\\\\\_types(id),
  created\\\\\\_at          TIMESTAMPTZ DEFAULT NOW(),
  updated\\\\\\_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel\\\\\\_id, beds24\\\\\\_room\\\\\\_id)
);
```

--

### `beds24\\\_sync\\\_log`

> **APPEND-ONLY.** Each row is an immutable record of one Beds24 sync
> event. The same `BEFORE UPDATE OR DELETE` trigger pattern as
> `audit_logs` blocks mutations at the database level.

```sql
CREATE TABLE beds24\\\_sync\\\_log (
  id                  UUID PRIMARY KEY DEFAULT gen\\\_random\\\_uuid(),
  hotel\\\_id            UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  direction           TEXT CHECK (direction IN ('inbound', 'outbound')),
  event\\\_type          TEXT,
  beds24\\\_booking\\\_id   TEXT,
  booking\\\_id          UUID REFERENCES bookings(id),
  payload             JSONB,
  status              TEXT CHECK (status IN ('success', 'conflict', 'error', 'ignored')),
  conflict\\\_details    TEXT,
  error\\\_message       TEXT,
  processed\\\_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx\\\_beds24\\\_log\\\_hotel ON beds24\\\_sync\\\_log(hotel\\\_id);
```

--

### `audit\\\_logs`

> **APPEND-ONLY.** Rows are immutable facts about staff actions. A
> `BEFORE UPDATE OR DELETE` trigger (`prevent_modification`) blocks all
> mutations, including from the service role. "Amendments" are made by
> inserting a compensating row (e.g. with `action = 'X.reverted'`).

```sql
CREATE TABLE audit\\\_logs (
  id            UUID PRIMARY KEY DEFAULT gen\\\_random\\\_uuid(),
  hotel\\\_id      UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  staff\\\_id      UUID REFERENCES staff\\\_profiles(id) ON DELETE SET NULL,
  staff\\\_name    TEXT,
  action        TEXT NOT NULL,
  entity\\\_type   TEXT,
  entity\\\_id     UUID,
  before\\\_state  JSONB,
  after\\\_state   JSONB,
  created\\\_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx\\\_audit\\\_hotel ON audit\\\_logs(hotel\\\_id, created\\\_at DESC);
```

--

### `platform\\\_admins`

```sql
CREATE TABLE platform\\\_admins (
  id            UUID PRIMARY KEY DEFAULT gen\\\_random\\\_uuid(),
  clerk\\\_user\\\_id TEXT UNIQUE NOT NULL,
  email         TEXT NOT NULL,
  full\\\_name     TEXT,
  role          TEXT DEFAULT 'admin'
                CHECK (role IN ('super\\\_admin', 'admin', 'support')),
  is\\\_active     BOOLEAN DEFAULT TRUE,
  created\\\_at    TIMESTAMPTZ DEFAULT NOW(),
  updated\\\_at    TIMESTAMPTZ DEFAULT NOW()
);
```

--

### Append-only Tables

`audit\_logs` and `beds24\_sync\_log` are immutable event-sourced tables.
A row is a record of something that happened, not mutable state.
Mutations are blocked at the database layer — even the service role cannot
UPDATE or DELETE a row. The pattern (used by Stripe, GitHub, AWS
CloudTrail) is a `BEFORE UPDATE OR DELETE` trigger that raises an
exception, plus no `updated\_at` column so callers cannot silently
rewrite history.

```sql
CREATE OR REPLACE FUNCTION public.prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Table % is append-only. Create a compensating row instead of modifying %',
    TG_TABLE_NAME, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_modify
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_modification();

CREATE TRIGGER beds24_sync_log_no_modify
  BEFORE UPDATE OR DELETE ON public.beds24_sync_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_modification();
```

"Amendments" to an append-only row are made by inserting a new row that
references the original (e.g. a `reverted` audit entry, or a separate
`payments` row with `method = 'refund'`).

---

### Row Level Security Pattern

```sql
-- Applied identically to every hotel-scoped table
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff\\\_hotel\\\_isolation" ON bookings
  FOR ALL USING (
    hotel\\\_id = (
      SELECT hotel\\\_id FROM staff\\\_profiles
      WHERE clerk\\\_user\\\_id = auth.jwt() ->> 'sub'
      AND is\\\_active = TRUE
    )
  );

CREATE POLICY "guest\\\_booking\\\_insert" ON bookings
  FOR INSERT WITH CHECK (
    hotel\\\_id = (
      SELECT id FROM hotels
      WHERE slug = current\\\_setting('app.current\\\_hotel\\\_slug')
    )
  );
```

--

## 9 Authentication  Role-Based Access Control

### 9.1 Auth Provider: Clerk

Clerk handles all authentication for the Platform Admin and Hotel Admin Dashboard. The Guest Booking App has no authentication — guests book anonymously.

- **Organizations:** One per hotel. All hotel staff belong to their hotel's Clerk Org.
- **Custom Session Claims:** `hotel\\\_id`, `role`, `is\\\_active` embedded in JWT — available server-side on every request without an extra DB query.
- **Middleware:** `auth().protect()` applied to all `/admin/\\\`* and `/platform/\\\`* routes.

### 9.2 Staff Onboarding — Gated Approval Flow

```
1. Staff visits app.hotelosprp.com/sign-up
2. Registers with work email → Clerk creates user
3. staff\\\_profiles inserted: role = 'pending', is\\\_active = FALSE
4. Staff lands on pending screen:
   "Your account is pending approval by your manager."
5. Super Admin receives notification: "New access request from \\\[name]"
6. Super Admin → Staff → Pending Requests → Assigns role → Approves
7. staff\\\_profiles: role = assigned, is\\\_active = TRUE, granted\\\_at = NOW()
8. Clerk Organization membership updated via Clerk Backend API
9. Arkesel SMS to staff: "Your HotelOS access has been approved."
10. Staff can log in and access their permitted features
```

### 9.3 Role Permissions Matrix


| Feature                         | Super Admin | Manager | Front Desk | Read-Only |
| ------------------------------- | ----------- | ------- | ---------- | --------- |
| View all bookings               | ✅           | ✅       | ✅          | ✅         |
| Create manual bookings          | ✅           | ✅       | ✅          | ❌         |
| Edit / cancel bookings          | ✅           | ✅       | ✅          | ❌         |
| Check-in / check-out guests     | ✅           | ✅       | ✅          | ❌         |
| View timeline calendar          | ✅           | ✅       | ✅          | ✅         |
| Manage room types + pricing     | ✅           | ✅       | ❌          | ❌         |
| Upload room images              | ✅           | ✅       | ❌          | ❌         |
| View guest directory            | ✅           | ✅       | ✅          | ✅         |
| Edit guest profiles             | ✅           | ✅       | ✅          | ❌         |
| View + record payments          | ✅           | ✅       | ✅          | ❌         |
| Issue refunds                   | ✅           | ✅       | ❌          | ❌         |
| View reports                    | ✅           | ✅       | ❌          | ❌         |
| Manage staff + roles            | ✅           | ❌       | ❌          | ❌         |
| Toggle staff active/inactive    | ✅           | ❌       | ❌          | ❌         |
| Hotel settings                  | ✅           | ❌       | ❌          | ❌         |
| Billing / bank account settings | ✅           | ❌       | ❌          | ❌         |
| Create availability blocks      | ✅           | ✅       | ❌          | ❌         |
| Own notification preferences    | ✅           | ✅       | ✅          | ✅         |


### 9.4 Super Admin Controls

- **Deactivate:** `is\\\_active = FALSE` + Clerk session revocation (instant sign-out) + `audit\\\_logs` entry
- **Reactivate:** `is\\\_active = TRUE`
- **Change role:** Updates DB + Clerk Org role
- **Remove:** Soft delete + Clerk Org removal

--

## 10 Platform Admin

**URL:** `platform.hotelosprp.com` — HotelOS Pro internal team only.

### Pages

**Overview Dashboard**

- Total active hotels, total bookings (last 30 days), MRR
- Hotels by plan (Starter / Growth / Professional) chart
- Pending hotel signups awaiting approval

**Hotels List**

- Table: name, slug, plan, status, created date, total bookings
- Approve pending signups
- Suspend / reactivate hotels
- Change hotel plan

**Support Tools**

- Read-only view of any hotel's bookings and rooms
- Trigger manual Beds24 sync per hotel
- View beds24synclog for debugging

--

## 11 Hotel Admin Dashboard — All Pages

### Complete Page Directory

```
app.hotelosprp.com/
├── sign-in                          AUTH: Sign In page
├── sign-up                          AUTH: Register new staff account
├── pending                          AUTH: Pending approval holding screen
│
├── overview                         DASHBOARD: Main overview / home
│
├── bookings                         BOOKINGS: All bookings list
├── bookings/new                     BOOKINGS: Create manual booking
├── bookings/calendar                BOOKINGS: DayPilot Lite timeline calendar
├── bookings/\\\[id]                    BOOKINGS: Individual booking detail
│
├── rooms/types                      ROOMS: Room types list
├── rooms/types/new                  ROOMS: Create new room type
├── rooms/types/\\\[id]                 ROOMS: Edit room type + manage images
├── rooms/directory                  ROOMS: All physical rooms list + status
│
├── guests                           GUESTS: Guest directory / search
├── guests/\\\[id]                      GUESTS: Individual guest profile
│
├── payments/transactions            PAYMENTS: All payment transactions
├── payments/outstanding             PAYMENTS: Unpaid / pay-at-check-in balances
│
├── staff                            STAFF: Team members list + role management
├── staff/pending                    STAFF: Pending access requests
│
├── reports                          REPORTS: Occupancy, Revenue, Booking Sources
│
├── settings/hotel                   SETTINGS: Hotel profile, logo, cover image
├── settings/billing                 SETTINGS: Paystack bank account / subaccount
├── settings/notifications           SETTINGS: Per-staff notification preferences
└── settings/integrations            SETTINGS: Beds24 + Arkesel config + sync status
```

### Page Descriptions

--

#### `/sign-in`

Clerk-hosted sign-in form embedded via `<SignIn />` component. Redirects to `/overview` on success. Redirects to `/pending` if `is\\\_active = FALSE`.

--

#### `/sign-up`

Clerk-hosted sign-up form embedded via `<SignUp />` component. On completion creates `staff\\\_profiles` record with `role = 'pending'` and `is\\\_active = FALSE`. Redirects to `/pending`.

--

#### `/pending`

Full-screen holding page. Clean, calm design:

- Hotel logo
- Message: *"Your account is waiting for approval. Your manager will be notified and will grant you access shortly."*
- Staff name and email displayed
- Sign-out link
- Auto-redirects to `/overview` once `is\\\_active` becomes `TRUE` (Supabase Realtime polling)

--

#### `/overview`

Main dashboard home. **Primary purpose: give staff an instant understanding of today's hotel status.**

**Layout (top-to-bottom):**

- 4 KPI cards (Shadcn Card): Today's Arrivals, Today's Departures, Current Occupancy %, Available Rooms Tonight
- 2 Revenue cards: Revenue Today, Month-to-Date Revenue
- Outstanding Balances card (total unpaid amount + count)
- 30-Day Occupancy Rate line chart (Shadcn Chart)
- Booking Sources pie chart (Shadcn Chart) — Direct / Bookings.com / Manual / Walk-in
- Recent Bookings live feed (last 10, real-time via Supabase Realtime) — guest name, room type, dates, status badge, payment badge
- Today's Arrivals list — name, room, ETA, check-in status badge
- Today's Departures list — name, room, check-out status badge

--

#### `/bookings`

**Primary purpose: find and manage any booking quickly.**

- Shadcn DataTable — sortable, paginated, 50 rows per page
- **Columns:** Reference | Guest | Room Type | Check-In | Check-Out | Nights | Status | Payment | Source | Total | Actions
- **Filters bar:** Status dropdown, Date Range picker (Shadcn Calendar), Room Type multi-select, Payment Status, Source
- **Search input:** Searches guest name, email, phone, and reference simultaneously
- **Row actions (Shadcn DropdownMenu):** View, Check In, Check Out, Cancel
- **Bulk actions:** Cancel selected, Mark as No-Show
- **Export:** CSV download button (top-right)
- **"New Booking" button** (top-right) → navigates to `/bookings/new`

--

#### `/bookings/new`

**Primary purpose: create a booking for a walk-in, phone, or assisted reservation.**

Single-page form, 5 clear sections with a sticky summary sidebar:

**Section 1 — Find or Create Guest**

- Shadcn Combobox: type name/email/phone to search existing guests
- Results dropdown shows matching guests with email + phone
- If found: select to pre-fill all guest fields
- If not found: "Create new guest" — name, email, phone fields appear inline
- No navigating away to create a guest first

**Section 2 — Room + Dates**

- Room Type dropdown (shows availability dot + from price)
- Check-in / Check-out Shadcn Calendar date range picker
- Adults + Children count inputs
- Real-time conflict validation: if dates unavailable a red inline error shows immediately

**Section 3 — Details**

- Estimated arrival time (optional time select)
- Special requests (textarea)
- Booking source: Walk-in / Phone / Manual

**Section 4 — Payment**

- Payment preference toggle: Pay Now / Pay at Check-In
- If Pay Now: Paystack initialized inline
- If recording cash/POS now: amount + method fields appear

**Section 5 — Summary + Confirm**

- Price breakdown: room rate × nights, total
- "Send confirmation to guest" checkbox (triggers Arkesel on creation)
- "Create Booking" primary button

--

#### `/bookings/calendar`

**Primary purpose: visual overview of all room occupancy across time.**
Full DayPilot Lite Scheduler. Described in full in Section 18.

--

#### `/bookings/\\\[id]`

**Primary purpose: manage everything about a specific booking.**

Shadcn Sheet (right drawer, full-height) with 3 tabs:

**Tab 1 — Overview**

- Booking reference + status badge (colour-coded)
- Guest card: name, email, phone — click opens guest profile
- Room: type + assigned room number with "Reassign" option
- Date range + nights display
- Price breakdown table: rate, nights, subtotal, tax, total, paid, outstanding
- Action buttons:
  - Check In (green, shown if status = confirmed)
  - Check Out (orange, shown if status = checkedin)
  - Cancel (destructive, with AlertDialog confirmation)
  - Send Confirmation (Arkesel)

**Tab 2 — Payments**

- Transaction history table for this booking
- "Record Payment" button → modal: amount, method (cash/POS/bank/other), notes
- "Generate Paystack Link" button → generates link, option to send via Arkesel
- "Refund" button (Manager+ only) → modal with partial/full refund amount

**Tab 3 — Notes**

- Internal staff notes (timestamped entries, append-only)
- Guest's original special requests (read-only, highlighted separately)

--

#### `/rooms/types`

**Primary purpose: see and manage all room categories.**

- Shadcn DataTable: Name | Base Price | Weekend Price | Max Occupancy | Active | Rooms Count | Actions
- Active/inactive Shadcn Switch per row (inline toggle)
- "Add Room Type" button → navigates to `/rooms/types/new`
- Row click or Edit action → navigates to `/rooms/types/\\\[id]`

--

#### `/rooms/types/new` and `/rooms/types/\\\[id]`

**Primary purpose: create or edit a room type and all its details.**

Full-page form with sections:

**Basic Info:** Name, slug (auto-generated from name), short description, full description (rich text), bed configuration, max adults, max children

**Pricing:** Base price per night, weekend price override (optional)

**Amenities:** Multi-select tag editor — click to add/remove from a predefined list of hotel amenities (WiFi, Air Conditioning, TV, Balcony, Ocean View, Jacuzzi, Mini Bar, Safe, Breakfast Included, etc.) Stored as JSONB.

**Images:** Drag-and-drop image upload zone → uploads to Supabase Storage. Images displayed in a grid with drag-to-reorder, delete button, and caption input per image. First image = listing thumbnail. Max 10 images.

**Status:** Active/inactive toggle with explanation: "Inactive room types are hidden from the guest booking page."

--

#### `/rooms/directory`

**Primary purpose: see all physical rooms and their live status.**

- Shadcn DataTable: Room # | Type | Floor | Status (colour badge) | Active | Actions
- "Add Room" button → inline Shadcn Sheet form: room number, type (dropdown), floor, notes
- Status change: Shadcn Select inline per row (available / maintenance / cleaning / outofservice)
- "Block Room" button → Shadcn Sheet form: date range (Shadcn Calendar), reason dropdown, notes → creates `availability\\\_blocks` record
- Colour-coded status badges: Green = available, Blue = occupied, Orange = checkout pending, Slate = maintenance/blocked, Cyan = cleaning

--

#### `/guests`

**Primary purpose: find any guest quickly, especially during check-in.**

- Search-first layout: prominent search bar at the top (searches name, email, phone simultaneously)
- Shadcn DataTable below: Name | Email | Phone | Total Stays | Last Stay | Tags | Actions
- Guest tag filter (VIP / Regular / Flagged) above table
- Row click → `/guests/\\\[id]`
- "Add Guest" button (for manually adding guests not from a booking)

--

#### `/guests/\\\[id]`

**Primary purpose: view a guest's full history and manage their profile.**

- Contact section (inline editable): name, email, phone, national ID, nationality, address
- Tags section: VIP / Regular / Flagged Shadcn Badges with toggle
- Stats cards: Total Stays, Total Spend, First Visit, Last Visit
- Internal Notes: append-only timestamped notes field (click "+ Add note")
- Booking History: DataTable of all past and upcoming bookings for this guest
- Quick actions: "New Booking" → `/bookings/new` pre-filled with this guest

--

#### `/payments/transactions`

**Primary purpose: see all payment activity across all bookings.**

- Shadcn DataTable: Reference | Booking Ref | Guest | Amount | Method | Status | Date | Actions
- Filters: method, status, date range
- Search: booking reference, guest name, Paystack reference
- Row "View" → opens the linked booking detail drawer

--

#### `/payments/outstanding`

**Primary purpose: see which confirmed bookings still have unpaid balances.**

- Shadcn DataTable: Booking Ref | Guest | Room | Check-In | Check-Out | Total | Paid | Outstanding | Actions
- Sorted by check-in date (soonest arrivals first — most urgent)
- Actions per row: Record Payment, Generate Paystack Link, View Booking
- Total outstanding amount shown as a summary card at the top
- "Send payment reminders" bulk action → sends Arkesel SMS to all selected guests

--

#### `/staff`

**Primary purpose: manage team member access and roles.**

- Shadcn DataTable: Avatar | Name | Email | Role badge | Active Switch | Last Login | Actions
- Active/inactive Shadcn Switch per row (Super Admin only) — with AlertDialog confirmation before deactivating
- Role change via Shadcn Select (Super Admin only)
- "Pending Requests" badge/button in header → navigates to `/staff/pending`
- "Remove" action per row (with AlertDialog confirmation)

--

#### `/staff/pending`

**Primary purpose: approve or reject new staff access requests.**

- Card layout (not a table — these are approval decisions, not data rows)
- Each card: staff avatar, name, email, registration date
- "Approve" button → Shadcn Sheet slides in with role assignment dropdown → "Grant Access" confirms
- "Reject" button → AlertDialog confirmation → soft deletes the record

--

#### `/reports`

**Primary purpose: understand hotel performance at a glance.**

- Tab navigation: Occupancy | Revenue | Booking Sources
- Date range picker at top (applies to all tabs)
- **Occupancy Tab:** Line chart (Shadcn Chart) — daily occupancy rate. Average occupancy % card. Breakdown table by room type.
- **Revenue Tab:** Bar chart (Shadcn Chart) — revenue by week. Revenue by source breakdown (Direct / OTA / Manual). Outstanding balance card.
- **Booking Sources Tab:** Pie chart (Shadcn Chart) — channel distribution. Count per source table.
- **Export:** "Download CSV" button per tab

--

#### `/settings/hotel`

**Primary purpose: manage the hotel's public profile and branding.**

Form sections:

- **Identity:** Hotel name, city, address, phone, email, website
- **Description:** Rich text description (shown on guest booking homepage)
- **Media:** Logo upload (shown in admin header + booking app) + Cover image upload (shown on booking app hero). Both upload to Supabase Storage.
- **Operations:** Default check-in time, default check-out time, timezone
- **Policy:** Cancellation policy text (shown at booking checkout)

--

#### `/settings/billing`

**Primary purpose: configure the hotel's Paystack payout bank account.**

- **Bank Account section:**
  - Business/hotel name (for Paystack)
  - Bank name (Shadcn Select — fetched from Paystack Banks API)
  - Account number (text input)
  - "Verify Account" button → calls Paystack Resolve Account API to confirm the account name before saving
  - Account holder name displayed after verification (read-only, from Paystack)
  - "Save Bank Details" button → creates/updates Paystack Subaccount via API, stores `paystack\\\_subaccount\\\_code` in hotels table
- **Current Subaccount Status:** Shows subaccount code, settlement bank, account name, and "Active" badge once set up
- **Settlement Schedule:** Dropdown (Auto / Manual / Specific weekday) — sets when Paystack transfers funds to the hotel's bank account

--

#### `/settings/notifications`

**Primary purpose: control what notifications this staff member receives.**

- **Notification Sound:** Shadcn Switch — "Play a chime when new bookings arrive" (localStorage per device)
- **Test Sound button:** Plays the chime immediately
- **Per-event toggles (synced to DB):**
  - New booking received
  - Payment received
  - Booking cancelled
  - OTA sync conflict detected
- Note shown: *"Sound preference is saved to this device only. Notification type toggles apply to all your devices."*

--

#### `/settings/integrations`

**Primary purpose: view and manage third-party service connections.**

Three integration cards:

**Beds24 (OTA Sync)**

- Connection status indicator (green = connected, red = disconnected)
- API key input (masked), Property ID, last sync timestamp
- Room mapping table: maps each Beds24 room ID to an internal room type
- "Test Connection" button
- "Force Full Sync" button (Super Admin only)
- OTA conflict log (last 10 conflicts with links to affected bookings)

**Arkesel (Email + SMS)**

- Connection status indicator
- API key input, sender name, sender ID
- "Send Test SMS" button → sends a test message to the Super Admin's phone number

**Paystack (redirect to /settings/billing)**

- Status card showing subaccount code and last transaction date
- Link: "Manage bank account → Settings / Billing"

--

## 12 Guest-Facing Booking Application

### 12.1 Tenant Resolution

```typescript
// middleware.ts — runs on every request to booking app
const hostname = request.headers.get('host') ?? ''
const baseDomain = process.env.NEXT\\\_PUBLIC\\\_BASE\\\_DOMAIN

const subdomain = hostname.replace(`.${baseDomain}`, '')
const isCustomDomain = !hostname.endsWith(baseDomain)

const headers = new Headers(request.headers)
headers.set('x-hotel-slug', isCustomDomain ? hostname : subdomain)

return NextResponse.next({ request: { headers } })
```

All content — hotel name, logo, colors, rooms, pricing — fetched from Supabase scoped to the resolved `hotel\\\_id`.

### 12.2 Guest Pages

**Homepage (`/`)**

- Hero: hotel name, tagline, cover image, "Book Now" CTA
- Sticky availability quick-search bar: check-in, check-out, room type
- Room types grid: thumbnail, name, from price, availability dot
- Hotel amenities icon grid
- About section (from `hotels.description`)
- Contact footer

**Rooms  Rates Page (`/rooms`)**

- All active room types
- Photo carousel per room type (Shadcn Carousel)
- Amenities icons + labels
- Live pricing
- Availability colour dot
- "Book Now" CTA per room type

**Booking Step 1 (`/book`) — Dates + Room**

- Shadcn Calendar (date range) with colour-coded availability
- Available: default / Limited: amber tint / Fully booked: greyed + not selectable
- Auto-calculates nights + estimated total in sticky summary panel

**Booking Step 2 (`/book/details`) — Guest Info**

- Full name, email, phone (all required)
- Adults + children count
- Special requests (optional)
- Estimated arrival time (optional)

**Booking Step 3 (`/book/payment`) — Review + Pay**

- Full booking summary card
- Payment choice: Pay Now (Paystack) or Pay at Check-In
- Cancellation policy
- Terms checkbox (required)

**Booking Step 4 (`/book/confirmation`) — Success**

- Booking reference (large, copyable)
- Arkesel email + SMS sent automatically
- "Add to Calendar" (.ics download)

--

## 13 Payment System — Paystack Subaccounts

### 13.1 Architecture: One Master Account, Per-Hotel Subaccounts

HotelOS Pro maintains **one Paystack master account**. Every hotel onboarded is created as a **Paystack Subaccount** under this master account via the Paystack API. When a guest pays, Paystack automatically splits the payment:

- **Hotel receives:** Their full booking amount paid directly into their bank account
- **HotelOS Pro receives:** Platform fee (0% for MVP, configurable for v2 revenue model)

This means:

- Hotels never need to create or manage their own Paystack account
- Onboarding payment setup = two form fields (bank name + account number)
- HotelOS Pro can add a transaction-level fee in v2 by changing `percentage\\\_charge` — no architecture change needed

### 13.2 Creating a Hotel Subaccount

Done during hotel onboarding from `/settings/billing`:

```
POST https://api.paystack.co/subaccount
{
  "business\\\_name": "Golden Palm Hotel",
  "bank\\\_code": "030",            ← from Paystack Banks API
  "account\\\_number": "0123456789",
  "percentage\\\_charge": 0         ← 0% for MVP; adjustable for v2
}

Response:
{
  "subaccount\\\_code": "ACCT\\\_xxxxxxxxxx",
  "settlement\\\_bank": "Access Bank",
  "account\\\_name": "Golden Palm Hotel Ltd"
}
```

`subaccount\\\_code` stored in `hotels.paystack\\\_subaccount\\\_code`.

### 13.3 Account Verification Before Saving

Before creating the subaccount, the entered bank account is verified:

```
GET https://api.paystack.co/bank/resolve?account\\\_number=xxx\\\&bank\\\_code=030
→ Returns { account\\\_name: "Golden Palm Hotel Ltd" }
→ Show account name to staff for confirmation before saving
```

### 13.4 Pay Now Flow

```
1. Guest selects "Pay Now"
2. POST /api/\\\[slug]/payments/initialize
   → Fetch hotels.paystack\\\_subaccount\\\_code
   → Call Paystack Initialize Transaction with subaccount
   → Return access\\\_code
3. @paystack/inline-js loads Paystack popup
4. Guest completes payment
5. GET /api/\\\[slug]/payments/verify?reference=xxx
   → Call Paystack Verify Transaction
   → Confirm subaccount split is correct
6. On success:
   → Insert payment record (paystack\\\_subaccount stored)
   → Update booking: status = confirmed, payment\\\_status = paid
   → Beds24 outbound push
   → Insert notification → Realtime broadcast
   → Arkesel email + SMS
7. On failure: booking stays pending, guest shown retry option
```

### 13.5 Paystack Webhook

`POST /api/webhooks/paystack`

- Validates `x-paystack-signature` (HMAC-SHA512)
- Extracts `hotel\\\_id` from metadata embedded at initialization
- Processes `charge.success`, `charge.failed`
- Idempotency: `paystack\\\_reference` UNIQUE constraint

### 13.6 Pay at Check-In

- Booking created: `payment\\\_status = 'unpaid'`
- Visible in `/payments/outstanding`
- Staff records cash/POS at check-in via booking detail
- Or generates Paystack link → sends to guest via Arkesel

### 13.7 Refunds

- Manager+ initiates from Booking Detail → Payments tab
- Calls Paystack Refund API with original reference + amount
- `payments.status = 'refunded'`
- Guest notified via Arkesel

--

## 14 Beds24  OTA Channel Sync

### 14.1 What HotelOS Handles vs Beds24 Dashboard


| Action                       | HotelOS Admin | Beds24 Dashboard                                    |
| ---------------------------- | ------------- | --------------------------------------------------- |
| Create Beds24 property       | ✅ API         | ❌                                                   |
| Add room types               | ✅ API         | ❌                                                   |
| Push availability            | ✅ API         | ❌                                                   |
| Push prices                  | ✅ API         | ❌                                                   |
| Receive OTA bookings         | ✅ Webhook     | ❌                                                   |
| View sync status             | ✅ Admin UI    | ❌                                                   |
| **Map rooms to Booking.com** | ❌             | ✅ **One-time, done by HotelOS staff at onboarding** |


### 14.2 Inbound Sync (Booking.com → HotelOS)

```
POST /api/webhooks/beds24
1. Validate Beds24 secret token header
2. Extract beds24\\\_property\\\_id → lookup hotel\\\_id
3. Extract beds24\\\_room\\\_id → lookup room\\\_type\\\_id
4. Conflict check: overlapping confirmed/checked\\\_in bookings?
   SELECT \\\* FROM bookings
   WHERE room\\\_type\\\_id = X
   AND check\\\_in < payload.check\\\_out
   AND check\\\_out > payload.check\\\_in
   AND status IN ('confirmed', 'checked\\\_in')
5. No conflict:
   → Upsert guest record
   → Insert booking (source = 'bookings\\\_com')
   → Insert notification → Realtime broadcast
   → Log to beds24\\\_sync\\\_log (status = 'success')
6. Conflict detected:
   → Log to beds24\\\_sync\\\_log (status = 'conflict')
   → Insert urgent notification (type = 'ota\\\_conflict')
   → Arkesel SMS to hotel Super Admin
   → NO auto-resolution — human decision required
```

### 14.3 Outbound Sync (HotelOS → Beds24)

Auto-triggered on: booking confirmed, booking cancelled, dates modified, availability block created.

```
POST https://beds24.com/api/v2/inventory/rooms/calendar
{ roomId, calendar: \\\[{ from, to, availability: 0 }] }
```

--

## 15 Notification System

### 15.1 Real-Time Flow

```typescript
supabase
  .channel(`hotel:${hotelId}`)
  .on('postgres\\\_changes', {
    event: 'INSERT', schema: 'public',
    table: 'notifications',
    filter: `hotel\\\_id=eq.${hotelId}`
  }, (payload) => {
    showToast(payload.new)
    if (soundEnabled) playChime()
    updateBellBadgeCount()
  })
  .subscribe()
```

### 15.2 Toast (Sonner)

- Content: "New Booking — Guest] | Room Type] | Dates]"
- "View Booking" action button
- 8 seconds duration, manually dismissible
- Colour-coded: Blue = booking, Green = payment, Red = conflict/alert

### 15.3 Notification Sound

- Web Audio API plays `/public/sounds/chime.mp3` on `new\\\_booking` events
- Volume: 0.6 (appropriate for front desk)
- Controlled by `localStorage` key `hotelOS\\\_sound\\\_enabled`

### 15.4 Notification Bell (Top Nav)

- Live unread count badge (Supabase Realtime)
- Shadcn Popover (desktop) / Sheet (mobile)
- Last 20 notifications: type icon, title, message, time elapsed, read/unread dot
- "Mark all as read" action
- Each entry links to the relevant page

### 15.5 Per-Staff Preferences (`/settings/notifications`)

- Sound toggle (localStorage — device-specific)
- Per-event type toggles (stored in `staff\\\_profiles.notification\\\_prefs` — cross-device)

### 15.6 Arkesel — Guest Notifications


| Event                          | Channel     | Content                                        |
| ------------------------------ | ----------- | ---------------------------------------------- |
| Booking confirmed              | Email + SMS | Ref, room, dates, check-in time, hotel contact |
| Payment received               | Email       | Receipt, amount paid, outstanding balance      |
| Booking cancelled              | Email + SMS | Cancellation + refund info                     |
| Check-in reminder (day before) | SMS         | Tomorrow's arrival + hotel address             |
| Check-out reminder (morning)   | SMS         | Check-out time reminder                        |
| Payment link                   | Email + SMS | Direct Paystack link for outstanding balance   |


--

## 16 Guest Directory

### `/guests` — List Page

- Prominent search bar at top (name, email, phone)
- Shadcn DataTable: Name | Email | Phone | Stays | Last Stay | Tags | Actions
- Tag filter: VIP / Regular / Flagged
- Row click → guest profile

### `/guests/\\\[id]` — Profile Page

- Editable contact info (inline)
- Tags: VIP / Regular / Flagged (Shadcn Badges, toggleable)
- Stats cards: total stays, total spend, first visit, last visit
- Internal notes (append-only with timestamp)
- Booking history DataTable
- "New Booking" quick action

--

## 17 Availability Color Coding

Used consistently on every surface: guest calendar, room cards, admin timeline, room directory, badges.


| Status                   | Color         | Hex       |
| ------------------------ | ------------- | --------- |
| Available                | Emerald Green | `#16A34A` |
| Limited (1–2 rooms left) | Amber         | `#D97706` |
| Occupied / Unavailable   | Red           | `#DC2626` |
| Sold Out                 | Deep Rose     | `#9F1239` |
| Checked In               | Blue          | `#2563EB` |
| Checkout Today           | Orange        | `#EA580C` |
| Maintenance / Blocked    | Slate         | `#64748B` |
| Pending / Unconfirmed    | Violet        | `#7C3AED` |
| Cleaning                 | Cyan          | `#0891B2` |


--

## 18 Timeline Calendar — DayPilot Lite

### 18.1 Library

`**@daypilot/daypilot-lite-react**` — Apache License 2.0 (free, commercial use confirmed).
Actively maintained — latest release October 2025 (v4.8.0).

DayPilot Lite is the industry standard for web-based resource scheduling applications. Hotels, hospitals, salons, and facility management systems all use this pattern. The horizontal Scheduler component is purpose-built for multi-day, multi-resource timeline views.

```
DayPilot concept  →  Hotel concept
resources         →  rooms (Y-axis, grouped by room type)
events            →  bookings (horizontal date-range blocks)
start             →  check\\\_in
end               →  check\\\_out
```

### 18.2 Why DayPilot Lite vs Alternatives


| Library                 | Status         | Reason                                                                                                                                            |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DayPilot Lite**       | ✅ **Selected** | Apache 2.0 · horizontal Scheduler built-in · drag-drop in free tier · React + Next.js support · CSS fully customisable · actively maintained 2025 |
| Planby                  | ❌              | Advanced features including drag-drop require paid PRO license                                                                                    |
| FullCalendar (resource) | ❌              | $1,099/year commercial license required for resource timeline view                                                                                |
| react-big-calendar      | ❌              | No native horizontal resource timeline                                                                                                            |
| GSTC                    | ❌              | Requires commercial license key                                                                                                                   |
| react-big-schedule      | ❌              | Unmaintained; last significant update 2022                                                                                                        |


### 18.3 Calendar Configuration

```tsx
<DayPilotScheduler
  resources={rooms}               // rooms array from Supabase
  events={bookingEvents}          // bookings mapped to DayPilot event format
  startDate={visibleStart}
  days={visibleDays}              // 7 = week, 30 = month
  scale="Day"
  cellWidth={60}
  rowHeight={40}
  onEventClick={handleBookingClick}    // Opens booking detail Sheet
  onTimeRangeSelected={handleNewBooking} // Opens new booking modal
  onEventMoved={handleReschedule}      // Drag-drop reschedule
  eventMoveHandling="Update"
  theme={hotelOsTheme}                 // Custom CSS theme
/>
```

### 18.4 Features

- **Y-axis sidebar:** Rooms grouped by room type. Room number + type badge.
- **X-axis header:** Scrollable date columns. Day / 3-Day / Week / Month view toggle.
- **Booking blocks:** Rounded, colour-coded by source. Shows guest name + reference. Full summary on hover (Shadcn Tooltip).
- **Empty slot click:** Opens New Manual Booking modal pre-filled with room + dates.
- **Block click:** Opens booking detail Sheet.
- **Drag-and-drop:** Move booking to new dates (Shadcn AlertDialog confirmation + availability check).
- **Maintenance blocks:** Hatched slate pattern, distinct from booking blocks.
- **Current day line:** Vertical indicator.
- **Real-time updates:** Supabase Realtime subscription adds new blocks without refresh. New blocks animate with a brief pulse for 3 seconds.

### 18.5 Booking Block Colours


| Source / Status          | Color            |
| ------------------------ | ---------------- |
| Direct booking           | Blue `#2563EB`   |
| Bookings.com (OTA)       | Purple `#7C3AED` |
| Manual / Walk-in / Phone | Teal `#0D9488`   |
| Maintenance / Block      | Slate `#64748B`  |
| Checked In               | Green `#16A34A`  |


### 18.6 Custom Apple-Inspired Styling

DayPilot Lite styles are fully controlled via CSS (custom theme class):

- Booking blocks: `border-radius: 8px`, soft drop shadow
- Grid lines: 1px, `opacity: 0.3`
- Header: clean white with `border-bottom: 1px solid #E2E8F0`
- Sidebar: `background: #F8FAFC`, `font-family: 'Inter', sans-serif`
- Hover state: block lifts with `box-shadow` increase

--

## 19 PWA Features

### 19.1 Scope

PWA applies to the **Admin Dashboard only** (`app.hotelosprp.com`). Guest booking app is a standard responsive web experience.

### 19.2 Implementation

```javascript
// next.config.js
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  cacheOnFrontendNav: true,
  reloadOnOnline: true,
  workboxOptions: {
    runtimeCaching: \\\[
      { urlPattern: /\\\\/api\\\\//, handler: 'NetworkFirst' },
      { urlPattern: /\\\\.(js|css|png|jpg|svg|ico)$/, handler: 'CacheFirst' }
    ]
  }
})
```

### 19.3 Web App Manifest

```json
{
  "name": "\\\[Hotel Name] — HotelOS",
  "short\\\_name": "HotelOS",
  "start\\\_url": "/overview",
  "display": "standalone",
  "orientation": "any",
  "theme\\\_color": "#0F172A",
  "background\\\_color": "#FFFFFF",
  "icons": \\\[
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "purpose": "maskable" }
  ]
}
```

### 19.4 Service Worker

- Offline fallback: custom `/offline` page
- Static asset caching via Workbox
- Network-first for all API routes (availability never served stale)

### 19.5 Install Experience

- "Install App" Shadcn Alert in admin header (eligible browsers)
- iOS: custom "Add to Home Screen" Shadcn Dialog with step-by-step screenshots
- Android / Chrome: native PWA install prompt

--

## 20 UI/UX Design System

### 20.1 Philosophy

Calm, precise, and premium — like hotel management software Apple would ship. Every screen has one clear primary action. Status information is always visible without opening a record. Empty states always guide the user to the next action.

### 20.2 Five Core UX Rules

1. **One primary action per view** — secondary actions hidden in `DropdownMenu`
2. **Empty states always have a CTA** — never a dead end
3. **Status always visible** — colour-coded Shadcn Badges everywhere
4. **Confirm destructive actions only** — no confirmation for status changes, only cancellations and deletions
5. **Smart defaults** — forms pre-fill where possible (today's date, last used room type, guest lookup)

### 20.3 Typography


| Context               | Font             | Weights       |
| --------------------- | ---------------- | ------------- |
| Admin UI              | Geist Sans       | 400, 500, 600 |
| Guest portal headings | Playfair Display | 400, 700      |
| Guest portal body     | Inter            | 400, 500      |
| Monospace             | Geist Mono       | 400           |


### 20.4 Colour Tokens (CSS Variables)

```css
:root {
  --background:           #FFFFFF;
  --foreground:           #0F172A;
  --muted:                #F1F5F9;
  --muted-foreground:     #64748B;
  --border:               #E2E8F0;
  --primary:              #0F172A;
  --primary-foreground:   #FFFFFF;
  --accent:               #3B82F6;
  --destructive:          #EF4444;
  --success:              #16A34A;
  --warning:              #F59E0B;
  --radius:               0.625rem;
}
```

### 20.5 Shadcn Component Usage


| Component                | Usage in HotelOS Pro                                         |
| ------------------------ | ------------------------------------------------------------ |
| `Button`                 | All CTAs and form submissions                                |
| `Card`                   | KPI cards, room type cards, booking summary                  |
| `DataTable`              | All admin tables (bookings, guests, rooms, payments, staff)  |
| `Calendar`               | Guest booking date picker + all admin date inputs            |
| `Sheet`                  | Booking detail drawer, mobile nav, manual booking form       |
| `Dialog` / `AlertDialog` | Destructive confirmations (cancel booking, deactivate staff) |
| `Badge`                  | All status indicators throughout the platform                |
| `Sonner`                 | Real-time notification toasts                                |
| `Select`                 | Room type selection, role assignment, filters                |
| `Combobox`               | Guest search in manual booking form                          |
| `Form` + `FormField`     | All form surfaces                                            |
| `Tabs`                   | Booking detail (Overview / Payments / Notes), Reports        |
| `Switch`                 | Staff active toggle, room type active, sound preference      |
| `Avatar`                 | Staff member avatars                                         |
| `Skeleton`               | Loading states for all data-heavy surfaces                   |
| `Progress`               | Payment completion bar, occupancy indicator                  |
| `Tooltip`                | Calendar block hover info, icon buttons                      |
| `Popover`                | Notification bell, inline pickers                            |
| `DropdownMenu`           | Row actions in all DataTables                                |
| `Carousel`               | Room image gallery on guest booking app                      |
| `ScrollArea`             | Notification list, calendar scroll container                 |
| `Separator`              | Section dividers in forms and detail views                   |


--

## 21 Reports

Access: Manager and Super Admin roles only.

### `/reports` — Three Tabs

**Occupancy Tab**

- Daily occupancy rate line chart (Shadcn Chart)
- Average occupancy % for period (KPI card)
- Breakdown by room type (DataTable)

**Revenue Tab**

- Revenue by week bar chart (Shadcn Chart)
- Revenue by source breakdown: Direct / Bookings.com / Manual
- Outstanding balance total (KPI card)

**Booking Sources Tab**

- Channel distribution pie chart (Shadcn Chart)
- Booking count per source (DataTable)

**All Tabs:**

- Date range picker at top (applies to the active tab)
- "Download CSV" export button

--

## 22 Settings

### `/settings/hotel` — Hotel Profile

Name, address, city, phone, email, description, logo, cover image, timezone, check-in/out times, cancellation policy.

### `/settings/billing` — Paystack Bank Account

Bank account verification + Paystack Subaccount creation/management. Full specification in Section 13.

### `/settings/notifications` — Notification Preferences

Sound toggle (device-local), test sound button, per-event type toggles (DB-synced). Full specification in Section 15.

### `/settings/integrations` — Third-Party Connections

Beds24 config + room mapping, Arkesel config, Paystack status card. Full specification in Section 14.

--

## 23 Security

### 23.1 Authentication

- All admin routes: Clerk `auth().protect()` in Next.js middleware
- Supabase RLS: `hotel\\\_id` isolation enforced at DB layer — app layer is a second defence only
- Custom JWT claims: `hotel\\\_id`, `role`, `is\\\_active` in Clerk session token
- Staff deactivation: Clerk session revoked immediately via Backend API

### 23.2 API  Secrets

- All API keys (Beds24, Arkesel) in environment variables — never in client bundles
- Paystack keys managed server-side only; `subaccount\\\_code` is non-sensitive and can be used client-side
- Paystack webhook: HMAC-SHA512 signature validation
- Beds24 webhook: secret token header validation
- Rate limiting on public booking API routes (Next.js middleware)
- HTTPS enforced by Render.com

### 23.3 Data

- Guest national ID encrypted at application layer before DB storage
- Payment card data never stored — Paystack handles PCI-DSS
- Supabase Storage: bucket paths include `hotel\\\_id`, protected by Storage RLS
- `audit\\\_logs`: append-only — no UPDATE or DELETE RLS policies

--

## 24 Performance Requirements


| Metric                                       | Target        |
| -------------------------------------------- | ------------- |
| Guest portal FCP                             | < 1.5 seconds |
| Guest portal LCP                             | < 2.5 seconds |
| Admin dashboard initial load (PWA warm)      | < 2.0 seconds |
| Booking creation API (p95)                   | < 800ms       |
| Realtime notification delivery               | < 500ms       |
| DayPilot calendar render (50 rooms, 30 days) | < 300ms       |
| Availability check query                     | < 400ms       |
| Room image load                              | < 1.0 second  |


### Strategies

- React Server Components for all guest-facing pages (SSR + SEO)
- Next.js Image: WebP, lazy loading, srcSet for all room photos
- Indexed queries on `bookings(hotel\\\_id, check\\\_in, check\\\_out, status)`
- Pagination on all DataTable views
- DayPilot Lite progressive rendering — only visible date window mounted
- TanStack Query (via Shadcn DataTable) for client-side caching

--

## 25 Additional Operational Features

### 25.1 Check-In / Check-Out

- **Check In:** `status = 'checked\\\_in'`, `check\\\_in\\\_at = NOW()`, Arkesel SMS to guest, audit log entry
- **Check Out:** `status = 'checked\\\_out'`, `check\\\_out\\\_at = NOW()`, room `status = 'checkout\\\_pending'`, audit log entry
- **Housekeeping Queue:** `/rooms/directory` filtered to `checkout\\\_pending` — Read-Only role can view this
- Staff marks room "available" from room directory after cleaning

### 25.2 Booking Reference

Format: `HOP-YYYY-NNNNN` — hotel-scoped sequential number, generated server-side, UNIQUE constraint.

### 25.3 Audit Log

- Every booking create/modify/cancel, check-in/out, staff role change logged to `audit\\\_logs`
- Viewable in `/settings` → "Audit Log" page (Super Admin only)
- Export to CSV
- Append-only: no delete or update RLS policies on this table

### 25.4 Room Image Management

- Upload to: `hotels/{hotel\\\_id}/room-types/{room\\\_type\\\_id}/{filename}`
- Stored in: `room\\\_types.images` JSONB `\\\[{url, caption, order}]`
- Drag-to-reorder via @dnd-kit/core
- First image (order: 0) = listing thumbnail

--

## 26 Subdomain  Custom Domain Routing

### 26.1 Architecture

```
golden-palm.hotelosprp.com  →  Booking app (hotel: golden-palm)
app.hotelosprp.com          →  Hotel Staff Admin Dashboard
platform.hotelosprp.com     →  HotelOS Internal Platform Admin
book.theirhotel.com         →  Custom domain → same booking app
```

### 26.2 Custom Domain

1. Hotel's DNS: `CNAME book.theirhotel.com → hotelosprp.com`
2. Add custom domain to Render.com service
3. Set `hotels.custom\\\_domain = 'book.theirhotel.com'`
4. Middleware matches hostname against `hotels.custom\\\_domain`

### 26.3 Render.com Configuration

- **One Render Web Service** runs the whole app
- Wildcard domain `*.hotelosprp.com` attached to that service — covers `app.`, `platform.`, and every hotel's `[slug].` subdomain
- Custom domains (e.g. `book.theirhotel.com`) added to the same service per hotel, as needed
- `middleware.ts` resolves which route group to serve based on the incoming `host`
- Auto-deploy on push to `main`
- Environment variables managed once, in that single service's Render dashboard

--

## 27 MVP Implementation Roadmap

**Total: 16 weeks**

### Phase 1 — Foundation 

- [ ] Next.js 16+ app initialized — App Router, Tailwind, Shadcn UI, pnpm
- [ ] Route groups scaffolded: `(platform)`, `(admin)`, `(booking)`
- [ ] Full MVP schema in Supabase + RLS policies + indexes
- [ ] Clerk: Organizations, custom session claims, RBAC middleware
- [ ] `middleware.ts` — host-based routing (domain → route group, slug → hotel_id)
- [ ] Admin layout, sidebar, role-based route guards
- [ ] Staff sign-up → pending → approval → active flow
- [ ] Render.com: single Web Service + wildcard domain `*.hotelosprp.com`

### Phase 2 — Rooms  Inventory 

- ] Room types CRUD + image upload to Supabase Storage
- ] Individual rooms CRUD + status management
- ] Availability blocks (create, view, delete)
- ] Room directory page

### Phase 3 — Guest Booking App 

- ] Hotel homepage (dynamic per tenant)
- ] Rooms listing page
- ] 4-step booking wizard with Shadcn Calendar
- ] Availability query engine (conflict-safe, indexed)
- ] Booking creation API with conflict detection
- ] Booking reference generation

### Phase 4 — Payments

- ] Paystack Subaccount creation flow (`/settings/billing`)
- ] Paystack bank account verification (Resolve API)
- ] Paystack initialization with subaccount code
- ] Paystack inline popup (@paystack/inline-js)
- ] Paystack webhook + HMAC validation
- ] Pay Now flow
- ] Pay at Check-In flow
- ] Manual payment recording
- ] Paystack payment link generation
- ] Refund flow (Manager+)
- ] Arkesel email + SMS on all booking events

### Phase 5 — Admin Operations

- ] All Bookings DataTable (filters, search, sort, export)
- ] Booking detail Sheet (3 tabs)
- ] Manual booking form
- ] Check-In / Check-Out workflow
- ] DayPilot Lite Scheduler (custom styled, Realtime)
- ] Guest Directory list + profile pages
- ] Payments pages (transactions + outstanding)

### Phase 6 — OTA Sync + Notifications

- ] Beds24 inbound webhook + conflict detection
- ] Beds24 outbound availability push
- ] OTA sync status in `/settings/integrations`
- ] Supabase Realtime notification subscription
- ] Sonner toast notifications
- ] Notification sound (Web Audio API)
- ] Notification bell + per-device sound toggle
- ] Per-event notification type toggles

### Phase 7 — Reports, Settings  PWA 

- ] Overview dashboard KPIs + charts (Shadcn Charts)
- ] Reports page (3 tabs, CSV export)
- ] All settings pages (hotel, billing, notifications, integrations)
- ] Staff management pages
- ] Audit log page
- ] Platform Admin: tenant overview + approval flow
- ] PWA setup (manifest, service worker, install banners)
- ] Cross-browser / cross-device QA
- ] RLS audit + security review
- ] Production deploy to Render.com

--

## 28 Open Source Licenses


| Library                           | License        | Purpose                                             |
| --------------------------------- | -------------- | --------------------------------------------------- |
| Next.js                           | MIT            | Core framework                                      |
| Supabase JS                       | MIT            | Database + Realtime                                 |
| Shadcn UI                         | MIT            | All UI components (tables, charts, calendar, forms) |
| Clerk React SDK                   | MIT            | Authentication                                      |
| **@daypilot/daypilot-lite-react** | **Apache 2.0** | **Timeline calendar (room scheduler)**              |
| React Hook Form                   | MIT            | Form management                                     |
| Zod                               | MIT            | Schema validation                                   |
| @ducanh2912/next-pwa              | MIT            | PWA / Service Worker                                |
| Sonner                            | MIT            | Toast notifications                                 |
| date-fns                          | MIT            | Date utilities                                      |
| Lucide React                      | ISC            | Icon set                                            |
| @dnd-kit/core                     | MIT            | Image drag-and-drop reorder                         |
| @paystack/inline-js               | MIT            | Paystack inline checkout popup                      |


--

## 29 MVP Acceptance Criteria

The MVP ships when all of the following pass:

1. **Multi-tenancy isolation:** Hotel A staff cannot read, write, or delete Hotel B's data — verified at both app layer and direct Supabase RLS layer with test JWTs
2. **Guest booking flow:** A guest completes full booking (dates → details → Paystack → confirmation email + SMS) in under 3 minutes on mobile, 4G
3. **Paystack Subaccount payout:** Payment from a test booking reaches the hotel's Paystack subaccount correctly; settlement routes to the hotel's registered bank account
4. **OTA sync speed:** Bookings.com reservation appears in hotel admin dashboard within 60 seconds of confirmation via Beds24
5. **Conflict detection:** Double-booking conflict triggers urgent notification to Super Admin within 30 seconds and logs correctly to `beds24\\\_sync\\\_log`
6. **Staff gating:** Newly registered staff cannot access any admin page until approved by the hotel Super Admin
7. **Payment idempotency:** Paystack webhook retry does not create duplicate payment records (UNIQUE on `paystack\\\_reference`)
8. **Realtime notifications:** Toast + chime appear within 2 seconds of a new booking being inserted into Supabase
9. **DayPilot calendar performance:** Renders all room assignments for 90-day window with 50 rooms in under 300ms
10. **Availability accuracy:** No bookable dates exist for rooms that are fully committed (confirmed bookings + blocks cover the date)
11. **Subdomain routing:** 3 hotel slugs correctly resolve to isolated hotel data with zero cross-tenant leakage
12. **Billing setup:** A hotel can add their bank details, verify account name, and create a Paystack Subaccount entirely from the `/settings/billing` page without any manual steps from HotelOS Pro staff
13. **PWA install:** Admin dashboard installs and runs standalone on iOS Safari and Android Chrome
14. **Lighthouse scores:** Guest-facing pages score Performance ≥ 80, Accessibility ≥ 85 on mobile

--

## 30 Post-MVP Features Backlog

Intentionally excluded from v1. Prioritised for v2 after real-hotel validation.


| Feature                               | Reason Deferred                                        |
| ------------------------------------- | ------------------------------------------------------ |
| Seasonal pricing rules                | Base price + weekend override sufficient for MVP       |
| PDF report export                     | CSV covers operational need                            |
| RevPAR + advanced analytics           | Useful, not needed for daily hotel operations          |
| Paystack per-transaction platform fee | Revenue model feature, zero-config in MVP architecture |
| Drag-and-drop booking reschedule      | Verify DayPilot Lite free tier coverage first          |
| Global Cmd+K search                   | Convenience, not blocking core workflows               |
| Multi-property support per hotel      | Single-property focus for MVP                          |
| Guest-facing account / login          | Anonymous booking converts better for MVP              |
| Custom email/SMS templates            | Fixed Arkesel templates sufficient                     |
| Revenue management / dynamic pricing  | Complex, post-validation                               |
| White-label branding for Pro plan     | Post-stability feature                                 |
| Paystack Subaccount split reports     | Post-MVP monetisation tooling                          |
| Restaurant POS integration            | Out of scope                                           |
| Recurring booking / long-stay rates   | Edge case for MVP                                      |
| Housekeeping management module        | Basic checkout-pending queue in MVP is sufficient      |


