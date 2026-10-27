import { redirect } from "next/navigation";

export default function PaymentTransactionsPage() {
  redirect("/dashboard/payments?tab=activity");
}
