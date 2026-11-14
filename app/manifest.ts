import type { MetadataRoute } from "next";
import { LAUNCH_BACKGROUND } from "@/lib/brand/splash";

// Icons are generated from lib/brand/mark.ts by `pnpm icons`. Each purpose gets
// its own entry: a single icon tagged "any maskable" is either padded too much
// as a launcher icon or cropped as an adaptive one (MDN › Manifest › icons).
const icons: NonNullable<MetadataRoute.Manifest["icons"]> = [
  { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
  { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  // Full-bleed with the glyph inside the 40%-radius safe zone (web.dev › Maskable icons).
  { src: "/icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
  { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  // Alpha-only silhouette; the platform supplies the fill colour.
  { src: "/icons/icon-monochrome-512.png", sizes: "512x512", type: "image/png", purpose: "monochrome" },
];

const shortcutIcons = [{ src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png" }];

export default function manifest(): MetadataRoute.Manifest {
  return {
    // `id` is the installed app's identity: changing it orphans existing installs.
    id: "/dashboard",
    name: "RoomLine",
    short_name: "RoomLine",
    description: "Hotel management and direct booking platform",
    lang: "en",
    dir: "ltr",
    start_url: "/dashboard",
    // "/" so sign-in, onboarding and invites stay inside the installed app
    // window instead of opening a browser bar when the session has expired.
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    // Android builds its splash from background_color + the largest `any` icon.
    // Both colours equal the dashboard's background and header, so launch goes
    // splash → header with no flash or colour jump (iOS: lib/brand/splash.ts).
    background_color: LAUNCH_BACKGROUND,
    theme_color: LAUNCH_BACKGROUND,
    orientation: "any",
    categories: ["business", "productivity", "travel"],
    prefer_related_applications: false,
    icons,
    shortcuts: [
      {
        name: "Calendar",
        short_name: "Calendar",
        description: "Room calendar and occupancy",
        url: "/dashboard/calendar",
        icons: shortcutIcons,
      },
      {
        name: "Bookings",
        short_name: "Bookings",
        description: "Arrivals, departures and reservations",
        url: "/dashboard/bookings",
        icons: shortcutIcons,
      },
    ],
  };
}
