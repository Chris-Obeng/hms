import Link from "next/link";
import { Logo, Wordmark } from "./logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "#product", label: "Room calendar" },
      { href: "#direct", label: "Direct bookings" },
      { href: "#how-it-works", label: "How it works" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/sign-up", label: "Set up your hotel" },
      { href: "/sign-in", label: "Sign in" },
      { href: "#questions", label: "Questions" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="rl-footer">
      <div className="rl-wrap">
        <div className="rl-footer-top">
          <div className="rl-footer-brand">
            <a href="#top" className="rl-wordmark" aria-label="Oriel, back to top">
              <Logo />
              <Wordmark />
            </a>
            <p className="rl-footer-line">Hotel software for independent hotels and guesthouses.</p>
          </div>
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="rl-footer-col">
              <p className="rl-footer-head">{col.title}</p>
              <ul>
                {col.links.map((l) => (
                  <li key={l.href}>
                    {l.href.startsWith("#") ? (
                      <a href={l.href}>{l.label}</a>
                    ) : (
                      <Link href={l.href} prefetch={false}>
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className="rl-footer-giant" aria-hidden="true">
          oriel
        </p>
        <div className="rl-footer-bottom">
          <p>© {new Date().getFullYear()} Oriel</p>
          <p>Made in Ghana</p>
        </div>
      </div>
    </footer>
  );
}
