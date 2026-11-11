import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface ActionLinkProps {
  href?: string;
  label?: string;
  variant?: "primary" | "brass";
  size?: "md" | "sm";
}

export function ActionLink({
  href = "/sign-up",
  label = "Get started",
  variant = "primary",
  size = "md",
}: ActionLinkProps) {
  const classes = [
    "rl-btn",
    `rl-btn--${variant}`,
    size === "sm" ? "rl-btn--sm" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Link href={href} prefetch={false} className={classes}>
      <span>{label}</span>
      <ArrowRight
        aria-hidden="true"
        size={16}
        strokeWidth={2}
        className="rl-btn-arrow"
      />
    </Link>
  );
}
