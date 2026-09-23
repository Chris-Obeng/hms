import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  turbopack: {},
  allowedDevOrigins: ["*.localhost:3000", "localhost:3000"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

/**
 * Sentry build-time wiring.
 *
 * This project builds with Turbopack, which means Sentry applies no build-time
 * code instrumentation — error capture comes entirely from `instrumentation.ts`
 * and `instrumentation-client.ts`. The webpack-only options (`webpack.treeshake`,
 * `disableLogger`, `excludeServerRoutes`, `autoInstrument*`) are therefore
 * omitted: they would silently no-op here.
 *
 * Source maps are left unconfigured on purpose. On a Turbopack build the SDK
 * enables `productionBrowserSourceMaps`, uploads the maps, and then deletes them
 * from the output so they are never served to the public — which is exactly the
 * posture we want. Setting either option by hand disables that default.
 */
export default withSentryConfig(nextConfig, {
  org: "chris-org-1k",
  project: "roomline",

  // Build-time secret, separate from the DSN. Absent locally, so a dev build
  // simply skips source map upload instead of failing.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload a wider set of client files so stack traces resolve inside
  // dynamically imported chunks (the booking wizard, the dashboard charts).
  widenClientFileUpload: true,

  // Same-origin ingest proxy. Without it ad blockers drop error reports from the
  // public booking pages — the exact surface where guest-side failures cost
  // money. `/monitoring` is exempt from the Clerk gate in `proxy.ts`, which
  // throttles it and restricts it to POST instead: the route relays envelopes to
  // this project's DSN, so an open one is a lever on the event quota.
  tunnelRoute: "/monitoring",

  // Keep local builds quiet; keep CI logs complete.
  silent: !process.env.CI,

  // Do not send build telemetry to Sentry.
  telemetry: false,
});
