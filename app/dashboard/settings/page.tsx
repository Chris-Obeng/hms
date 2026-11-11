import { redirect } from "next/navigation";

/** The rail lives in the layout; the hub route opens on the hotel profile. */
export default function SettingsPage() {
  redirect("/dashboard/settings/hotel");
}
