"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  Button,
  Chip,
  Drawer,
  Skeleton,
  Tabs,
  toast,
  useOverlayState,
} from "@heroui/react";
import { ExternalLink } from "lucide-react";
import {
  formatCurrency,
  formatCurrencyCompact,
  formatDateTime,
} from "@/lib/format";
import { getHotel360, setHotelStatus, type LifecycleAction } from "../_actions";
import { StatusChip } from "./status-chip";

// ── Viewport ─────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

// ── Lifecycle copy ───────────────────────────────────────────────

const ACTION_COPY: Record<
  Exclude<LifecycleAction, never>,
  { title: string; body: (name: string) => string; confirm: string; variant: "primary" | "danger" }
> = {
  approve: {
    title: "Approve hotel?",
    body: (n) =>
      `${n} will become active. Its booking page can immediately receive live reservations and payments. This action is recorded in the platform audit trail.`,
    confirm: "Approve hotel",
    variant: "primary",
  },
  suspend: {
    title: "Suspend hotel?",
    body: (n) =>
      `${n} will become suspended and can no longer take bookings until reactivated. Existing reservations are preserved. This action is recorded in the platform audit trail.`,
    confirm: "Suspend hotel",
    variant: "danger",
  },
  reactivate: {
    title: "Reactivate hotel?",
    body: (n) =>
      `${n} will become active again and resume taking bookings. This action is recorded in the platform audit trail.`,
    confirm: "Reactivate hotel",
    variant: "primary",
  },
};

const AUDIT_LABELS: Record<string, string> = {
  "hotel.approve": "Approved",
  "hotel.suspend": "Suspended",
  "hotel.reactivate": "Reactivated",
};

// ── Component ────────────────────────────────────────────────────

export function HotelDrawer({
  hotelId,
  onClose,
  onChanged,
}: {
  hotelId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const isMobile = useIsMobile();
  const [visibleId, setVisibleId] = React.useState<string | null>(null);
  const [confirmAction, setConfirmAction] = React.useState<LifecycleAction | null>(null);
  const [acting, setActing] = React.useState(false);
  const queryClient = useQueryClient();

  // Keep the last content mounted while the exit animation plays: mirror the
  // incoming prop into local state during render (React's recommended
  // "adjust state on prop change" pattern — no effect needed).
  const [lastPropId, setLastPropId] = React.useState<string | null>(hotelId);
  if (hotelId !== lastPropId) {
    setLastPropId(hotelId);
    if (hotelId) setVisibleId(hotelId);
  }

  const state = useOverlayState({
    defaultOpen: false,
    onOpenChange: (open) => {
      if (!open) {
        setVisibleId(null);
        onClose();
      }
    },
  });

  React.useEffect(() => {
    if (visibleId && !state.isOpen) state.open();
  }, [visibleId, state]);

  const q = useQuery({
    queryKey: ["platform-hotel-360", visibleId],
    queryFn: () => getHotel360(visibleId!),
    enabled: Boolean(visibleId),
  });

  const data = q.data?.success ? q.data : null;

  async function runAction(action: LifecycleAction) {
    if (!visibleId) return;
    setActing(true);
    try {
      const result = await setHotelStatus(visibleId, action);
      if (result.success) {
        toast.success(
          action === "approve"
            ? "Hotel approved"
            : action === "suspend"
              ? "Hotel suspended"
              : "Hotel reactivated"
        );
        setConfirmAction(null);
        await queryClient.invalidateQueries({
          queryKey: ["platform-hotel-360", visibleId],
        });
        onChanged();
      } else {
        toast.danger(result.error ?? "Action failed");
      }
    } finally {
      setActing(false);
    }
  }

  function lifecycleFor(status: string | null): LifecycleAction | null {
    if (status === "pending") return "approve";
    if (status === "active") return "suspend";
    if (status === "suspended") return "reactivate";
    return null;
  }

  const nextAction = data?.profile ? lifecycleFor(data.profile.status) : null;

  return (
    <>
      {visibleId && (
        <Drawer state={state}>
          <Drawer.Backdrop>
            <Drawer.Content placement={isMobile ? "bottom" : "right"}>
              <Drawer.Dialog
                aria-label="Hotel detail"
                className={
                  isMobile
                    ? "h-[85dvh] rounded-t-2xl"
                    : "h-full w-[480px] max-w-[92vw] rounded-none"
                }
              >
                {isMobile && <Drawer.Handle />}
                <Drawer.Header className="border-b border-border/60">
                  <div className="min-w-0 flex-1 pr-8">
                    {data?.profile ? (
                      <>
                        <Drawer.Heading className="truncate text-base">
                          {data.profile.name}
                        </Drawer.Heading>
                        <div className="flex items-center gap-2 mt-1.5">
                          <StatusChip status={data.profile.status} />
                          <span className="text-caption text-muted-foreground truncate">
                            {[data.profile.city, data.profile.country]
                              .filter(Boolean)
                              .join(", ") || data.profile.slug}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2 py-1">
                        <Skeleton className="h-5 w-40 rounded-md" />
                        <Skeleton className="h-4 w-28 rounded-md" />
                      </div>
                    )}
                  </div>
                  <Drawer.CloseTrigger />
                </Drawer.Header>

                <Drawer.Body className="px-0">
                  <DrawerContent
                    q={q.data}
                    isLoading={q.isPending}
                    isError={q.isError}
                    onRetry={() => q.refetch()}
                  />
                </Drawer.Body>

                {/* Sticky footer — gated lifecycle action */}
                <Drawer.Footer className="border-t border-border/60">
                  {nextAction && data?.profile ? (
                    <>
                      <Button
                        variant={ACTION_COPY[nextAction].variant}
                        fullWidth
                        onPress={() => setConfirmAction(nextAction)}
                        isDisabled={acting}
                        className="min-h-11"
                      >
                        {nextAction === "approve" && "Approve hotel"}
                        {nextAction === "suspend" && "Suspend hotel"}
                        {nextAction === "reactivate" && "Reactivate hotel"}
                      </Button>
                      <AlertDialog.Backdrop
                        isOpen={confirmAction === nextAction}
                        onOpenChange={(open) => {
                          if (!open) setConfirmAction(null);
                        }}
                      >
                        <AlertDialog.Container placement="center" size="sm">
                          <AlertDialog.Dialog aria-labelledby="lifecycle-heading">
                            <AlertDialog.Header>
                              <AlertDialog.Icon
                                status={ACTION_COPY[nextAction].variant === "danger" ? "danger" : "success"}
                              />
                              <AlertDialog.Heading id="lifecycle-heading">
                                {ACTION_COPY[nextAction].title}
                              </AlertDialog.Heading>
                            </AlertDialog.Header>
                            <AlertDialog.Body>
                              {ACTION_COPY[nextAction].body(data.profile.name)}
                            </AlertDialog.Body>
                            <AlertDialog.Footer>
                              <Button slot="close" variant="tertiary" className="min-h-11" isDisabled={acting}>
                                Cancel
                              </Button>
                              <Button
                                slot="close"
                                variant={ACTION_COPY[nextAction].variant}
                                onPress={() => runAction(nextAction)}
                                isPending={acting}
                                className="min-h-11"
                              >
                                {ACTION_COPY[nextAction].confirm}
                              </Button>
                            </AlertDialog.Footer>
                          </AlertDialog.Dialog>
                        </AlertDialog.Container>
                      </AlertDialog.Backdrop>
                    </>
                  ) : data?.profile ? (
                    <p className="text-caption text-muted-foreground w-full text-center py-1">
                      No lifecycle actions available for cancelled hotels.
                    </p>
                  ) : null}
                </Drawer.Footer>
              </Drawer.Dialog>
            </Drawer.Content>
          </Drawer.Backdrop>
        </Drawer>
      )}
    </>
  );
}

// ── Tabs content ─────────────────────────────────────────────────

type QData = Awaited<ReturnType<typeof getHotel360>>;

function DrawerContent({
  q,
  isLoading,
  isError,
  onRetry,
}: {
  q: QData | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) return <DrawerSkeleton />;

  if (isError || !q?.success || !q.profile) {
    return (
      <div className="py-14 px-6 flex flex-col items-center gap-3 text-center">
        <p className="text-body text-muted-foreground">
          {q && !q.success ? q.error : "Could not load hotel details."}
        </p>
        <Button variant="outline" size="sm" onPress={onRetry} className="min-h-11 gap-1.5">
          Retry
        </Button>
      </div>
    );
  }

  const { profile, operations, money, staff, audit } = q;

  return (
    <Tabs className="w-full">
      <Tabs.ListContainer className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/60">
        <Tabs.List aria-label="Hotel sections" className="text-xs sm:text-sm">
          <Tabs.Tab id="profile">Profile<Tabs.Indicator /></Tabs.Tab>
          <Tabs.Tab id="operations">Operations<Tabs.Indicator /></Tabs.Tab>
          <Tabs.Tab id="money">Money<Tabs.Indicator /></Tabs.Tab>
          <Tabs.Tab id="staff">Staff<Tabs.Indicator /></Tabs.Tab>
          <Tabs.Tab id="audit">Audit<Tabs.Indicator /></Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>

      <Tabs.Panel id="profile" className="p-4 sm:p-5 space-y-4">
        <dl className="space-y-3">
          <Field label="Location">
            {[profile.city, profile.country].filter(Boolean).join(", ") || "—"}
          </Field>
          <Field label="Plan"><span className="capitalize">{profile.plan ?? "—"}</span></Field>
          <Field label="Status"><StatusChip status={profile.status} /></Field>
          <Field label="Created">{formatDateTime(profile.created_at)}</Field>
          <Field label="Paystack account">
            {profile.paystack_business_name ?? "Not connected"}
          </Field>
          <Field label="Booking page">
            {profile.custom_domain ? (
              <a
                href={`https://${profile.custom_domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline inline-flex items-center gap-1"
              >
                {profile.custom_domain}
                <ExternalLink className="size-3" />
              </a>
            ) : (
              <a
                href={`/${profile.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline inline-flex items-center gap-1"
              >
                /{profile.slug}
                <ExternalLink className="size-3" />
              </a>
            )}
          </Field>
        </dl>
      </Tabs.Panel>

      <Tabs.Panel id="operations" className="p-4 sm:p-5 space-y-3">
        <p className="text-caption text-muted-foreground">
          Check-ins over the last 30 days · {operations?.activeRooms ?? 0} sellable rooms
        </p>
        {!operations?.hasData ? (
          <div className="card-default p-4 text-caption text-muted-foreground">
            No qualifying check-ins in this window — derived rates are shown as “—”
            rather than zeros.
          </div>
        ) : null}
        {operations?.mixedRates && (
          <p className="text-caption text-warning">
            Rates below use {operations.rateCurrency} only — this window has bookings in multiple currencies.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <Metric label="Bookings" value={operations?.bookings ? operations.bookings.toLocaleString() : "—"} />
          <Metric label="Nights sold" value={operations?.nightsSold ? operations.nightsSold.toLocaleString() : "—"} />
          <Metric label="Avg occupancy" value={pct(operations?.avgOccupancy)} />
          <Metric
            label={`ADR${operations?.rateCurrency ? ` · ${operations.rateCurrency}` : ""}`}
            value={money_(operations?.adr, operations?.rateCurrency ?? "GHS")}
          />
          <Metric
            label={`RevPAR${operations?.rateCurrency ? ` · ${operations.rateCurrency}` : ""}`}
            value={money_(operations?.revpar, operations?.rateCurrency ?? "GHS")}
            accent
          />
        </div>
      </Tabs.Panel>

      <Tabs.Panel id="money" className="p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-3 gap-2.5">
          <Metric
            label="Collected"
            value={<MoneyTotals totals={money?.collected ?? []} />}
          />
          <Metric
            label="Platform fees"
            value={<MoneyTotals totals={money?.fees ?? []} />}
            accent
          />
          <Metric
            label="Outstanding"
            value={
              <span className={(money?.outstanding.some((t) => t.amount > 0) ? "text-warning" : "")}>
                <MoneyTotals totals={money?.outstanding ?? []} />
              </span>
            }
            tone={(money?.outstanding.some((t) => t.amount > 0) ? "warning" : undefined)}
          />
        </div>

        <div>
          <p className="text-label text-muted-foreground mb-2">Last 5 payments</p>
          {(money?.lastPayments.length ?? 0) === 0 ? (
            <div className="card-default p-4 text-caption text-muted-foreground">
              No payments recorded yet.
            </div>
          ) : (
            <ul className="divide-y divide-border/40 card-default overflow-hidden">
              {money!.lastPayments.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums">
                      {formatCurrency(p.amount, p.currency)}
                    </p>
                    <p className="text-caption text-muted-foreground">
                      {capitalize(p.method ?? "unknown")} · {formatDateTime(p.paid_at)}
                    </p>
                  </div>
                  <PaymentStatusChip status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Tabs.Panel>

      <Tabs.Panel id="staff" className="p-4 sm:p-5 space-y-3">
        <p className="text-caption text-muted-foreground">
          Active staff accounts by role — contact details stay in the hotel workspace.
        </p>
        {(staff?.length ?? 0) === 0 ? (
          <div className="card-default p-4 text-caption text-muted-foreground">
            No active staff yet.
          </div>
        ) : (
          <ul className="card-default divide-y divide-border/40 overflow-hidden">
            {staff!.map((s) => (
              <li key={s.role} className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-sm capitalize">{s.role.replace(/_/g, " ")}</span>
                <span className="text-sm font-semibold tabular-nums">{s.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Tabs.Panel>

      <Tabs.Panel id="audit" className="p-4 sm:p-5 space-y-3">
        <p className="text-caption text-muted-foreground">
          Platform team actions on this hotel.
        </p>
        {(audit?.length ?? 0) === 0 ? (
          <div className="card-default p-4 text-caption text-muted-foreground">
            No platform actions recorded yet.
          </div>
        ) : (
          <ol className="relative space-y-0">
            {audit!.map((entry, i) => {
              const before = statusOf(entry.before_state);
              const after = statusOf(entry.after_state);
              return (
                <li key={entry.id} className={"relative pl-5 pb-5 " + (i === audit!.length - 1 ? "pb-1" : "")}>
                  {i < audit!.length - 1 && (
                    <span className="absolute left-[5px] top-4 bottom-0 w-px bg-border/70" aria-hidden />
                  )}
                  <span className="absolute left-0 top-1.5 size-2.5 rounded-full border-2 border-background bg-foreground/50" aria-hidden />
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <p className="text-sm font-medium">{AUDIT_LABELS[entry.action] ?? entry.action}</p>
                    {before !== after && (
                      <span className="text-caption text-muted-foreground tabular-nums">
                        {before ?? "?"} → {after ?? "?"}
                      </span>
                    )}
                  </div>
                  <p className="text-caption text-muted-foreground mt-0.5">
                    {entry.admin_email} · {formatDateTime(entry.created_at)}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </Tabs.Panel>
    </Tabs>
  );
}

// ── Small parts ──────────────────────────────────────────────────

/** Primary currency total with muted "+X <ccy>" suffix for extras. */
function MoneyTotals({
  totals,
}: {
  totals: { currency: string; amount: number }[];
}) {
  if (totals.length === 0) return <>0</>;
  const primary = totals[0];
  const rest = totals.slice(1);
  return (
    <span className="tabular-nums whitespace-nowrap">
      {formatCurrencyCompact(primary.amount, primary.currency)}
      {rest.length > 0 && (
        <span className="text-muted-foreground text-xs font-normal">
          {" "}+{formatCurrencyCompact(
            rest.reduce((s, t) => s + t.amount, 0),
            rest[0].currency
          )}
        </span>
      )}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-caption text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-sm text-foreground text-right min-w-0">{children}</dd>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
  tone?: "warning";
}) {
  return (
    <div className="card-default p-3 min-w-0">
      <p className="text-label text-muted-foreground truncate">{label}</p>
      <p
        className={
          "mt-1 tabular-nums truncate " +
          (tone === "warning"
            ? "text-warning"
            : accent
              ? "text-accent"
              : "text-foreground") +
          " text-lg font-semibold"
        }
      >
        {value}
      </p>
    </div>
  );
}

function PaymentStatusChip({ status }: { status: string | null }) {
  const map: Record<string, { color: "success" | "warning" | "danger" | "default"; label: string }> = {
    success: { color: "success", label: "Success" },
    pending: { color: "warning", label: "Pending" },
    failed: { color: "danger", label: "Failed" },
    refunded: { color: "default", label: "Refunded" },
  };
  const s = map[status ?? "pending"] ?? map.pending;
  return (
    <Chip size="sm" variant="soft" color={s.color}>
      {s.label}
    </Chip>
  );
}

function DrawerSkeleton() {
  return (
    <div className="p-4 sm:p-5 space-y-4" aria-busy="true">
      <Skeleton className="h-9 w-full max-w-md rounded-lg" />
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[72px] rounded-xl bg-muted/50" />
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded-xl bg-muted/40" />
      <Skeleton className="h-24 w-full rounded-xl bg-muted/40" />
    </div>
  );
}

function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${v}%`;
}
function money_(v: number | null | undefined, cur: string): string {
  return v == null ? "—" : formatCurrencyCompact(v, cur);
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}
function statusOf(state: Record<string, unknown> | null): string | null {
  return typeof state?.status === "string" ? state.status : null;
}
