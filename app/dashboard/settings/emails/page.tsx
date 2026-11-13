"use client";

import * as React from "react";
import { Alert, Button, Skeleton } from "@heroui/react";

import { getNotificationTemplates } from "@/app/actions/notification-templates";
import type { NotificationEventType, NotificationTemplate } from "@/lib/notification-templates";
import { NotificationTemplatesClient } from "../notifications/templates-client";

type Templates = Record<NotificationEventType, NotificationTemplate>;

/** Guest emails: the transactional messages guests receive, one editor each. */
export default function GuestEmailsPage() {
  const [templates, setTemplates] = React.useState<Templates | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    getNotificationTemplates()
      .then((result) => {
        if (cancelled) return;
        if (result.success) setTemplates(result.data);
        else setError(result.error || "Guest emails could not be loaded.");
      })
      .catch(() => {
        if (!cancelled) setError("Guest emails could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (error) {
    return (
      <Alert status="danger" className="rounded-2xl">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{error}</Alert.Title>
        </Alert.Content>
        <Button
          size="sm"
          variant="secondary"
          className="rounded-lg"
          onPress={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </Alert>
    );
  }

  if (!templates) {
    return (
      <div className="grid gap-3 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8" aria-busy="true">
        <Skeleton className="h-4 w-24 rounded-md lg:mt-6" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }

  return <NotificationTemplatesClient initialTemplates={templates} />;
}
