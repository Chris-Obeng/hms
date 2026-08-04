"use client";

import * as React from "react";
import { ChevronDown, Mail } from "lucide-react";
import { Button, Input, Switch, toast } from "@heroui/react";

import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { saveNotificationTemplates } from "@/app/actions/notification-templates";
import {
  ALL_EVENT_TYPES,
  EVENT_DESCRIPTIONS,
  EVENT_LABELS,
  TEMPLATE_VARIABLES,
  type NotificationEventType,
  type NotificationTemplate,
} from "@/lib/notification-templates";

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
  const [open, setOpen] = React.useState(false);
  const focusedRef = React.useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  const insertVariable = (variable: string) => {
    const field = focusedRef.current;
    if (!field) {
      toast.info("Focus subject or body before inserting a variable");
      return;
    }

    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;
    const value = `${field.value.slice(0, start)}${variable}${field.value.slice(end)}`;
    const name = field.getAttribute("data-field");
    if (name === "email_subject" || name === "email_template") {
      onChange({ [name]: value });
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border/70">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{EVENT_LABELS[eventType]}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{EVENT_DESCRIPTIONS[eventType]}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className={cn("flex items-center gap-1 text-xs", template.email_enabled ? "text-foreground" : "text-muted-foreground/40")}>
            <Mail className="size-3" /> Email
          </span>
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/60 bg-muted/15 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Send this email</p>
              <p className="text-xs text-muted-foreground">Only sends when guest email is available.</p>
            </div>
            <Switch
              aria-label={`Send ${EVENT_LABELS[eventType]} email`}
              isSelected={template.email_enabled}
              onChange={(value) => onChange({ email_enabled: value })}
            >
              <Switch.Content>
                <Switch.Control><Switch.Thumb /></Switch.Control>
              </Switch.Content>
            </Switch>
          </div>

          {template.email_enabled && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Subject</label>
                <Input
                  data-field="email_subject"
                  value={template.email_subject}
                  onChange={(event) => onChange({ email_subject: event.target.value })}
                  onFocus={(event) => { focusedRef.current = event.currentTarget; }}
                  variant="secondary"
                  fullWidth
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Body</label>
                <Textarea
                  data-field="email_template"
                  value={template.email_template}
                  onChange={(event) => onChange({ email_template: event.target.value })}
                  onFocus={(event) => { focusedRef.current = event.currentTarget; }}
                  rows={7}
                  className="resize-y font-mono text-xs"
                />
              </div>
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Insert variable</p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARIABLES.map((variable) => (
                    <button
                      key={variable}
                      type="button"
                      onClick={() => insertVariable(variable)}
                      className="rounded border border-border bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {variable}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export function NotificationTemplatesClient({ initialTemplates }: { initialTemplates: TemplatesState }) {
  const [templates, setTemplates] = React.useState(initialTemplates);
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    setSaving(true);
    const result = await saveNotificationTemplates(templates);
    setSaving(false);
    if (result.success) toast.success("Email templates saved");
    else toast.danger(result.error || "Failed to save templates");
  };

  return (
    <div className="space-y-3">
      {ALL_EVENT_TYPES.map((eventType) => (
        <EventEditor
          key={eventType}
          eventType={eventType}
          template={templates[eventType]}
          onChange={(patch) => setTemplates((current) => ({
            ...current,
            [eventType]: { ...current[eventType], ...patch },
          }))}
        />
      ))}
      <div className="flex justify-end pt-2">
        <Button variant="primary" isPending={saving} onPress={save}>Save email templates</Button>
      </div>
    </div>
  );
}
