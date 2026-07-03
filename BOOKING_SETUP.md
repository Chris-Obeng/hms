# Booking Page Setup Guide

## Quick Start

### 1. Access Your Hotel's Booking Page

Go to **Dashboard → Settings → Hotel Profile** to see your unique booking URL.

### 2. Development Access Methods

**Option A: Query Parameter (Easiest)**
```
http://localhost:3000/book?__slug=your-hotel-slug
```

**Option B: Subdomain (Closest to Production)**

1. Get your hotel slug from Settings page
2. Add to your `hosts` file:

**Windows:** `C:\Windows\System32\drivers\etc\hosts`
**Mac/Linux:** `/etc/hosts`

```
127.0.0.1 your-hotel-slug.localhost
```

3. Visit: `http://your-hotel-slug.localhost:3000`

**Option C: Environment Variable**

Add to `.env.local`:
```
NEXT_PUBLIC_DEV_HOTEL_SLUG=your-hotel-slug
```

Then visit `http://localhost:3000/book`

### 3. Production Setup

Update `.env.local` (or production env):
```
NEXT_PUBLIC_BASE_DOMAIN=yourdomain.com
```

Booking pages will be at: `https://hotel-slug.yourdomain.com`

## How It Works

- **Proxy middleware** (`proxy.ts`) detects subdomains and injects hotel slug
- **Booking pages** (`app/(booking)/*`) read `x-hotel-slug` header
- **Settings page** displays the auto-generated booking URL
- **No hardcoded domains** - all use `NEXT_PUBLIC_BASE_DOMAIN` env var

## Troubleshooting

**"Hotel not found" error?**
- Check hotel has a `slug` in database
- Verify slug matches what you're using in URL/env
- Check hotel `status = 'active'`

**Subdomain not working?**
- Verify `hosts` file entry saved correctly
- Clear browser cache
- Try different browser
- Restart dev server after `.env.local` changes
