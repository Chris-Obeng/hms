import { validateInviteToken } from "@/app/actions/invitations";
import { SignUp } from "@clerk/nextjs";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ProcessingInvite } from "./processing-invite";

export default async function JoinPage(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await props.searchParams;

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/30 p-4">
        <div className="max-w-md w-full bg-card border border-border/60 rounded-xl p-6 shadow-sm text-center space-y-2">
          <h2 className="text-lg font-bold text-destructive">Invalid Invite Link</h2>
          <p className="text-sm text-muted-foreground">The invitation token is missing.</p>
        </div>
      </div>
    );
  }

  const res = await validateInviteToken(token);

  if (!res.success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/30 p-4">
        <div className="max-w-md w-full bg-card border border-border/60 rounded-xl p-6 shadow-sm text-center space-y-2">
          <h2 className="text-lg font-bold text-destructive">Invalid Invite Link</h2>
          <p className="text-sm text-muted-foreground">{res.error}</p>
        </div>
      </div>
    );
  }

  const { hotelName, role, clerkOrgId } = res;

  // Check if user already authenticated
  const { userId } = await auth();
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

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-muted/30 p-4 space-y-6">
      <div className="max-w-md w-full text-center space-y-2">
        <div className="size-12 rounded-xl bg-foreground flex items-center justify-center mx-auto mb-2">
          <span className="text-xl font-bold text-background">H</span>
        </div>
        <h1 className="text-xl font-bold text-foreground">Welcome to {hotelName}</h1>
        <p className="text-sm text-muted-foreground">
          You have been invited to join the team as <span className="font-semibold text-foreground capitalize">{role.replace("_", " ")}</span>.
        </p>
      </div>

      <SignUp 
        path="/join"
        signInUrl={`/sign-in?redirect_url=${encodeURIComponent(`/join?token=${token}`)}`}
        forceRedirectUrl={`/join?token=${token}`}
        fallbackRedirectUrl="/dashboard"
        unsafeMetadata={{ inviteToken: token }} 
      />
    </div>
  );
}
