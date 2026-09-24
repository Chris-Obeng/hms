import Link from "next/link";
import { Logo } from "@/components/landing/site-header";

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Front-desk calendar", href: "#features" },
      { label: "Payments & mobile money", href: "#features" },
      { label: "Direct booking page", href: "#features" },
    ],
  },
  {
    heading: "For hotels",
    links: [
      { label: "Sign in", href: "/sign-in" },
      { label: "Set up your hotel", href: "/onboarding" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--lp-hairline)] bg-[var(--lp-tint)]">
      <div className="lp-container py-12 md:py-16">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Link href="/" className="flex items-center gap-2.5" aria-label="RoomLine home">
              <Logo size={24} />
              <span className="text-[15px] font-bold tracking-tight">RoomLine</span>
            </Link>
            <p className="lp-small mt-3">
              Hotel management for guesthouses and hotels in Ghana and across
              Africa.
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-14 gap-y-2.5">
            {COLUMNS.map((column) => (
              <div key={column.heading} className="space-y-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {column.heading}
                </p>
                {column.links.map((link) =>
                  link.href.startsWith("/") ? (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="block text-sm text-muted transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      key={link.label}
                      href={link.href}
                      className="block text-sm text-muted transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  ),
                )}
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-[var(--lp-hairline)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="lp-micro">
            © {new Date().getFullYear()} RoomLine Ltd. Registered in Accra, Ghana.
          </p>
          <p className="lp-micro">
            Payments processed by Paystack · Settled in GHS
          </p>
        </div>
      </div>
    </footer>
  );
}
