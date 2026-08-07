"use client";

import type React from "react";
import { Switch as HeroSwitch } from "@heroui/react";

import { cn } from "@/lib/utils";

type SwitchProps = Omit<
  React.ComponentProps<typeof HeroSwitch>,
  "isSelected" | "onChange" | "size"
> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: "sm" | "lg";
};

function Switch({
  checked,
  onCheckedChange,
  size = "sm",
  className,
  "aria-label": ariaLabel,
  ...props
}: SwitchProps) {
  return (
    <HeroSwitch
      {...props}
      aria-label={ariaLabel ?? "Toggle setting"}
      className={className}
      isSelected={checked}
      onChange={onCheckedChange}
      size={size === "lg" ? "md" : "sm"}
    >
      {({ isSelected }) => (
        <HeroSwitch.Content>
          <HeroSwitch.Control
            className={cn(
              "border shadow-inner transition-colors duration-200",
              isSelected
                ? "border-blue-600 bg-blue-600 data-[hovered=true]:bg-blue-500"
                : "border-border/70 bg-muted data-[hovered=true]:bg-muted/80",
            )}
          >
            <HeroSwitch.Thumb className="bg-white shadow-sm ring-1 ring-black/10" />
          </HeroSwitch.Control>
        </HeroSwitch.Content>
      )}
    </HeroSwitch>
  );
}

export { Switch };
