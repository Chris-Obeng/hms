import { redirect } from "next/navigation";

export default function PaymentsSettingsPage() {
  redirect("/dashboard/payments?tab=setup");
}
