# Platform Admin Bed24 Integration Management - Design Document

## Overview
This document outlines the design for moving Bed24 technical configuration from hotel dashboards to the platform admin dashboard.

## Goals
1. **Simplify hotel user experience** - Hotels see only integration status, not technical details
2. **Centralize control** - Platform admins manage all technical Bed24 setup
3. **Maintain security** - Clear role boundaries between platform admins and hotel staff
4. **Production-ready** - Robust error handling, audit logging, rate limiting

## Current State Analysis

### What Hotels Currently See (to be removed)
- Bed24 Property ID configuration
- API token management
- Room mapping tables
- Sync log details  
- Token refresh controls
- Force sync button
- Connection testing

### What Hotels Currently Need
- Integration status (connected/disconnected)
- Last sync time
- Sync health metrics
- Support contact if issues occur
- Guest notification toggle (stays in hotel settings)

## New Architecture

### Platform Admin Dashboard (`/platform/dashboard/integrations`)

#### Page Structure
```
/platform/dashboard/integrations
├── Hotel Selector (dropdown with search)
├── Overview Tab
│   ├── Connection Status Card
│   ├── Property Configuration
│   └── Health Metrics
├── Room Mappings Tab
│   ├── Mapping Table (CRUD)
│   └── Add/Edit Mapping Modal
├── Sync Logs Tab
│   ├── Filters (date, direction, status)
│   ├── Logs Table
│   └── Error Details Panel
└── Settings Tab
    ├── Token Refresh
    └── Advanced Controls
```

#### Features for Platform Admins
1. **Hotel Selection**
   - Dropdown with all hotels
   - Search/filter by name
   - Show current hotel's status badge

2. **Property Configuration**
   - View/Edit Bed24 Property ID per hotel
   - Test connection for specific hotel
   - Force full sync for specific hotel
   - Token refresh (applies to all hotels - shared master token)

3. **Room Mapping Management**
   - Create: Map HotelOS room_type_id → Bed24 room_id
   - Read: View all mappings for selected hotel
   - Update: Edit existing mappings
   - Delete: Remove mappings
   - Validation: Prevent duplicate mappings, invalid IDs

4. **Sync Monitoring**
   - Filter logs by hotel, date range, status
   - View detailed error messages
   - Export logs to CSV
   - Retry failed syncs
   - Real-time sync stats

5. **Audit Trail**
   - Log all configuration changes
   - Track who made changes and when
   - Include before/after values

### Hotel Dashboard (`/dashboard/settings/integrations`)

#### Simplified View
```
/dashboard/settings/integrations
├── Connected Integrations
│   ├── Bed24 Status Card
│   │   ├── Status Badge (Connected/Disconnected)
│   │   ├── Last Sync: X minutes ago
│   │   ├── Sync Health: 98% success rate
│   │   └── Support Button
│   └── [Future: Other integrations]
└── Guest Notifications (moved to separate tab)
```

#### Features for Hotels
1. **Read-only Status**
   - Connection status indicator
   - Last successful sync time
   - Success rate percentage
   - Support contact CTA

2. **No Technical Access**
   - No property ID visibility
   - No token management
   - No room mapping access
   - No direct sync controls

3. **Clear Support Path**
   - "Contact Support" button
   - Link to help documentation
   - Status notification if sync fails

## Data Model

### Existing Tables
```sql
-- hotels table (existing columns)
beds24_property_id        TEXT      -- Per-hotel Bed24 property ID

-- beds24_property_mappings (existing)
id                        UUID PRIMARY KEY
hotel_id                  UUID REFERENCES hotels(id)
beds24_property_id        TEXT
beds24_room_id            TEXT
room_type_id              UUID REFERENCES room_types(id)
created_at                TIMESTAMPTZ

-- beds24_sync_log (existing)
id                        UUID PRIMARY KEY
hotel_id                  UUID REFERENCES hotels(id)
direction                 TEXT -- 'inbound' | 'outbound'
event_type                TEXT
status                    TEXT -- 'success' | 'error'
error_message             TEXT
conflict_details          JSONB
processed_at              TIMESTAMPTZ
beds24_booking_id         TEXT
booking_id                UUID
```

### New/Updated Requirements
- **Audit logging**: Use existing audit_logs table
- **Rate limiting**: Add in-memory cache for API call tracking
- **Token management**: Keep in environment variables (no DB changes)

## UI/UX Components

### Platform Admin Components

#### HotelSelector Component
```typescript
<HotelSelector 
  value={selectedHotelId}
  onChange={setSelectedHotelId}
  showStatus={true} // Show connection badge
/>
```

#### ConnectionStatusCard Component
```typescript
<ConnectionStatusCard
  hotel={hotel}
  propertyId={propertyId}
  lastSync={lastSyncTime}
  isConfigured={isConfigured}
  onTest={handleTest}
  onSave={handleSave}
/>
```

#### RoomMappingTable Component
```typescript
<RoomMappingTable
  mappings={mappings}
  onAdd={handleAddMapping}
  onEdit={handleEditMapping}
  onDelete={handleDeleteMapping}
/>
```

#### SyncLogsPanel Component
```typescript
<SyncLogsPanel
  hotelId={selectedHotelId}
  logs={logs}
  stats={stats}
  onRefresh={refreshLogs}
  onExport={exportCsv}
/>
```

### Hotel Components

#### IntegrationStatusCard Component
```typescript
<IntegrationStatusCard
  name="Bed24"
  icon={<Building2 />}
  status="connected" | "disconnected" | "error"
  lastSync={lastSyncTime}
  successRate={98}
  description="Your rooms are synced with Booking.com and other OTAs"
  supportAction={<Button>Contact Support</Button>}
/>
```

## Server Actions

### Platform Admin Actions (`app/platform/(protected)/dashboard/_actions.ts`)

```typescript
// Bed24 configuration per hotel
export async function updateBed24ConfigForHotel(hotelId: string, propertyId: string)
export async function testBed24ConnectionForHotel(hotelId: string)
export async function forceSyncForHotel(hotelId: string)

// Room mapping management
export async function createRoomMapping(data: RoomMappingInput)
export async function updateRoomMapping(id: string, data: RoomMappingInput)
export async function deleteRoomMapping(id: string)
export async function getRoomMappings(hotelId: string)

// Sync monitoring
export async function getSyncLogsForHotel(hotelId: string, filters: LogFilters)
export async function getChannelStatsForHotel(hotelId: string)
export async function exportSyncLogs(hotelId: string, filters: LogFilters)

// All require platform admin role check
```

### Hotel Actions (`app/actions/integrations.ts` - refactored)

```typescript
// Read-only status queries (available to hotel staff)
export async function getIntegrationStatus()
export async function getLastSyncTime()
export async function getIntegrationHealth()

// Technical operations (restricted to platform admins)
// These will redirect or throw if called by hotel staff
```

## Security & Authorization

### Role Hierarchy
```
platform_admin > super_admin (hotel) > admin (hotel) > staff (hotel)
```

### Access Control Matrix

| Action | Platform Admin | Hotel Super Admin | Hotel Admin | Hotel Staff |
|--------|----------------|-------------------|-------------|-------------|
| View integration status | ✅ | ✅ | ✅ | ✅ |
| Configure property ID | ✅ | ❌ | ❌ | ❌ |
| Manage room mappings | ✅ | ❌ | ❌ | ❌ |
| Force sync | ✅ | ❌ | ❌ | ❌ |
| View detailed logs | ✅ | ❌ | ❌ | ❌ |
| Refresh tokens | ✅ | ❌ | ❌ | ❌ |

### Implementation
```typescript
async function assertPlatformAdmin() {
  const supabase = await createPlatformClient();
  const { data, error } = await supabase.auth.getClaims();
  
  if (error || !data?.claims) throw new Error("Not authenticated");
  
  const { data: admin } = await supabaseAdmin
    .from("platform_admins")
    .select("id, role, is_active")
    .eq("supabase_user_id", data.claims.sub)
    .single();
    
  if (!admin || !admin.is_active) {
    throw new Error("Platform admin access required");
  }
  
  return { adminId: admin.id, role: admin.role };
}
```

## Error Handling

### Platform Admin Errors
- **Connection Failed**: Show detailed error message, suggest token refresh
- **Invalid Property ID**: Highlight field, show validation message
- **Mapping Conflict**: Show which room is already mapped
- **API Rate Limit**: Show cooldown timer, suggest retry time
- **Sync Failed**: Show full error log, offer retry button

### Hotel User Errors
- **Connection Down**: "Integration temporarily unavailable. Support has been notified."
- **Sync Failed**: "Last sync failed. Our team is investigating."
- **Generic Error**: "Something went wrong. Contact support if this persists."

## Rate Limiting Strategy

### Implementation
```typescript
// In-memory rate limiter
class Bed24RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CREDITS = 100;
  
  async checkLimit(key: string, cost: number): Promise<boolean> {
    // Track requests and enforce 100 credits per 5-min window
  }
}
```

### Cost Mapping
- Token refresh: 1 credit
- Property fetch: 2 credits
- Availability push: 5 credits per room
- Booking fetch: 3 credits
- Logs query: 1 credit

## Migration Plan

### Phase 1: Create Platform Admin Interface
1. Create `/platform/dashboard/integrations` page
2. Add hotel selector component
3. Build Bed24 configuration UI
4. Implement room mapping CRUD
5. Create sync monitoring dashboard

### Phase 2: Refactor Hotel Interface
1. Create simplified status card component
2. Replace existing integrations page
3. Move notification settings
4. Add support CTAs

### Phase 3: Update Server Actions
1. Add platform admin actions
2. Add role guards to existing actions
3. Update audit logging
4. Implement rate limiting

### Phase 4: Testing & Deployment
1. Test platform admin features
2. Test hotel user restrictions
3. Verify audit logs
4. Load test rate limiter
5. Deploy with feature flag

## Rollback Plan

If issues arise:
1. Feature flag to toggle new UI
2. Database migrations are additive (no data loss)
3. Keep old integration actions as fallback
4. Monitor error rates and rollback if > 5%

## Success Metrics

1. **User Experience**
   - Hotel users find integration status in < 10 seconds
   - Zero support tickets about "how to configure Bed24"

2. **Operational**
   - Platform admins configure new hotel in < 5 minutes
   - 100% of configuration changes logged
   - API rate limit never exceeded

3. **Reliability**
   - Sync success rate > 99%
   - Error recovery time < 5 minutes
   - Zero unauthorized access attempts succeed

## Future Enhancements

1. **Automated Setup**
   - Wizard for onboarding new hotels
   - Auto-detect room mapping from Bed24

2. **Advanced Monitoring**
   - Real-time sync alerts
   - Anomaly detection
   - Performance analytics

3. **Multi-Channel**
   - Support other channel managers
   - Unified interface for all integrations
   - Channel comparison analytics
