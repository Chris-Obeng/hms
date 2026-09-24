import Link from "next/link";

const NAV_ITEMS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--lp-hairline)] bg-white">
      <div className="lp-container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5" aria-label="RoomLine home">
          <Logo />
          <span className="text-[17px] font-bold tracking-tight">RoomLine</span>
        </Link>

        <nav
          aria-label="Main"
          className="hidden items-center gap-8 text-sm font-medium text-muted md:flex"
        >
          {NAV_ITEMS.map((item) => (
            <a key={item.href} href={item.href} className="transition-colors hover:text-foreground">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <Link
            href="/sign-in"
            className="button button--ghost hidden h-10 items-center rounded-lg px-4 text-sm font-medium sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/onboarding"
            className="button button--primary inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-lg bg-accent text-accent-foreground"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 16 16" fill="none">
        <rect x="1" y="7" width="6" height="8" rx="1" fill="currentColor" fillOpacity="0.95" />
        <rect x="9" y="4" width="6" height="11" rx="1" fill="currentColor" fillOpacity="0.55" />
      </svg>
    </span>
  );
}
