"use client";

import { ArrowLeft } from "lucide-react";
import { Card, Skeleton, Surface } from "@heroui/react";

/**
 * Loading state for Hotel Integrations Page
 * 
 * Shows skeleton UI while integration status is being loaded.
 */
export default function IntegrationsLoading() {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── Page Header ──────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-lg bg-muted animate-pulse" />
        <div className="space-y-1">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      {/* ── Integration Card Skeleton ────────────────────────── */}
      <Card>
        <Card.Header>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-10 rounded-lg" />
              <Skeleton className="h-5 w-48" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </Card.Header>

        <Card.Content className="space-y-4">
          <Skeleton className="h-4 w-full max-w-md" />

          {/* Metrics skeleton */}
          <div className="grid grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <Surface key={i} variant="secondary" className="p-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-12" />
                </div>
              </Surface>
            ))}
          </div>
        </Card.Content>

        <Card.Footer className="flex items-center justify-between gap-2 pt-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-8 w-28" />
        </Card.Footer>
      </Card>

      {/* ── Future Integrations Placeholder ──────────────────── */}
      <Card variant="secondary">
        <Card.Content className="py-8">
          <Skeleton className="h-6 w-6 mx-auto mb-2 rounded-full" />
          <Skeleton className="h-4 w-48 mx-auto" />
        </Card.Content>
      </Card>

      {/* ── Help Section Skeleton ────────────────────────────── */}
      <Card>
        <Card.Header>
          <div className="space-y-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </Card.Header>
        <Card.Content className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-full max-w-xs" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
          ))}
        </Card.Content>
      </Card>

      {/* ── Support Contact Skeleton ─────────────────────────── */}
      <Surface variant="secondary" className="p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="size-10 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-full max-w-sm" />
            <Skeleton className="h-8 w-36 mt-3" />
          </div>
        </div>
      </Surface>
    </div>
  );
}
