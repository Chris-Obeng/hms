"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw, ArrowLeft, Mail } from "lucide-react";
import { Card, Button, Alert } from "@heroui/react";

/**
 * Error Boundary for Hotel Integrations Page
 * 
 * User-friendly error display with support contact options.
 */
export default function IntegrationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  React.useEffect(() => {
    // Log error to monitoring service
    console.error("Hotel Integrations Error:", error);
  }, [error]);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* ── Page Header ──────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Back to settings"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Connected Services
          </h1>
          <p className="text-sm text-foreground/60 mt-0.5">
            Something went wrong
          </p>
        </div>
      </div>

      {/* ── Error Card ───────────────────────────────────────── */}
      <Card variant="secondary">
        <Card.Content className="py-12">
          <div className="flex flex-col items-center text-center">
            <div className="size-12 rounded-full bg-danger/10 flex items-center justify-center mb-4">
              <AlertTriangle className="size-6 text-danger" />
            </div>
            
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Unable to Load Integration Status
            </h2>
            
            <p className="text-sm text-foreground/70 mb-6 max-w-md">
              We're having trouble loading your integration status. This is usually
              temporary. Please try again or contact our support team if the problem
              continues.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button onPress={reset}>
                <RefreshCw className="size-4" />
                Try Again
              </Button>
              
              <Button
                variant="outline"
                onPress={() => {
                  window.location.href =
                    "mailto:support@hotelosprp.com?subject=Integration Status Error";
                }}
              >
                <Mail className="size-4" />
                Contact Support
              </Button>
            </div>
          </div>
        </Card.Content>
      </Card>

      {/* ── Alternative Actions ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <Card.Content className="py-4 text-center">
            <h3 className="text-sm font-medium text-foreground mb-1">
              View Bookings
            </h3>
            <p className="text-xs text-foreground/60 mb-3">
              Your bookings are safe and accessible
            </p>
            <Button
              variant="outline"
              size="sm"
              fullWidth
              onPress={() => router.push("/dashboard/bookings")}
            >
              Go to Bookings
            </Button>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content className="py-4 text-center">
            <h3 className="text-sm font-medium text-foreground mb-1">
              Dashboard
            </h3>
            <p className="text-xs text-foreground/60 mb-3">
              Return to your main dashboard
            </p>
            <Button
              variant="outline"
              size="sm"
              fullWidth
              onPress={() => router.push("/dashboard")}
            >
              Go to Dashboard
            </Button>
          </Card.Content>
        </Card>
      </div>

      {/* ── Reassurance Message ──────────────────────────────── */}
      <Alert status="default">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>
            <strong>Don't worry:</strong> Your channel sync and bookings continue to work
            normally even if this page isn't loading. This only affects viewing the
            status information.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    </div>
  );
}
