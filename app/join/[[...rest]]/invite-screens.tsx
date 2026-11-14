import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@heroui/react";
import { Clock3, Link2Off, RefreshCw, UserRoundCheck } from "lucide-react";
import { AuthShell } from "@/components/brand/auth-shell";
import type { InviteProblem } from "@/app/actions/invitations";

/** What each invited role can do, in one line. Mirrors lib/roles.ts. */
const ROLES: Record<string, { label: string; body: string }> = {
  super_admin: { label: "Admin", body: "Full access, including staff, payouts and settings." },
  manager: { label: "Manager", body: "Rates, rooms, reports, staff invites and the night audit." },
  front_desk: { label: "Front desk", body: "Bookings, check-ins, check-outs and payments." },
  read_only: { label: "View only", body: "See bookings, rooms and reports without changing them." },
};

export function roleInfo(role: string) {
  return ROLES[role] ?? { label: role.replace(/_/g, " "), body: "Access set by your manager." };
}

/** "Sun 16 Nov, 14:05" in Accra time, formatted on the server. */
export function formatInviteExpiry(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Accra",
  }).format(new Date(iso));
}

/**
 * Who, where and as what: the three facts an invitee needs before anything
 * else. Shown above the form on every screen size.
 */
export function InviteCard({
  hotelName,
  role,
  inviterName,
  expiresLabel,
}: {
  hotelName: string;
  role: string;
  inviterName: string | null;
  expiresLabel?: string;
}) {
  const info = roleInfo(role);
  return (
    <section className="rl-invite-card" aria-labelledby="invite-hotel">
      <div className="rl-invite-hotel">
        <span className="rl-invite-avatar" aria-hidden="true">
          {hotelName.trim().charAt(0).toUpperCase() || "R"}
        </span>
        <div className="min-w-0">
          <p className="rl-invite-kicker">
            {inviterName ? `${inviterName} invited you to join` : "You're invited to join"}
          </p>
          <h1 id="invite-hotel" className="rl-invite-name">
            {hotelName}
          </h1>
        </div>
      </div>
      <div className="rl-invite-role">
        <p className="rl-invite-role-name">
          <span className="rl-chip">{info.label}</span>
          <span>Your role</span>
        </p>
        <p className="rl-invite-role-body">{info.body}</p>
      </div>
      {expiresLabel ? <p className="rl-invite-meta">Invite open until {expiresLabel}</p> : null}
    </section>
  );
}

const PROBLEMS: Record<
  InviteProblem | "missing",
  { icon: ReactNode; title: string; body: (hotel?: string) => string }
> = {
  missing: {
    icon: <Link2Off size={20} aria-hidden="true" />,
    title: "This invite link is incomplete",
    body: () =>
      "Open the link again from the original message, or ask the person who invited you to send it again.",
  },
  not_found: {
    icon: <Link2Off size={20} aria-hidden="true" />,
    title: "This invite link doesn't work",
    body: () =>
      "It may have been copied only in part, or replaced by a newer invite. Ask your manager for a fresh link.",
  },
  expired: {
    icon: <Clock3 size={20} aria-hidden="true" />,
    title: "This invite has expired",
    body: (hotel) =>
      `Invites stay open for 48 hours. Ask ${hotel ? `your manager at ${hotel}` : "your manager"} for a new link; it takes them a moment.`,
  },
  used: {
    icon: <UserRoundCheck size={20} aria-hidden="true" />,
    title: "This invite has already been used",
    body: (hotel) =>
      `If you accepted it, sign in to reach ${hotel ?? "your hotel"}. If you didn't, ask your manager for a new invite.`,
  },
  unavailable: {
    icon: <RefreshCw size={20} aria-hidden="true" />,
    title: "We couldn't check this invite",
    body: () => "Something went wrong on our side. Your invite is unchanged. Try again in a moment.",
  },
};

/** One friendly screen per reason an invite cannot be used, each with a next step. */
export function InviteProblemScreen({
  problem,
  hotelName,
  retryHref,
}: {
  problem: InviteProblem | "missing";
  hotelName?: string;
  retryHref?: string;
}) {
  const copy = PROBLEMS[problem];
  const primary =
    problem === "unavailable" && retryHref ? (
      <Link href={retryHref} className={buttonVariants({ size: "lg" })}>
        Try again
      </Link>
    ) : (
      <Link href="/sign-in" className={buttonVariants({ size: "lg" })}>
        Sign in
      </Link>
    );

  return (
    <AuthShell width="status">
      <span className="rl-status-mark">{copy.icon}</span>
      <div className="rl-screen-head">
        <h1 className="rl-title">{copy.title}</h1>
        <p className="rl-sub">{copy.body(hotelName)}</p>
      </div>
      <div className="rl-screen-actions">
        {primary}
        <Link href="/" className={buttonVariants({ size: "lg", variant: "outline" })}>
          Go to RoomLine
        </Link>
      </div>
    </AuthShell>
  );
}
