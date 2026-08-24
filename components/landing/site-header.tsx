import Link from "next/link";

const NAV_ITEMS = [
  { href: "#see-it-work", label: "See it work" },
  { href: "#how-it-works", label: "How it works" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ivory/[0.06] bg-forest/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label="RoomLine home">
          <Logo />
          <span className="text-[17px] font-bold tracking-tight">RoomLine</span>
        </Link>

        <nav aria-label="Main" className="hidden md:flex items-center gap-7 text-sm font-medium text-ivory/60">
          {NAV_ITEMS.map((item) => (
            <a key={item.href} href={item.href} className="transition-colors hover:text-ivory">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="hidden sm:inline-flex h-11 items-center rounded-xl px-4 text-sm font-medium text-ivory/70 transition-colors hover:bg-ivory/[0.05] hover:text-ivory"
          >
            Sign in
          </Link>
          <Link
            href="/onboarding"
            className="inline-flex h-11 items-center rounded-xl bg-gold px-5 text-sm font-semibold text-forest transition-transform hover:-translate-y-px active:translate-y-0 active:scale-[0.99]"
          >
            Set up your hotel
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-lg bg-gradient-to-br from-[#e5c158] to-gold text-forest"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 16 16" fill="none">
        <rect x="1" y="7" width="6" height="8" rx="0.75" fill="currentColor" fillOpacity="0.9" />
        <rect x="9" y="4" width="6" height="11" rx="0.75" fill="currentColor" fillOpacity="0.55" />
      </svg>
    </span>
  );
}
