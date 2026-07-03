"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const switchVariants = cva(
  [
    "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "data-[checked]:bg-foreground data-[unchecked]:bg-input",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "h-5 w-9",
        lg: "h-6 w-10",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
);

const thumbVariants = cva(
  [
    "pointer-events-none block rounded-full bg-background shadow-lg ring-0 transition-transform",
    "data-[checked]:translate-x-4 data-[unchecked]:translate-x-0",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "size-4",
        lg: "size-5",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
);

function Switch({
  className,
  size,
  ...props
}: SwitchPrimitive.Root.Props & VariantProps<typeof switchVariants>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(switchVariants({ size, className }))}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(thumbVariants({ size }))}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
