import { permanentRedirect } from "next/navigation";

// Room types merged into /dashboard/rooms — permanent redirect for old links/bookmarks.
export default function RoomTypesRedirect() {
  permanentRedirect("/dashboard/rooms");
}
