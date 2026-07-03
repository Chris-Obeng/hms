import { validateInviteToken } from "@/app/actions/invitations";
import { SignUp } from "@clerk/nextjs";

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

  const { hotelName, role } = res;

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
        forceRedirectUrl="/dashboard" 
        unsafeMetadata={{ inviteToken: token }} 
      />
    </div>
  );
}
