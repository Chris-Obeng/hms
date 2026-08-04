# Platform Admin Integration Management Documentation

## Overview

The Platform Admin Integration Management system allows RoomLine platform administrators to configure and monitor Bed24 channel manager integrations for all hotels in the system.

**Access**: `/platform/dashboard/integrations`

**Required Role**: Platform Admin (active status required)

---

## Quick Start

### Setting Up Bed24 for a New Hotel

1. **Obtain Property ID**
   - Get the Property ID from hotel's Bed24 account (Settings → Properties)

2. **Configure in RoomLine**
   - Select hotel from dropdown
   - Go to Connection tab
   - Enter Property ID and click Save
   - Click Test Connection to verify

3. **Create Room Mappings**
   - Go to Room Mappings tab
   - Click Add Mapping
   - Map each RoomLine room type to its Bed24 room ID

4. **Initialize Sync**
   - Click Force Full Sync
   - Monitor in Sync Logs tab
   - Verify success rate > 95%

---

## Features

### Hotel Selection

Use the dropdown to switch between hotels. Shows:
- Hotel name and status
- Connection status (Connected/Not configured)
- Last sync time

### Connection Tab

**Configure Bed24 Integration:**
- Set Property ID per hotel
- Test master API connection
- Force full availability sync
- View health metrics (success rate, total syncs, errors)

**Master Token Status:**
- Shared across all hotels
- Auto-refreshes every 24h
- Manual refresh available if needed

### Room Mappings Tab

**Manage Channel Mappings:**
- Create new mappings (RoomLine room type → Bed24 room ID)
- Edit existing mappings
- Delete outdated mappings
- View mapping status (active/inactive)

**Important**: Each room type can only be mapped once.

### Sync Logs Tab

**Monitor Sync Activity:**
- View all sync events (inbound/outbound)
- Filter by direction, status, event type
- Search logs by keywords
- Export to CSV for reporting
- Expand errors for detailed troubleshooting

**Metrics Displayed:**
- Success rate (should be > 95%)
- Total syncs and last 24h activity
- Error count
- Last outbound sync time

---

## Common Tasks

### Troubleshooting Sync Errors

1. **Check Sync Logs**
   - Go to Sync Logs tab
   - Filter by status: Error
   - Click "View error" on failed entries

2. **Common Issues:**
   - **Room mapping not found**: Create missing mapping
   - **Property ID invalid**: Verify Property ID is correct
   - **Rate limit exceeded**: Wait 5 minutes, avoid frequent syncs
   - **Token expired**: Use Test Connection to refresh

3. **Resolution Steps:**
   - Verify room mappings exist for all room types
   - Check Property ID matches hotel's Bed24 account
   - Run Force Full Sync after fixing issues
   - Monitor for 24h to ensure stability

### Adding a New Room Type

When a hotel adds a new room type:

1. Confirm room type is created in RoomLine
2. Get Bed24 room ID from hotel's Bed24 account
3. Go to Room Mappings tab
4. Click Add Mapping
5. Fill in:
   - Bed24 Property ID (same as hotel's)
   - Bed24 Room ID (from step 2)
   - RoomLine Room Type (new room type)
6. Click Create Mapping
7. Run Force Full Sync to initialize

### Monitoring Hotel Health

**Daily Checks:**
- Review error counts in dashboard
- Investigate hotels with > 5 errors
- Check for hotels with no sync in 24h

**Red Flags:**
- Success rate < 95%
- No sync in > 2 hours (active hotels)
- Increasing error trends

**Action Items:**
- Contact hotel if issues persist
- Review recent configuration changes
- Check Bed24 API status

---

## Best Practices

### Security

✅ **Do:**
- Verify hotel identity before changes
- Test connection before force sync
- Document manual interventions
- Review audit logs regularly

❌ **Don't:**
- Share master API credentials
- Delete mappings without confirmation
- Run unnecessary force syncs (rate limits)
- Modify multiple hotels simultaneously

### Maintenance

**Weekly:**
- Review success rates across all hotels
- Audit new room mappings
- Check token expiry status

**Monthly:**
- Export logs for compliance reporting
- Review sync health trends
- Update documentation as needed

---

## Rate Limiting

Bed24 API limits: **100 credits per 5 minutes**

**Request Costs:**
- Token refresh: 1 credit
- Property fetch: 2 credits
- Availability push: 5 credits per room
- Booking fetch: 3 credits

**Tip**: Avoid unnecessary force syncs. Automatic syncs occur every few hours.

---

## Audit Logging

All actions are automatically logged:
- Admin identity (ID and email)
- Action type and timestamp
- Hotel affected
- Before/After state
- Entity details

Logs are retained indefinitely for compliance.

---

## API Endpoints

### Key Server Actions

```typescript
// Get all hotels with sync status
getAllHotelsForSelection()

// Get hotel's Bed24 config
getBed24ConfigForHotel(hotelId: string)

// Update Property ID
updateBed24ConfigForHotel({
  hotelId: string,
  propertyId: string
})

// Test master API connection
testBed24ConnectionForHotel()

// Force full availability sync
forceSyncForHotel(hotelId: string)

// Room mapping CRUD
createRoomMapping(input: RoomMappingInput)
updateRoomMapping(id: string, input: Partial<RoomMappingInput>)
deleteRoomMapping(id: string)
getRoomMappingsForHotel(hotelId: string)

// Sync monitoring
getSyncLogsForHotel(filters: SyncLogFilters)
getChannelStatsForHotel(hotelId: string)
exportSyncLogsForHotel(filters: SyncLogFilters)
```

---

## Support

- **Technical Issues**: support@RoomLineprp.com
- **Bed24 Support**: https://beds24.com/support
- **Emergency**: Contact dev team in #platform-admins Slack

---

## Environment Variables

Required in `.env.local` or production environment:

```bash
# Bed24 V2 API (master credentials)
BEDS24_REFRESH_TOKEN="your-refresh-token"
BEDS24_API_TOKEN="your-access-token"
```

These are shared across all hotels. Each hotel has a separate Property ID.

---

**Last Updated**: 2026-07-21  
**Version**: 1.0  
**Maintained By**: RoomLine Platform Team
