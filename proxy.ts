import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export default clerkMiddleware(async (auth, req) => {
  const { userId, orgId } = await auth();
  const isOnboarding = req.nextUrl.pathname.startsWith("/onboarding");
  const isDashboard = req.nextUrl.pathname.startsWith("/dashboard");

  if (!userId && isDashboard) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  // Signed in but no org = hasn't completed onboarding
  if (userId && !orgId && !isOnboarding) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
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
