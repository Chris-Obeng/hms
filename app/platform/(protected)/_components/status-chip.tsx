import { Chip } from "@heroui/react";

const STATUS_CHIP: Record<
  string,
  { color: "success" | "warning" | "danger" | "default"; label: string }
> = {
  active: { color: "success", label: "Active" },
  pending: { color: "warning", label: "Pending" },
  suspended: { color: "danger", label: "Suspended" },
  cancelled: { color: "default", label: "Cancelled" },
};

export function StatusChip({ status }: { status: string | null }) {
  const s = STATUS_CHIP[status ?? "pending"] ?? STATUS_CHIP.cancelled;
  return (
    <Chip size="sm" variant="soft" color={s.color}>
      {s.label}
    </Chip>
  );
}
