import { redirect } from "next/navigation";

/** Hotel Oversight now lives at /platform — kept as a permanent redirect. */
export default function PlatformDashboardRedirect() {
  redirect("/platform");
}
