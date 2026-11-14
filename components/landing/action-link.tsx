import Link from "next/link";
import { buttonVariants } from "@heroui/react";

type ActionLinkProps = {
  href?: string;
  label?: string;
  size?: "md" | "lg";
  className?: string;
};

/**
 * The page's one primary action, a HeroUI button rendered as a link. Same name
 * everywhere: "Create workspace". On the forest band it turns brass
 * (`.rl-on-ink` in app/rl-theme.css).
 */
export function ActionLink({
  href = "/sign-up",
  label = "Create workspace",
  size = "lg",
  className,
}: ActionLinkProps) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={buttonVariants({ variant: "primary", size, className })}
    >
      <span>{label}</span>
      <svg
        className="rl-arrow"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M3.5 8h9M8.5 4l4 4-4 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

/** Secondary action: a quiet text link. */
export function SecondaryLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const cls = ["rl-link rl-link--action", className ?? ""].filter(Boolean).join(" ");
  return href.startsWith("#") ? (
    <a href={href} className={cls}>
      {children}
    </a>
  ) : (
    <Link href={href} prefetch={false} className={cls}>
      {children}
    </Link>
  );
}
