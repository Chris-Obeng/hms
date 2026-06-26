import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "hotelosprp.com";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/booking(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const host = req.headers.get("host") ?? "";
  const { pathname } = req.nextUrl;

  const isApp = host === `app.${BASE_DOMAIN}` || host.startsWith("localhost");
  const isPlatform = host === `platform.${BASE_DOMAIN}`;
  const isBooking =
    !isApp &&
    !isPlatform &&
    (host.endsWith(`.${BASE_DOMAIN}`) || !host.includes(BASE_DOMAIN));

  // Booking app: inject hotel slug, no auth
  if (isBooking && !isApp) {
    const slug = host.endsWith(`.${BASE_DOMAIN}`)
      ? host.replace(`.${BASE_DOMAIN}`, "")
      : host;
    const res = NextResponse.next();
    res.headers.set("x-hotel-slug", slug);
    return res;
  }

  // Dev: local booking app override via ?__slug= or NEXT_PUBLIC_DEV_HOTEL_SLUG
  const devSlug = req.nextUrl.searchParams.get("__slug") ?? process.env.NEXT_PUBLIC_DEV_HOTEL_SLUG;
  if (isApp && devSlug && (pathname.startsWith("/book") || pathname === "/" || pathname.startsWith("/rooms"))) {
    const res = NextResponse.next();
    res.headers.set("x-hotel-slug", devSlug);
    return res;
  }

  // Admin / Platform: Clerk auth protection
  const { userId, orgId } = await auth();
  const isOnboarding = pathname.startsWith("/onboarding");

  if (!userId && !isPublicRoute(req)) {
    return NextResponse.redirect(new URL("/sign-up", req.url));
  }

  if (userId && !orgId && !isOnboarding && !isPublicRoute(req)) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  if (userId && orgId && isOnboarding) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
