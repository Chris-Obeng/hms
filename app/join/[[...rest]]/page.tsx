import { validateInviteToken } from "@/app/actions/invitations";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ProcessingInvite } from "./processing-invite";
import { JoinSignUp } from "./join-signup";
import { SignedInElsewhere } from "./signed-in-elsewhere";
import { InviteProblemScreen, formatInviteExpiry } from "./invite-screens";
import { getInviteTokenCookie } from "./actions";

async function isMemberOf(userId: string, clerkOrgId: string): Promise<boolean | null> {
  try {
    const clerk = await clerkClient();
    const memberships = await clerk.users.getOrganizationMembershipList({ userId });
    return memberships.data.some((m) => m.organization.id === clerkOrgId);
  } catch (err) {
    console.error("Failed to check org membership:", err);
    return null;
  }
}

/**
 * Staff invite landing page.
 *
 *   valid, signed out       → invite card + create account (JoinSignUp)
 *   valid, just signed up   → "Adding you to …" while the webhook runs
 *   valid, other account    → signed in as someone else: sign out and continue
 *   missing / not found     → link doesn't work
 *   expired / used          → friendly dead-end with a next step
 */
export default async function JoinPage(props: {
  searchParams: Promise<{ token?: string; sign_up_force_redirect_url?: string }>;
  params: Promise<{ rest?: string[] }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  // Clerk OAuth callback: route the new account to the right place.
  if (params.rest?.[0] === "sso-callback") {
    const { userId } = await auth();

    if (userId) {
      const storedToken = await getInviteTokenCookie();
      if (storedToken) {
        const res = await validateInviteToken(storedToken);
        if (res.success) {
          const member = await isMemberOf(userId, res.clerkOrgId);
          if (member) redirect("/dashboard");
          if (member === false) redirect(`/join?token=${encodeURIComponent(storedToken)}`);
        }
      }
    }

    const redirectUrl = searchParams.sign_up_force_redirect_url;
    if (redirectUrl) {
      let forwarded: string | null = null;
      try {
        forwarded = new URL(redirectUrl).searchParams.get("token");
      } catch (err) {
        console.error("Failed to parse redirect URL:", err);
      }
      // redirect() throws, so it stays outside the try block.
      if (forwarded) redirect(`/join?token=${encodeURIComponent(forwarded)}`);
    }
    const storedToken = await getInviteTokenCookie();
    if (storedToken) redirect(`/join?token=${encodeURIComponent(storedToken)}`);
    redirect("/join");
  }

  const { token } = searchParams;
  const { userId } = await auth();

  // Signed in with no token in the URL: the invite was already handled.
  if (userId && !token && (await getInviteTokenCookie())) {
    redirect("/dashboard");
  }

  if (!token) {
    return <InviteProblemScreen problem="missing" />;
  }

  const res = await validateInviteToken(token);

  if (!res.success) {
    if (userId && res.reason === "used") redirect("/dashboard");
    return (
      <InviteProblemScreen
        problem={res.reason}
        hotelName={res.hotelName}
        retryHref={`/join?token=${encodeURIComponent(token)}`}
      />
    );
  }

  const { hotelName, role, clerkOrgId, inviterName } = res;
  const expiresLabel = formatInviteExpiry(res.expiresAt);

  if (userId) {
    if (await isMemberOf(userId, clerkOrgId)) redirect("/dashboard");

    // Signed up with this very invite: the webhook is adding them now.
    const user = await currentUser();
    if (user?.unsafeMetadata?.inviteToken === token) {
      return <ProcessingInvite hotelName={hotelName} role={role} orgId={clerkOrgId} />;
    }

    return (
      <SignedInElsewhere
        token={token}
        email={user?.primaryEmailAddress?.emailAddress ?? null}
        hotelName={hotelName}
        role={role}
        inviterName={inviterName}
        expiresLabel={expiresLabel}
      />
    );
  }

  return (
    <JoinSignUp
      token={token}
      hotelName={hotelName}
      role={role}
      inviterName={inviterName}
      expiresLabel={expiresLabel}
    />
  );
}
