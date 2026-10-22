import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";


const isPublicDashboardRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding(.*)",
  "/api/webhooks(.*)",
  "/api/booking(.*)",
  "/join(.*)",
]);

const isMonitoringTunnel = createRouteMatcher(["/monitoring(.*)"]);

const TUNNEL_LIMIT_PER_MINUTE = 120;

// Guest booking routes — fully public, path-based slug routing
const isBookingRoute = createRouteMatcher([
  "/:slug((?!dashboard|platform|sign-in|sign-up|onboarding|api|_next).*)",
  "/:slug/rooms(.*)",
  "/:slug/book(.*)",
]);

// Platform admin routes — use Supabase Auth, NOT Clerk
const isPlatformRoute = createRouteMatcher(["/platform(.*)"]);


const isPlatformPublic = createRouteMatcher([
  "/platform/sign-in(.*)",
  "/platform/auth/sign-out(.*)",
]);

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

  if (!user && !isPlatformPublic(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/platform/sign-in";
    return NextResponse.redirect(url);
  }

  const isSignIn = request.nextUrl.pathname.startsWith("/platform/sign-in");
  if (user && isSignIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/platform";
    return NextResponse.redirect(url);
  }

  return response;
}


export default clerkMiddleware(async (auth, req) => {
  try {
    const { pathname } = req.nextUrl;

    // Platform admin: handled entirely by Supabase Auth (no Clerk involvement)
    if (isPlatformRoute(req)) {
      return updatePlatformSession(req);
    }

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
    if (isPublicDashboardRoute(req) || isBookingRoute(req)) {
      return NextResponse.next();
    }

    const { userId, orgId } = await auth();
    const isOnboarding = pathname.startsWith("/onboarding");

    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

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
    // The public recovery document must not depend on an auth provider being reachable.
    "/((?!offline(?:/|$)|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
