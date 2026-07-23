"use client";

import { ArrowLeft } from "lucide-react";
import { Card, Skeleton } from "@heroui/react";

/**
 * Loading state for Platform Admin Integrations Page
 * 
 * Shows skeleton UI while data is being loaded.
 */
export default function IntegrationsLoading() {
  return (
    <div className="space-y-6 max-w-7xl">
      {/* ── Page Header ──────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-lg bg-muted animate-pulse" />
        <div className="space-y-1">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      {/* ── Hotel Selector ───────────────────────────────────── */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full max-w-md" />
      </div>

      {/* ── Tabs Skeleton ────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Tab navigation */}
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-24" />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} variant="secondary">
              <Card.Content className="pt-4 pb-4">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </Card.Content>
            </Card>
          ))}
        </div>

        {/* Main Content Card */}
        <Card>
          <Card.Header>
            <div className="space-y-2 w-full">
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
          </Card.Header>
          <Card.Content className="space-y-4">
            <Skeleton className="h-10 w-full max-w-xs" />
            <Skeleton className="h-4 w-full max-w-md" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full max-w-xs" />
            </div>
          </Card.Content>
          <Card.Footer className="flex gap-2 pt-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-8 w-40" />
          </Card.Footer>
        </Card>
      </div>
    </div>
  );
}
