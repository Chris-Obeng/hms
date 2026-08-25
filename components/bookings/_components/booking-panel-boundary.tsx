"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

interface BookingPanelBoundaryProps {
  children: React.ReactNode;
  label?: string;
}

interface BoundaryState {
  hasError: boolean;
}

/**
 * Scoped error boundary for booking detail panels. A throw inside one panel
 * must degrade to an inline notice — never bubble to the route boundary and
 * take down the whole dashboard page.
 */
export class BookingPanelBoundary extends React.Component<
  BookingPanelBoundaryProps,
  BoundaryState
> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[BookingPanelBoundary]", this.props.label, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
          <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          <p className="text-xs text-muted-foreground">
            This section couldn&apos;t be displayed. Other details are still available.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
