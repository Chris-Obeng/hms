"use client";

import { Button } from "@/components/ui/button";

/**
 * Shared route-segment error boundary body. Route-level error.tsx files stay
 * thin and pass context-specific copy. Rendered inside the segment's layout,
 * so surrounding chrome (sidebar/header) stays alive.
 */
export function RouteError({
  title,
  description,
  reset,
}: {
  title: string;
  description?: string;
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <svg
          className="size-6 text-destructive"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      <Button variant="outline" size="sm" className="mt-4 rounded-lg" onClick={() => reset()}>
        Retry
      </Button>
    </div>
  );
}
