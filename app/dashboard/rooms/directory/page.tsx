import { permanentRedirect } from "next/navigation";

// Room directory merged into /dashboard/rooms — permanent redirect for old links/bookmarks.
export default function RoomsDirectoryRedirect() {
  permanentRedirect("/dashboard/rooms");
}
