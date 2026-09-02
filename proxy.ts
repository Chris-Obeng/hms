import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";


// Public routes for the hotel staff dashboard (no Clerk auth needed)
const isPublicDashboardRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding(.*)",
  "/api/webhooks(.*)",
  "/api/booking(.*)",
  "/join(.*)",
]);

/**
 * Sentry's same-origin ingest tunnel (`tunnelRoute` in next.config.ts).
 *
 * It cannot sit behind the Clerk gate — the public booking pages report guest-side
 * errors through it before anyone signs in — but "unauthenticated" must not mean
 * "unmetered". Sentry's handler forwards only to this project's DSN, so the route
 * cannot be pointed at another org; what it can do is accept envelopes from anyone
 * who knows the path, and every accepted envelope spends this project's event
 * quota. That quota is shared with the payment alerts that need to page a human,
 * so the tunnel is throttled and method-restricted in the proxy below rather than
 * merely exempted from auth.
 */
const isMonitoringTunnel = createRouteMatcher(["/monitoring(.*)"]);

/**
 * Envelopes per minute per IP allowed through the tunnel.
 *
 * Well above what a real session produces: the browser SDK applies its own
 * client-side rate limiting and batches replay segments, so a guest hitting a
 * genuinely broken checkout still sends single digits of envelopes. The number
 * exists to cap a script, not to shape normal traffic.
 */
const TUNNEL_LIMIT_PER_MINUTE = 120;

// Guest booking routes — fully public, path-based slug routing
const isBookingRoute = createRouteMatcher([
  "/:slug((?!dashboard|platform|sign-in|sign-up|onboarding|api|_next).*)",
  "/:slug/rooms(.*)",
  "/:slug/book(.*)",
]);

// Platform admin routes — use Supabase Auth, NOT Clerk
const isPlatformRoute = createRouteMatcher(["/platform(.*)"]);

// Platform sign-in is public (unauthenticated entry point)
// Platform auth/sign-out is also public — it must run unconditionally so it
// can clear the session cookie (layouts cannot set cookies, so sign-out MUST
// go through this route handler; the middleware must not redirect it away).
const isPlatformPublic = createRouteMatcher([
  "/platform/sign-in(.*)",
  "/platform/auth/sign-out(.*)",
]);
// ── Platform: Supabase session refresh ───────────────────────────
//
// Per Supabase UI docs (2026): middleware MUST run updateSession so tokens
// are refreshed on every request and written back to cookies.
// We use getClaims() — local JWT verification, no network round-trip.
//
async function updatePlatformSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Propagate cookies to both the request and response
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Must call getClaims() between createServerClient and any redirect
  // to keep the session alive. Do NOT put any logic between these two.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  // Not authenticated and not on a public platform route → redirect to sign-in
  if (!user && !isPlatformPublic(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/platform/sign-in";
    return NextResponse.redirect(url);
  }

  // Already authenticated and hitting sign-in (only) → redirect to dashboard
  // Note: /platform/auth/sign-out is intentionally NOT redirected — it must
  // run so it can clear the session cookie.
  const isSignIn = request.nextUrl.pathname.startsWith("/platform/sign-in");
  if (user && isSignIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/platform";
    return NextResponse.redirect(url);
  }

  return response;
}

// ── Main proxy ───────────────────────────────────────────────────

export default clerkMiddleware(async (auth, req) => {
  // Turbopack builds skip Sentry's build-time middleware instrumentation, so a
  // throw here would otherwise go unreported — and a failure in this file locks
  // every authenticated user out of the dashboard at once. Capture, flush (the
  // edge isolate can be frozen immediately after), then rethrow unchanged.
  try {
    const { pathname } = req.nextUrl;

    // Platform admin: handled entirely by Supabase Auth (no Clerk involvement)
    if (isPlatformRoute(req)) {
      return updatePlatformSession(req);
    }

    // Sentry ingest tunnel — public, but throttled and POST-only. Checked before
    // the public-route pass-through so the throttle cannot be skipped, and before
    // `auth()` so a flood never costs a Clerk call.
    if (isMonitoringTunnel(req)) {
      if (req.method !== "POST") {
        // The tunnel only ever receives envelope POSTs; anything else is a probe.
        return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
      }

      const tunnel = await rateLimit(req, {
        name: "sentry-tunnel",
        limit: TUNNEL_LIMIT_PER_MINUTE,
        windowSeconds: 60,
      });

      if (!tunnel.ok) {
        return new NextResponse(null, {
          status: 429,
          headers: { "Retry-After": String(tunnel.retryAfterSeconds) },
        });
      }

      return NextResponse.next();
    }

    // Public routes — pass through without auth check
    if (isPublicDashboardRoute(req) || isBookingRoute(req)) {
      return NextResponse.next();
    }

    // Hotel admin dashboard — require Clerk auth
    const { userId, orgId } = await auth();
    const isOnboarding = pathname.startsWith("/onboarding");

    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }
    // Do not redirect authenticated users while active organization claim is
    // briefly absent during Clerk session refresh. Dashboard layout owns final
    // onboarding decision after server auth settles.
    if (userId && orgId && isOnboarding) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { "roomline.scope": "proxy" },
      contexts: { proxy: { pathname: req.nextUrl.pathname } },
    });
    await Sentry.flush(2000);
    throw error;
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
