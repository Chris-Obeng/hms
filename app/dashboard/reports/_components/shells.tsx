"use client";

import type { CSSProperties } from "react";
import { Button } from "@heroui/react";

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div role="alert" className="mx-auto max-w-lg space-y-3 p-6 text-center">
    <div><h2 className="text-section">Report could not be loaded</h2><p className="mt-1 text-body text-muted-foreground">{message}</p></div>
    <Button variant="outline" onPress={onRetry} className="min-h-10">Try again</Button>
  </div>;
}

export const tooltipStyle: CSSProperties = {
  fontSize: 12.5, lineHeight: 1.5, background: "var(--popover)", color: "var(--popover-foreground)",
  border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", boxShadow: "0 8px 24px oklch(0 0 0 / 0.08)",
};
