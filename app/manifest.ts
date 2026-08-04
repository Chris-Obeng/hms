import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "RoomLine",
    short_name: "RoomLine",
    description: "Hotel management and direct booking platform",
    start_url: "/dashboard",
    scope: "/dashboard",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#FAFAF8",
    theme_color: "#1C1917",
    orientation: "any",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-180x180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcuts: [
      {
        name: "New Booking",
        short_name: "Book",
        url: "/dashboard/bookings?new=1",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Housekeeping",
        short_name: "Rooms",
        url: "/dashboard/housekeeping",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
