import Link from "next/link";
import { Logo } from "@/components/landing/site-header";

const COLUMNS = [
  {
    heading: "Modules",
    links: [
      { label: "Reservations & front desk", href: "#reservations" },
      { label: "Housekeeping", href: "#housekeeping" },
      { label: "Channel manager", href: "#channels" },
      { label: "Billing & POS", href: "#billing" },
    ],
  },
  {
    heading: "Property",
    links: [
      { label: "How it works", href: "#how" },
      { label: "Security", href: "#security" },
      { label: "Request a demo", href: "#demo" },
      { label: "Sign in", href: "/sign-in" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--lp-line-strong)] bg-[var(--lp-band)]">
      <div className="lp-container py-12 md:py-14">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Link href="/" className="lp-wordmark" aria-label="RoomLine home">
              <Logo size={24} />
              <span className="lp-wordmark__name">RoomLine</span>
            </Link>
            <p className="lp-small mt-3">
              Run the whole property from one dashboard — reservations, front
              desk, housekeeping, channels, billing and reporting.
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-14 gap-y-3">
            {COLUMNS.map((column) => (
              <div key={column.heading} className="space-y-3">
                <p className="lp-index">{column.heading}</p>
                {column.links.map((link) =>
                  link.href.startsWith("/") ? (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="block text-sm text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-ink)]"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      key={link.label}
                      href={link.href}
                      className="block text-sm text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-ink)]"
                    >
                      {link.label}
                    </a>
                  ),
                )}
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-[var(--lp-line)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="lp-index">
            © {new Date().getFullYear()} RoomLine
          </p>
          <p className="lp-index">One dashboard · One ledger · One close of day</p>
        </div>
      </div>
    </footer>
  );
}
