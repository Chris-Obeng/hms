"use client";

import * as React from "react";
import { ChevronDown, Mail, MessageSquare } from "lucide-react";
import { toast } from "@heroui/react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { saveNotificationTemplates } from "@/app/actions/notification-templates";
import {
  ALL_EVENT_TYPES,
  EVENT_LABELS,
  EVENT_DESCRIPTIONS,
  TEMPLATE_VARIABLES,
  type NotificationEventType,
  type NotificationTemplate,
} from "@/lib/notification-templates";

// ── Types ─────────────────────────────────────────────────────────

type TemplatesState = Record<NotificationEventType, NotificationTemplate>;

// ── Variable Chips ────────────────────────────────────────────────

function VariableChips({
  onInsert,
}: {
  onInsert: (variable: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {TEMPLATE_VARIABLES.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onInsert(v)}
          className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground font-mono transition-colors"
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// ── Event Card ────────────────────────────────────────────────────

function EventCard({
  eventType,
  template,
  onChange,
}: {
  eventType: NotificationEventType;
  template: NotificationTemplate;
  onChange: (updated: Partial<NotificationTemplate>) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const focusedRef = React.useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  const insertVariable = (variable: string) => {
    const el = focusedRef.current;
    if (!el) {
      // No focused field — show hint
      toast.info("Click into a text field first, then click a variable to insert it.");
      return;
    }

    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const newValue = before + variable + after;

    // Determine which field was focused
    const name = el.getAttribute("data-field");
    if (name === "sms_template" || name === "email_template" || name === "email_subject") {
      onChange({ [name]: newValue });
    }

    // Restore focus and cursor after React re-render
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + variable.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{EVENT_LABELS[eventType]}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{EVENT_DESCRIPTIONS[eventType]}</p>
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          {/* Channel indicators */}
          <span className={cn("flex items-center gap-1 text-xs", template.sms_enabled ? "text-foreground" : "text-muted-foreground/40")}>
            <MessageSquare className="size-3" />
            SMS
          </span>
          <span className={cn("flex items-center gap-1 text-xs", template.email_enabled ? "text-foreground" : "text-muted-foreground/40")}>
            <Mail className="size-3" />
            Email
          </span>
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {/* Expanded body */}
      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-border bg-muted/20">
          {/* Variable chips */}
          <div>
            <p className="text-xs text-muted-foreground mt-3 mb-1">Click a variable to insert at cursor:</p>
            <VariableChips onInsert={insertVariable} />
          </div>

          <Separator className="opacity-40" />

          {/* SMS section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">SMS</span>
              </div>
              <Switch checked={template.sms_enabled} onCheckedChange={(v) => onChange({ sms_enabled: v })} />
            </div>
            {template.sms_enabled && (
              <Textarea
                data-field="sms_template"
                value={template.sms_template}
                onChange={(e) => onChange({ sms_template: e.target.value })}
                onFocus={(e) => { focusedRef.current = e.currentTarget; }}
                placeholder="SMS message template…"
                rows={4}
                className="text-xs font-mono resize-y"
              />
            )}
          </div>

          <Separator className="opacity-40" />

          {/* Email section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">Email</span>
              </div>
              <Switch checked={template.email_enabled} onCheckedChange={(v) => onChange({ email_enabled: v })} />
            </div>
            {template.email_enabled && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Subject</label>
                  <Input
                    data-field="email_subject"
                    value={template.email_subject}
                    onChange={(e) => onChange({ email_subject: e.target.value })}
                    onFocus={(e) => { focusedRef.current = e.currentTarget; }}
                    placeholder="Email subject…"
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Body</label>
                  <Textarea
                    data-field="email_template"
                    value={template.email_template}
                    onChange={(e) => onChange({ email_template: e.target.value })}
                    onFocus={(e) => { focusedRef.current = e.currentTarget; }}
                    placeholder="Email body template…"
                    rows={6}
                    className="text-xs font-mono resize-y"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────

export function NotificationTemplatesClient({
  initialTemplates,
}: {
  initialTemplates: TemplatesState;
}) {
  const [templates, setTemplates] = React.useState<TemplatesState>(initialTemplates);
  const [saving, setSaving] = React.useState(false);

  const updateTemplate = (
    eventType: NotificationEventType,
    patch: Partial<NotificationTemplate>
  ) => {
    setTemplates((prev) => ({
      ...prev,
      [eventType]: { ...prev[eventType], ...patch },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const result = await saveNotificationTemplates(templates);
    setSaving(false);
    if (result.success) {
      toast.success("Templates saved");
    } else {
      toast.danger(result.error || "Failed to save templates");
    }
  };

  return (
    <div className="space-y-3">
      {ALL_EVENT_TYPES.map((eventType, index) => (
        <React.Fragment key={eventType}>
          <EventCard
            eventType={eventType}
            template={templates[eventType]}
            onChange={(patch) => updateTemplate(eventType, patch)}
          />
          {index < ALL_EVENT_TYPES.length - 1 && null}
        </React.Fragment>
      ))}

      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="text-sm rounded-xl bg-foreground text-background hover:bg-foreground/90"
        >
          {saving ? "Saving…" : "Save Templates"}
        </Button>
      </div>
    </div>
  );
}
