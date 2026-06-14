import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/", "/api/webhooks(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, orgId } = await auth();
  const isOnboarding = req.nextUrl.pathname.startsWith("/onboarding");

  // If no user and trying to access a protected route (which includes onboarding), redirect to sign-in
  if (!userId && !isPublicRoute(req)) {
    return NextResponse.redirect(new URL("/sign-up", req.url)); // redirecting to sign-up instead of sign-in if they go to onboarding without account
  }

  // Signed in but no org = hasn't completed onboarding
  if (userId && !orgId && !isOnboarding && !isPublicRoute(req)) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  // If already onboarded (has orgId) but trying to access /onboarding, redirect to dashboard
  if (userId && orgId && isOnboarding) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for Clerk's auto-proxy path
    "/__clerk/:path*",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
