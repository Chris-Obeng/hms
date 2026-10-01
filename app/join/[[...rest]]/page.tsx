import { validateInviteToken } from "@/app/actions/invitations";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ProcessingInvite } from "./processing-invite";
import { JoinSignUp } from "./join-signup";
import { getInviteTokenCookie } from "./actions";

export default async function JoinPage(props: {
  searchParams: Promise<{ token?: string; sign_up_force_redirect_url?: string }>;
  params: Promise<{ rest?: string[] }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  
  // Handle Clerk OAuth callback - check auth state first
  if (params.rest?.[0] === "sso-callback") {
    const { userId } = await auth();
    
    if (userId) {
      // User just signed up/in via OAuth - check if they have org membership
      const storedToken = await getInviteTokenCookie();
      if (storedToken) {
        // Validate token to get org info
        const res = await validateInviteToken(storedToken);
        if (res.success) {
          const clerk = await clerkClient();
          try {
            const memberships = await clerk.users.getOrganizationMembershipList({ userId });
            const isMember = memberships.data.some(m => m.organization.id === res.clerkOrgId);
            
            if (isMember) {
              // Already added by webhook - go to dashboard
              redirect("/dashboard");
            } else {
              // Not member yet - show processing UI
              redirect(`/join/processing?orgId=${res.clerkOrgId}&hotel=${encodeURIComponent(res.hotelName)}&role=${res.role}`);
            }
          } catch (err) {
            console.error("Failed to check membership:", err);
          }
        }
      }
    }
    
    // Not authenticated or no token - try to extract token and redirect
    const redirectUrl = searchParams.sign_up_force_redirect_url;
    if (redirectUrl) {
      try {
        const url = new URL(redirectUrl);
        const token = url.searchParams.get("token");
        if (token) {
          redirect(`/join?token=${token}`);
        }
      } catch (err) {
        console.error("Failed to parse redirect URL:", err);
      }
    }
    const storedToken = await getInviteTokenCookie();
    if (storedToken) {
      redirect(`/join?token=${storedToken}`);
    }
    // Fallback if no token found
    redirect("/join");
  }

  const { token } = searchParams;

  // Check if user already authenticated (from OAuth callback)
  const { userId } = await auth();
  
  // If authenticated and no token in URL, check cookie
  if (userId && !token) {
    const storedToken = await getInviteTokenCookie();
    if (storedToken) {
      // Try to get org info from cookie token without validating (might be used)
      // Just check membership directly
      redirect("/dashboard");
    }
  }

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FDFCFA] p-6">
        <div className="max-w-md w-full bg-white border border-[#E9E2D6] rounded-[16px] p-6 shadow-sm text-center space-y-2">
          <h2 className="text-lg font-semibold text-[#9B2C2C]">Invalid invite link</h2>
          <p className="text-sm text-[#6B7571]">The invitation token is missing. Ask your manager to resend the invite.</p>
        </div>
      </div>
    );
  }

  const res = await validateInviteToken(token);

  if (!res.success) {
    // If token already used and user is authenticated, redirect to dashboard
    if (userId && res.error === "Invitation link has already been used") {
      redirect("/dashboard");
    }
    
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FDFCFA] p-6">
        <div className="max-w-md w-full bg-white border border-[#E9E2D6] rounded-[16px] p-6 shadow-sm text-center space-y-2">
          <h2 className="text-lg font-semibold text-[#9B2C2C]">Invalid invite link</h2>
          <p className="text-sm text-[#6B7571]">{res.error}</p>
        </div>
      </div>
    );
  }

  const { hotelName, role, clerkOrgId } = res;

  // userId already fetched above
  if (userId) {
    // Check if user already member of this org
    const clerk = await clerkClient();
    try {
      const memberships = await clerk.users.getOrganizationMembershipList({ userId });
      const isMember = memberships.data.some(m => m.organization.id === clerkOrgId);
      
      if (isMember) {
        // Already member, go to dashboard
        redirect("/dashboard");
      }
    } catch (err) {
      console.error("Failed to check org membership:", err);
    }
    
    // Not member yet - show processing state with client-side polling
    return <ProcessingInvite hotelName={hotelName} role={role} orgId={clerkOrgId} />;
  }

  return <JoinSignUp token={token} hotelName={hotelName} role={role} />;
}
