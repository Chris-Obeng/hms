import { SignOutButton } from "@clerk/nextjs";
import { buttonVariants } from "@heroui/react";
import { Pause, ShieldCheck } from "lucide-react";
import { AuthShell } from "@/components/brand/auth-shell";
import { SUSPENSION_REASONS, type SuspensionReason } from "@/lib/platform/suspension";

export type SuspendedViewProps = {
  hotelName: string;
  status: "suspended" | "cancelled";
  /** Owners can act on the reason; everyone else is pointed at the owner. */
  isOwner: boolean;
  reason: SuspensionReason | null;
  owner: { name: string | null; email: string | null } | null;
  supportEmail: string;
  userEmail: string | null;
};

function mailto(to: string, subject: string) {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}`;
}

/**
 * What hotel users see while their hotel's access is paused. Calm, specific,
 * and never a dead end: there is always a way to reach someone and to sign out.
 */
export function SuspendedView({
  hotelName,
  status,
  isOwner,
  reason,
  owner,
  supportEmail,
  userEmail,
}: SuspendedViewProps) {
  const closed = status === "cancelled";
  const why = SUSPENSION_REASONS[reason ?? "other"];
  const ownerLabel = owner?.name?.split(/\s+/)[0] ?? "your hotel's owner";

  const title = closed ? `${hotelName}'s account is closed` : `Access to ${hotelName} is paused`;
  const body = closed
    ? isOwner
      ? "This RoomLine account was closed. Contact support if you'd like to reopen it."
      : `This RoomLine account was closed. ${owner?.name ?? "Your hotel's owner"} can tell you more.`
    : isOwner
      ? why.owner
      : why.staff;

  const supportHref = mailto(
    supportEmail,
    reason === "billing" ? `Billing for ${hotelName}` : `Access for ${hotelName}`,
  );

  const primary =
    isOwner || !owner?.email ? (
      <a href={supportHref} className={buttonVariants({ size: "lg" })}>
        {reason === "billing" && isOwner && !closed ? "Settle billing with support" : "Contact support"}
      </a>
    ) : (
      <a href={mailto(owner.email, `RoomLine access for ${hotelName}`)} className={buttonVariants({ size: "lg" })}>
        Email {ownerLabel}
      </a>
    );

  return (
    <AuthShell
      width="status"
      footer={
        <span>
          {userEmail ? `Signed in as ${userEmail} · ` : ""}
          Support: <a className="rl-link" href={supportHref}>{supportEmail}</a>
        </span>
      }
    >
      <span className="rl-status-mark" data-tone="sun">
        <Pause size={20} aria-hidden="true" />
      </span>
      <div className="rl-screen-head">
        <h1 className="rl-title">{title}</h1>
        <p className="rl-sub">{body}</p>
      </div>

      {!closed ? (
        <dl className="rl-facts-card">
          <div>
            <dt>Reason</dt>
            <dd>{why.title}</dd>
          </div>
          <div>
            <dt>Booking page</dt>
            <dd>Paused, no new bookings</dd>
          </div>
          <div>
            <dt>{isOwner ? "Who can restore it" : "Who to ask"}</dt>
            <dd>{isOwner ? "You, with RoomLine support" : (owner?.name ?? "Your hotel's owner")}</dd>
          </div>
        </dl>
      ) : null}

      {!closed ? (
        <p className="rl-assure">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>
            Your bookings, guests and payment records are kept as they are. Nothing is deleted while
            access is paused.
          </span>
        </p>
      ) : null}

      <div className="rl-screen-actions">
        {primary}
        {!isOwner && owner?.email ? (
          <a href={supportHref} className={buttonVariants({ size: "lg", variant: "outline" })}>
            Contact RoomLine support
          </a>
        ) : null}
        <SignOutButton redirectUrl="/sign-in">
          <button type="button" className={buttonVariants({ size: "lg", variant: "ghost" })}>
            Sign out
          </button>
        </SignOutButton>
      </div>
    </AuthShell>
  );
}
