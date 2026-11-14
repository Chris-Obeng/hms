/**
 * Why a hotel's access was paused. Chosen by a platform admin when suspending
 * (recorded in platform_admin_audit_logs.after_state.reason) and shown, in
 * plain words, on /suspended. Pure data; safe to import anywhere.
 */
export const SUSPENSION_REASONS = {
  billing: {
    adminLabel: "Billing",
    title: "Billing needs attention",
    owner: "There's an unpaid balance on the account. Settle it and access comes back.",
    staff: "There's a billing matter on the account that your hotel's owner can sort out.",
  },
  review: {
    adminLabel: "Account review",
    title: "We're reviewing the account",
    owner: "We need a few details from you before access comes back. Reply to our email or contact support.",
    staff: "Oriel is reviewing the hotel's account with the owner.",
  },
  requested: {
    adminLabel: "Requested by the hotel",
    title: "Paused at the hotel's request",
    owner: "Access was paused at your request. Contact support whenever you're ready to resume.",
    staff: "Your hotel's owner asked Oriel to pause access for now.",
  },
  other: {
    adminLabel: "Other",
    title: "Access is paused",
    owner: "Contact support and we'll tell you what's needed to restore access.",
    staff: "Your hotel's owner has the details and can get access restored.",
  },
} as const;

export type SuspensionReason = keyof typeof SUSPENSION_REASONS;

export function isSuspensionReason(value: unknown): value is SuspensionReason {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SUSPENSION_REASONS, value);
}
