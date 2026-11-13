"use client";

import { Description, Label, ListBox, Select } from "@heroui/react";

import { cn } from "@/lib/utils";

export type HeroSelectOption = {
  value: string;
  label: React.ReactNode;
  textValue?: string;
  isDisabled?: boolean;
};

type HeroSelectFieldProps = {
  value?: string | null;
  onValueChange: (value: string) => void;
  options: readonly HeroSelectOption[];
  label?: React.ReactNode;
  description?: React.ReactNode;
  placeholder?: string;
  isDisabled?: boolean;
  isInvalid?: boolean;
  isRequired?: boolean;
  name?: string;
  variant?: "primary" | "secondary";
  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;
  ariaLabel?: string;
};

export function HeroSelectField({
  value,
  onValueChange,
  options,
  label,
  description,
  placeholder = "Select an option",
  isDisabled,
  isInvalid,
  isRequired,
  name,
  variant = "secondary",
  className,
  triggerClassName,
  popoverClassName,
  ariaLabel,
}: HeroSelectFieldProps) {
  return (
    <Select
      aria-label={ariaLabel ?? (typeof label === "string" ? label : placeholder)}
      className={cn("w-full", className)}
      disabledKeys={options.filter((option) => option.isDisabled).map((option) => option.value)}
      fullWidth
      isDisabled={isDisabled}
      isInvalid={isInvalid}
      isRequired={isRequired}
      name={name}
      onChange={(nextValue) => onValueChange(nextValue == null ? "" : String(nextValue))}
      placeholder={placeholder}
      value={value || null}
      variant={variant}
    >
      {label ? <Label className="mb-2 text-xs font-medium text-muted-foreground">{label}</Label> : null}
      <Select.Trigger
        className={cn(
          "min-h-9 rounded-xl border border-border/60 bg-background px-3 text-sm shadow-none",
          "transition-colors hover:border-border data-[focus-visible=true]:border-ring",
          triggerClassName,
        )}
      >
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      {description ? <Description className="mt-1 text-xs text-muted-foreground">{description}</Description> : null}
      <Select.Popover
        className={cn(
          "max-h-72 min-w-(--trigger-width) rounded-xl border border-border/70 bg-popover p-1 shadow-xl",
          popoverClassName,
        )}
      >
        <ListBox>
          {options.map((option) => (
            <ListBox.Item
              id={option.value}
              key={option.value}
              textValue={option.textValue ?? (typeof option.label === "string" ? option.label : option.value)}
              className="rounded-lg px-3 py-2 text-sm"
            >
              <Label>{option.label}</Label>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
