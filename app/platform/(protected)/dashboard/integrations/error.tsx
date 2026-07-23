"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import { Card, Button, Alert } from "@heroui/react";

/**
 * Error Boundary for Platform Admin Integrations Page
 * 
 * Catches and displays errors gracefully with recovery options.
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
    console.error("Platform Integrations Error:", error);
  }, [error]);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* ── Page Header ──────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link
          href="/platform/dashboard"
          className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Back to platform dashboard"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Integration Management
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
              Failed to Load Integration Management
            </h2>
            
            <p className="text-sm text-foreground/70 mb-6 max-w-md">
              We encountered an error while loading the integrations page. This might be
              temporary. Try refreshing the page or contact support if the issue persists.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button onPress={reset}>
                <RefreshCw className="size-4" />
                Try Again
              </Button>
              
              <Button
                variant="outline"
                onPress={() => router.push("/platform/dashboard")}
              >
                Back to Dashboard
              </Button>
            </div>
          </div>
        </Card.Content>
      </Card>

      {/* ── Error Details (for debugging) ────────────────────── */}
      {process.env.NODE_ENV === "development" && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Development Error Details</Alert.Title>
            <Alert.Description>
              <pre className="text-xs mt-2 overflow-x-auto whitespace-pre-wrap">
                {error.message}
              </pre>
              {error.digest && (
                <p className="text-xs mt-2">Error ID: {error.digest}</p>
              )}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {/* ── Support Contact ──────────────────────────────────── */}
      <Card>
        <Card.Content className="py-6">
          <h3 className="text-sm font-semibold text-foreground mb-2">
            Need Help?
          </h3>
          <p className="text-sm text-foreground/70 mb-3">
            If this error continues, please contact the development team with the error
            details above.
          </p>
          <Button
            variant="outline"
            size="sm"
            onPress={() => {
              window.location.href =
                "mailto:support@hotelosprp.com?subject=Platform Integration Error";
            }}
          >
            Contact Support
          </Button>
        </Card.Content>
      </Card>
    </div>
  );
}
