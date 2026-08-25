"use client";

import { SignUp } from "@clerk/nextjs";
import { useEffect } from "react";
import { setInviteTokenCookie } from "./actions";

export function JoinSignUp({ 
  token, 
  hotelName, 
  role 
}: { 
  token: string; 
  hotelName: string; 
  role: string;
}) {
  useEffect(() => {
    // Store token in cookie for OAuth flow
    setInviteTokenCookie(token);
  }, [token]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-muted/30 p-4 space-y-6">
      <div className="max-w-md w-full text-center space-y-2">
        <div className="size-12 rounded-xl bg-foreground flex items-center justify-center mx-auto mb-2">
          <span className="text-xl font-bold text-background">H</span>
        </div>
        <h1 className="text-xl font-bold text-foreground">Welcome to {hotelName}</h1>
        <p className="text-sm text-muted-foreground">
          You have been invited to join the team as{" "}
          <span className="font-semibold text-foreground capitalize">
            {role.replace("_", " ")}
          </span>.
        </p>
      </div>

      <SignUp 
        path="/join"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/join/sso-callback"
      />
    </div>
  );
}
