"use client";

import * as React from "react";
import { Button, Chip, Disclosure, Input, Label, Switch, TextArea, TextField, toast } from "@heroui/react";

import { saveNotificationTemplates } from "@/app/actions/notification-templates";
import {
  ALL_EVENT_TYPES,
  EVENT_LABELS,
  TEMPLATE_VARIABLES,
  type NotificationEventType,
  type NotificationTemplate,
} from "@/lib/notification-templates";
import { SaveBar, SettingsGroup } from "../_components/settings-ui";

type TemplatesState = Record<NotificationEventType, NotificationTemplate>;

function EventEditor({
  eventType,
  template,
  onChange,
}: {
  eventType: NotificationEventType;
  template: NotificationTemplate;
  onChange: (patch: Partial<NotificationTemplate>) => void;
}) {
  const focusedRef = React.useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  const insertVariable = (variable: string) => {
    const field = focusedRef.current;
    if (!field) {
      toast.info("Click into the subject or body first");
      return;
    }
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;
    const value = `${field.value.slice(0, start)}${variable}${field.value.slice(end)}`;
    const name = field.getAttribute("data-field");
    if (name === "email_subject" || name === "email_template") onChange({ [name]: value });
  };

  return (
    <Disclosure className="py-1">
      <Disclosure.Heading>
        <Button
          slot="trigger"
          variant="ghost"
          fullWidth
          className="h-12 justify-between rounded-xl px-0 text-sm font-medium text-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-transparent"
        >
          <span className="truncate">{EVENT_LABELS[eventType]}</span>
          <span className="flex shrink-0 items-center gap-3">
            <Chip size="sm" variant="soft" color={template.email_enabled ? "success" : "default"}>
              {template.email_enabled ? "On" : "Off"}
            </Chip>
            <Disclosure.Indicator className="text-muted-foreground" />
          </span>
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="flex flex-col gap-4 px-0 pb-4 pt-1">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-foreground">Send this email</p>
            <Switch
              aria-label={`Send ${EVENT_LABELS[eventType]} email`}
              isSelected={template.email_enabled}
              onChange={(value) => onChange({ email_enabled: value })}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </div>

          {template.email_enabled && (
            <>
              <TextField fullWidth value={template.email_subject} onChange={(v) => onChange({ email_subject: v })}>
                <Label>Subject</Label>
                <Input data-field="email_subject" onFocus={(e) => (focusedRef.current = e.currentTarget)} />
              </TextField>
              <TextField fullWidth value={template.email_template} onChange={(v) => onChange({ email_template: v })}>
                <Label>Message</Label>
                <TextArea
                  data-field="email_template"
                  rows={8}
                  onFocus={(e) => (focusedRef.current = e.currentTarget)}
                  className="resize-y font-mono text-base leading-relaxed sm:text-xs"
                />
              </TextField>
              <div className="flex flex-wrap gap-2" aria-label="Insert a variable">
                {TEMPLATE_VARIABLES.map((variable) => (
                  <Button
                    key={variable}
                    size="sm"
                    variant="secondary"
                    onPress={() => insertVariable(variable)}
                    className="h-8 rounded-lg px-2 font-mono text-2xs text-muted-foreground md:h-8"
                  >
                    {variable}
                  </Button>
                ))}
              </div>
            </>
          )}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}

export function NotificationTemplatesClient({ initialTemplates }: { initialTemplates: TemplatesState }) {
  const [templates, setTemplates] = React.useState(initialTemplates);
  const [lastSaved, setLastSaved] = React.useState(initialTemplates);
  const [saving, setSaving] = React.useState(false);

  const hasChanges = JSON.stringify(templates) !== JSON.stringify(lastSaved);

  const save = async () => {
    setSaving(true);
    const result = await saveNotificationTemplates(templates);
    setSaving(false);
    if (result.success) {
      setLastSaved(templates);
      toast.success("Guest emails saved");
    } else {
      toast.danger(result.error || "Failed to save guest emails");
    }
  };

  return (
    <div>
      <SettingsGroup title="Emails to guests" className="gap-0 py-2 sm:py-2">
        <div className="divide-y divide-border/60">
          {ALL_EVENT_TYPES.map((eventType) => (
            <EventEditor
              key={eventType}
              eventType={eventType}
              template={templates[eventType]}
              onChange={(patch) =>
                setTemplates((current) => ({
                  ...current,
                  [eventType]: { ...current[eventType], ...patch },
                }))
              }
            />
          ))}
        </div>
      </SettingsGroup>
      <SaveBar
        visible={hasChanges || saving}
        saving={saving}
        onSave={() => void save()}
        onDiscard={() => setTemplates(lastSaved)}
      />
    </div>
  );
}
