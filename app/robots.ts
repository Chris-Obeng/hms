import type { MetadataRoute } from "next";

/**
 * Public pages (the landing page and each hotel's booking page) stay
 * crawlable; staff, platform and API routes are kept out of search results.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/platform", "/onboarding", "/api/"],
    },
  };
}
