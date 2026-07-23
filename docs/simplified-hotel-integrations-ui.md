# Simplified Hotel Integrations UI Design

## Overview
A clean, non-technical view of integration status for hotel users. No configuration controls, just status information and support CTAs.

## Design Principles
1. **Clarity**: Show only what hotels need to know
2. **Simplicity**: No technical jargon or configuration options
3. **Visual**: Use status indicators, icons, and progress
4. **Actionable**: Clear path to support if issues occur

## UI Structure

### Layout
```
/dashboard/settings/integrations
├── Page Header
│   ├── Title: "Connected Services"
│   ├── Description: "Your hotel is connected to these services"
│   └── Back Link to Settings
│
├── Integrations Grid (2 columns on desktop, 1 on mobile)
│   ├── Bed24 Integration Card
│   │   ├── Header (Icon + Name + Status Badge)
│   │   ├── Description
│   │   ├── Health Metrics (Cards)
│   │   │   ├── Connection Status
│   │   │   ├── Last Sync Time
│   │   │   └── Sync Success Rate
│   │   └── Actions
│   │       ├── View Details Button (Expands panel)
│   │       └── Contact Support Link
│   │
│   └── [Future: Other integrations]
│
└── Help Section
    ├── FAQ Accordion
    └── Support Contact Card
```

## Bed24 Integration Card Specifications

### Card States

**1. Connected & Healthy**
```
┌─────────────────────────────────────────────┐
│ 🔗 Bed24 Channel Manager      [✓ Connected] │
│                                              │
│ Your rooms are automatically synced with    │
│ Booking.com, Airbnb, and other OTAs        │
│                                              │
│ ┌──────┐ ┌──────┐ ┌──────┐                │
│ │ ✓    │ │ 5m   │ │ 98%  │                │
│ │Active│ │ ago  │ │Success│               │
│ └──────┘ └──────┘ └──────┘                │
│                                              │
│ [View Sync Details ▼]  📧 Need Help?       │
└─────────────────────────────────────────────┘
```

**2. Connected but Errors**
```
┌─────────────────────────────────────────────┐
│ 🔗 Bed24 Channel Manager      [⚠ Warning]   │
│                                              │
│ Some sync errors detected. Our team has    │
│ been notified and is investigating.         │
│                                              │
│ ┌──────┐ ┌──────┐ ┌──────┐                │
│ │ ⚠    │ │ 2h   │ │ 85%  │                │
│ │Issues│ │ ago  │ │Success│               │
│ └──────┘ └──────┘ └──────┘                │
│                                              │
│ [Contact Support →]                         │
└─────────────────────────────────────────────┘
```

**3. Not Configured**
```
┌─────────────────────────────────────────────┐
│ 🔗 Bed24 Channel Manager  [○ Not Setup]    │
│                                              │
│ Connect your property to sync with major   │
│ OTAs like Booking.com and Airbnb           │
│                                              │
│ This integration is set up by our team     │
│ during onboarding.                          │
│                                              │
│ [Contact Support to Setup →]                │
└─────────────────────────────────────────────┘
```

**4. Sync in Progress**
```
┌─────────────────────────────────────────────┐
│ 🔗 Bed24 Channel Manager      [↻ Syncing]  │
│                                              │
│ Syncing availability with channels...      │
│                                              │
│ ┌──────┐ ┌──────┐ ┌──────┐                │
│ │ ↻    │ │Just  │ │ 98%  │                │
│ │Sync  │ │ now  │ │Success│               │
│ └──────┘ └──────┘ └──────┘                │
│                                              │
│ This usually takes a few seconds           │
└─────────────────────────────────────────────┘
```

## Components Architecture

### IntegrationStatusCard
```typescript
interface IntegrationStatusCardProps {
  integration: {
    name: string;
    icon: React.ReactNode;
    description: string;
    status: "connected" | "warning" | "error" | "not_configured" | "syncing";
    statusLabel: string;
  };
  metrics?: {
    connectionStatus: "active" | "inactive";
    lastSync: string | null;
    successRate: number;
  };
  onViewDetails?: () => void;
  onContactSupport?: () => void;
}
```

### MetricCard (Sub-component)
```typescript
interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  status: "success" | "warning" | "error" | "info";
}
```

## Color Scheme

**Status Colors** (using HeroUI color system):
- `success`: Green (#10b981) - Healthy, active
- `warning`: Amber (#f59e0b) - Minor issues
- `danger`: Red (#ef4444) - Critical issues
- `default`: Gray (#6b7280) - Not configured
- `primary`: Blue (#3b82f6) - Syncing

**Background Colors**:
- Card: `bg-background` with `border-border`
- Metric cards: `bg-muted/30`
- Success state: `bg-success/5` border `border-success/20`
- Warning state: `bg-warning/5` border `border-warning/20`

## Typography

**Card Title**: `text-lg font-semibold`
**Description**: `text-sm text-foreground/70`
**Metric Label**: `text-xs text-foreground/55 uppercase tracking-wider`
**Metric Value**: `text-xl font-bold tabular-nums`

## Interaction Patterns

### View Details Panel (Expanded State)
When "View Sync Details" is clicked:
```
┌─────────────────────────────────────────────┐
│ 🔗 Bed24 Channel Manager      [✓ Connected] │
│                                              │
│ Your rooms are automatically synced...      │
│                                              │
│ [Metrics Cards]                             │
│                                              │
│ [View Sync Details ▲]  📧 Need Help?       │
│                                              │
│ ┌─ Recent Sync Activity ──────────────────┐│
│ │ ✓ 5 minutes ago - Availability updated  ││
│ │ ✓ 2 hours ago - Booking received        ││
│ │ ✓ 5 hours ago - Availability updated    ││
│ └──────────────────────────────────────────┘│
│                                              │
│ All sync operations managed by HotelOS team │
└─────────────────────────────────────────────┘
```

### Contact Support Flow
Button opens either:
1. Email client: `mailto:support@hotelosprp.com?subject=Integration Support - [Hotel Name]`
2. Modal with support form (future enhancement)

## Responsive Behavior

**Desktop (≥768px)**:
- 2-column grid for integrations
- Metrics displayed horizontally
- Full descriptions visible

**Mobile (<768px)**:
- Single column stack
- Metrics in 3-column grid
- Condensed descriptions
- Touch-friendly buttons (min height 44px)

## Accessibility

- Semantic HTML (`<section>`, `<article>`, `<aside>`)
- ARIA labels for status badges
- Keyboard navigation support
- Focus indicators on all interactive elements
- Screen reader announcements for status changes

## Content Guidelines

**Do Say**:
- "Your rooms are synced with major OTAs"
- "Last updated 5 minutes ago"
- "Our team has been notified"
- "Setup is handled during onboarding"

**Don't Say**:
- "Bed24 Property ID: 123456"
- "API token expires in 24 hours"
- "Force sync availability"
- "Configure room mappings"

## Future Integrations

Card structure designed to be reusable for:
- Payment processors (Stripe, Paystack)
- Accounting software (QuickBooks, Xero)
- Review platforms (TripAdvisor, Google)
- Guest messaging (WhatsApp Business, SMS)

Each follows the same pattern:
1. Icon + Name + Status
2. Clear description
3. Health metrics (if applicable)
4. Support CTA

## Error Messages (User-Friendly)

Instead of technical errors, show:

**Original**: "API request failed: 401 Unauthorized"
**Simplified**: "Connection temporarily unavailable. Our team is investigating."

**Original**: "Bed24 sync failed: Room mapping not found for room_type_id abc123"
**Simplified**: "Some rooms couldn't sync. Support has been notified."

**Original**: "Rate limit exceeded: 100 credits used in 5 minutes"
**Simplified**: "High sync volume detected. System will retry automatically."
