import { Suspense } from "react";
import { PlatformLoginForm } from "./_components/login-form";

export const metadata = { title: "RoomLine — Platform Admin" };

export default function PlatformSignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-12 rounded-2xl bg-secondary mb-4">
            <span className="text-2xl font-bold text-foreground">H</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">RoomLines</h1>
          <p className="text-sm text-muted-foreground mt-1">Platform Admin</p>
        </div>

        <Suspense fallback={
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-border"></div>
          </div>
        }>
          <PlatformLoginForm />
        </Suspense>
      </div>
    </div>
  );
}
