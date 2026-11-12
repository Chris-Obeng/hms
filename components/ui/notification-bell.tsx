"use client";

import * as React from "react";
import { Badge, Button, type ButtonProps } from "@heroui/react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

type HeroBadgeColor = "danger" | "accent" | "success" | "warning" | "default";
type LegacyColor = "red" | "orange" | "green" | "blue";

export interface NotificationBellProps {
  count?: number;
  max?: number;
  variant?: "count" | "dot";
  color?: HeroBadgeColor | LegacyColor;
  /** Monotonic signal incremented only when a live realtime alert arrives. */
  ringSignal?: number;
  isOpen?: boolean;
  onPress?: ButtonProps["onPress"];
  onClick?: () => void;
  className?: string;
  "aria-label"?: string;
  "aria-haspopup"?: React.AriaAttributes["aria-haspopup"];
  "aria-expanded"?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

function resolveBadgeColor(color: NotificationBellProps["color"]): HeroBadgeColor {
  switch (color) {
    case "red":
    case "danger":
    case undefined:
      return "danger";
    case "orange":
    case "warning":
      return "warning";
    case "green":
    case "success":
      return "success";
    case "blue":
    case "accent":
      return "accent";
    default:
      return "default";
  }
}

export function NotificationBell({
  count = 0,
  max = 99,
  variant = "count",
  color = "danger",
  ringSignal = 0,
  isOpen = false,
  onPress,
  onClick,
  className,
  "aria-label": ariaLabel,
  "aria-haspopup": ariaHasPopup = "dialog",
  "aria-expanded": ariaExpanded,
  ref,
}: NotificationBellProps) {
  const iconRef = React.useRef<SVGSVGElement | null>(null);
  const lastRingRef = React.useRef(ringSignal);
  const activeAnimRef = React.useRef<Animation | null>(null);

  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const badgeColor = resolveBadgeColor(color);
  const displayValue = total > max ? `${max}+` : String(total);
  const computedLabel =
    ariaLabel ??
    (total > 0
      ? `Notifications, ${total} unread`
      : "Notifications");

  React.useEffect(() => {
    return () => {
      activeAnimRef.current?.cancel();
      activeAnimRef.current = null;
    };
  }, []);

  // Physical top-pivoted bell swing via WAAPI — fires ONLY on a genuine live
  // arrival (`ringSignal` increment), never on hydration or count sync.
  // If a swing is already in flight during a burst, let it complete naturally
  // rather than snapping mid-arc back to 0deg.
  React.useEffect(() => {
    if (ringSignal <= lastRingRef.current) {
      lastRingRef.current = ringSignal;
      return;
    }
    lastRingRef.current = ringSignal;

    const el = iconRef.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (activeAnimRef.current?.playState === "running") return;

    const anim = el.animate(
      [
        { transform: "rotate(0deg)" },
        { transform: "rotate(13deg)", offset: 0.2 },
        { transform: "rotate(-10deg)", offset: 0.45 },
        { transform: "rotate(6deg)", offset: 0.7 },
        { transform: "rotate(-2.5deg)", offset: 0.88 },
        { transform: "rotate(0deg)" },
      ],
      {
        duration: 420,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      }
    );
    activeAnimRef.current = anim;
    anim.onfinish = () => {
      if (activeAnimRef.current === anim) {
        activeAnimRef.current = null;
      }
    };
  }, [ringSignal]);

  const hasCustomPress = Boolean(onPress || onClick);
  const handlePress: ButtonProps["onPress"] = React.useCallback(
    (e: Parameters<NonNullable<ButtonProps["onPress"]>>[0]) => {
      onPress?.(e);
      onClick?.();
    },
    [onPress, onClick]
  );

  return (
    <Badge.Anchor className="inline-flex shrink-0">
      <Button
        ref={ref}
        variant="ghost"
        size="sm"
        isIconOnly
        onPress={hasCustomPress ? handlePress : undefined}
        aria-label={computedLabel}
        aria-haspopup={ariaHasPopup}
        aria-expanded={ariaExpanded ?? (isOpen ? true : undefined)}
        data-slot="notification-bell"
        data-open={isOpen ? "true" : undefined}
        className={cn(
          "relative size-10 shrink-0 rounded-lg text-muted-foreground transition-[transform,background-color,color] duration-150 ease-[var(--ease-out-ui)] md:size-8",
          "max-md:after:absolute max-md:after:-inset-0.5 max-md:after:content-['']",
          "active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100",
          "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/60 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground",
          isOpen && "bg-muted/70 text-foreground",
          className
        )}
      >
        <Bell
          ref={iconRef}
          aria-hidden="true"
          strokeWidth={2}
          className="size-[19px] origin-[50%_12%] md:size-[18px]"
        />
      </Button>

      {total > 0 && (
        <Badge
          color={badgeColor}
          variant="primary"
          size="sm"
          placement="top-right"
          aria-hidden="true"
          className={cn(
            "notification-badge pointer-events-none select-none font-semibold tabular-nums shadow-xs",
            variant === "dot"
              ? "size-3 min-h-3 min-w-3 rounded-full p-0"
              : "min-h-[18px] min-w-[18px] rounded-full px-1 text-[11px] leading-none tracking-tight"
          )}
        >
          {variant === "dot" ? undefined : displayValue}
        </Badge>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {total > 0 ? `${total} unread notification${total === 1 ? "" : "s"}` : ""}
      </span>
    </Badge.Anchor>
  );
}

export default NotificationBell;
