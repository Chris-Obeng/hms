"use client";

/**
 * app/global-error.tsx
 *
 * Catches unhandled errors thrown inside the root layout (app/layout.tsx).
 * This is the last error boundary — it replaces the entire HTML shell, so
 * it MUST include <html> and <body> tags.
 *
 * Triggered by: errors in layout.tsx, ClerkProvider, TooltipProvider, or
 * any provider that wraps the entire app. Errors inside page-level components
 * are caught by the closer error.tsx boundaries first.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "#0c0a09",
          color: "#fafaf9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: "480px",
            width: "100%",
            textAlign: "center",
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "rgba(239,68,68,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem",
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>

          <h1
            style={{
              fontSize: "1.125rem",
              fontWeight: 600,
              margin: "0 0 0.375rem",
            }}
          >
            Something went wrong
          </h1>

          <p
            style={{
              fontSize: "0.875rem",
              color: "#a8a29e",
              margin: "0 0 1.5rem",
              lineHeight: 1.5,
            }}
          >
            A critical error occurred. Please try refreshing the page. If the
            problem persists, contact support.
          </p>

          {/* Show digest in dev for traceability, hidden in prod */}
          {process.env.NODE_ENV === "development" && error.digest && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "#57534e",
                fontFamily: "monospace",
                margin: "0 0 1rem",
              }}
            >
              Digest: {error.digest}
            </p>
          )}

          <button
            onClick={() => reset()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#fafaf9",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "0.5rem",
              cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
