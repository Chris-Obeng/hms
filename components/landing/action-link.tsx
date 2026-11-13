import Link from "next/link";

type ActionLinkProps = {
  href?: string;
  label?: string;
  /** `ink` on paper, `brass` on the forest band. */
  tone?: "ink" | "brass";
  size?: "md" | "sm";
  className?: string;
};

/** The page's one primary action. Same name everywhere: "Create workspace". */
export function ActionLink({
  href = "/sign-up",
  label = "Create workspace",
  tone = "ink",
  size = "md",
  className,
}: ActionLinkProps) {
  const classes = ["rl-btn", `rl-btn--${tone}`, size === "sm" ? "rl-btn--sm" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <Link href={href} prefetch={false} className={classes}>
      <span>{label}</span>
      <svg
        className="rl-btn-arrow"
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
  const external = href.startsWith("#");
  const cls = ["rl-link", className ?? ""].filter(Boolean).join(" ");
  return external ? (
    <a href={href} className={cls}>
      {children}
    </a>
  ) : (
    <Link href={href} prefetch={false} className={cls}>
      {children}
    </Link>
  );
}
