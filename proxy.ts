import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// ── Route matchers ────────────────────────────────────────────────

// Public routes for the hotel staff dashboard (no Clerk auth needed)
const isPublicDashboardRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding(.*)",
  "/api/webhooks(.*)",
  "/api/booking(.*)",
  "/join(.*)",
]);

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
    url.pathname = "/platform/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

// ── Main proxy ───────────────────────────────────────────────────

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  // Platform admin: handled entirely by Supabase Auth (no Clerk involvement)
  if (isPlatformRoute(req)) {
    return updatePlatformSession(req);
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
  if (userId && !orgId && !isOnboarding) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }
  if (userId && orgId && isOnboarding) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
