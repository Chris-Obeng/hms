"use client";

import type React from "react";
import { Button as HeroButton } from "@heroui/react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-styles";

type LegacyVariant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
type LegacySize = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";

type ButtonProps = Omit<React.ComponentProps<typeof HeroButton>, "variant" | "size" | "isDisabled" | "isPending" | "isIconOnly"> & {
  variant?: LegacyVariant;
  size?: LegacySize;
  disabled?: boolean;
  loading?: boolean;
};

const variants: Record<LegacyVariant, "primary" | "secondary" | "tertiary" | "outline" | "ghost" | "danger"> = {
  default: "primary",
  outline: "outline",
  secondary: "secondary",
  ghost: "ghost",
  destructive: "danger",
  link: "tertiary",
};

const sizes: Record<LegacySize, "sm" | "md" | "lg"> = {
  default: "md", xs: "sm", sm: "sm", lg: "lg", icon: "md", "icon-xs": "sm", "icon-sm": "sm", "icon-lg": "lg",
};

export function Button({
  variant = "default", size = "default", disabled, loading, onClick, className, children, ...props
}: ButtonProps) {
  const iconOnly = size.startsWith("icon");
  return (
    <HeroButton
      {...props}
      className={cn(variant === "link" && "px-0 underline-offset-4 hover:underline", iconOnly && "px-0", className)}
      isDisabled={disabled}
      isIconOnly={iconOnly}
      isPending={loading}
      onClick={onClick}
      size={sizes[size]}
      variant={variants[variant]}
    >
      {children}
    </HeroButton>
  );
}

export { buttonVariants };
