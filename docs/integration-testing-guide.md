# Bed24 Integration Testing Guide

## Overview

This guide provides step-by-step testing procedures for verifying the Bed24 integration refactoring works correctly.

---

## Pre-Testing Setup

### 1. Database Migration

```bash
npx supabase migration up
```

**Verify**: `platform_admin_audit_logs` table created

### 2. Environment Variables

```bash
BEDS24_REFRESH_TOKEN="your-refresh-token"
BEDS24_API_TOKEN="your-access-token"
```

### 3. Test Accounts

- Platform admin account (active)
- Hotel with Bed24 configured
- Hotel without Bed24 configured
- Hotel staff accounts (super_admin, admin, staff roles)

---

## Task 19: Test Hotel View (/dashboard/settings/integrations)

### Access Control Tests

✓ Super admin can access  
✓ Admin can access  
✓ Staff sees "Admin Access Required"

### Status Display Tests

**Bed24 Configured:**
- Shows "Connected" badge (green)
- Displays 3 metrics (status, last sync, success rate)
- "View Sync Details" expands recent activity
- Shows last 5 sync events

**Bed24 Not Configured:**
- Shows "Not Setup" badge (gray)
- "Contact Support to Setup" button
- Opens email with pre-filled subject

**Bed24 Errors:**
- Shows "Warning" or "Error" badge
- Alert message about errors
- Error count displayed
- "Need Help?" opens support email

### UI Tests

✓ FAQ accordion expands/collapses  
✓ Error boundary catches errors  
✓ Loading skeleton displays  
✓ Responsive on mobile and desktop

---

## Task 20: Test Platform Admin (/platform/dashboard/integrations)

### Access Control

✓ Platform admin can access  
✓ Hotel users redirected/blocked

### Hotel Selection

✓ Dropdown shows all hotels  
✓ Displays status badges  
✓ Switching hotels loads correct data

### Connection Tab

✓ Stats cards display (success rate, total, errors, last sync)  
✓ Save Property ID → success toast → audit log  
✓ Test Connection → shows property count  
✓ Force Sync → creates sync log entry  
✓ Rate limit error when quota exceeded

### Room Mappings Tab

✓ Table displays existing mappings  
✓ Add Mapping → modal → create → audit log  
✓ Edit Mapping → modal → update → audit log  
✓ Delete Mapping → confirm → remove → audit log  
✓ Validation errors for invalid input

### Sync Logs Tab

✓ Table displays recent logs  
✓ Direction/Status/Event filters work  
✓ Search filters logs  
✓ Export CSV downloads file  
✓ Error details expand/collapse  
✓ Refresh updates data

### Error Handling

✓ Error boundary displays friendly message  
✓ Loading skeleton shows during data fetch  
✓ Rate limiter prevents quota overrun

### Audit Logging

Query database to verify:
```sql
SELECT * FROM platform_admin_audit_logs 
ORDER BY created_at DESC LIMIT 10;
```

✓ All actions logged with admin identity  
✓ Before/after states captured  
✓ Timestamps recorded

---

## Rate Limiting Tests

### Test Scenarios

1. **Normal Usage**: Operations succeed within quota
2. **Heavy Load**: 20-room sync uses 100 credits
3. **Quota Exceeded**: Shows clear error with reset time
4. **Recovery**: Quota resets after 5 minutes

### Expected Behavior

✓ Tracks credits per operation  
✓ Prevents requests when quota full  
✓ Shows helpful error messages  
✓ Displays remaining credits

---

## Testing Checklist

### Platform Admin Dashboard
- [ ] Access control enforced
- [ ] Hotel selector functional
- [ ] Connection tab operations work
- [ ] Room mappings CRUD complete
- [ ] Sync logs display and filter
- [ ] CSV export downloads
- [ ] Rate limiting active
- [ ] Audit logs created
- [ ] Error boundaries catch errors
- [ ] Loading states display

### Hotel Dashboard
- [ ] Role-based access works
- [ ] Status displays correctly
- [ ] Metrics accurate
- [ ] Recent activity expands
- [ ] FAQ accordion works
- [ ] Support emails open
- [ ] Error handling graceful
- [ ] Responsive design

### Cross-Cutting
- [ ] TypeScript compiles
- [ ] No console errors
- [ ] HeroUI components render
- [ ] Accessibility compliant
- [ ] Database migrations apply

---

## Bug Reporting

**Format:**
```
Title: [Brief description]
Steps: 1. Navigate to... 2. Click...
Expected: [What should happen]
Actual: [What happened]
Role: [Platform Admin/Hotel Admin]
Browser: [Chrome/Firefox]
```

---

**Testing Complete**: Mark tasks 19-20 as tested and verified.
