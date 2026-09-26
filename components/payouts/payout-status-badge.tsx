import { Chip } from "@heroui/react";
import type { PayoutStatus } from "@/lib/payouts";

/**
 * Per-reservation payout state, shown identically on the hotel Payouts tab and
 * the platform hotel-detail page. "Awaiting" folds in Paystack "processing"
 * (money in transit but not yet in the bank) so hoteliers see one clear state.
 */
const PAYOUT_CHIP: Record<
  PayoutStatus,
  { color: "success" | "warning" | "danger" | "default"; label: string }
> = {
  paid_out: { color: "success", label: "Paid out" },
  processing: { color: "warning", label: "Processing" },
  awaiting: { color: "default", label: "Awaiting payout" },
  failed: { color: "danger", label: "Failed" },
};

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const s = PAYOUT_CHIP[status] ?? PAYOUT_CHIP.awaiting;
  return (
    <Chip size="sm" variant="soft" color={s.color}>
      {s.label}
    </Chip>
  );
}
