import { permanentRedirect } from "next/navigation";

// Availability merged into the rates grid (Rooms › Rates) — redirect for old links/bookmarks.
export default function AvailabilityRedirect() {
  permanentRedirect("/dashboard/rooms/pricing");
}
