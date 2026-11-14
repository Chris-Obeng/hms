import Link from "next/link";
import { ActionLink } from "./action-link";
import { Logo, Wordmark } from "./logo";

const NAV = [
  { href: "#product", label: "Product" },
  { href: "#direct", label: "Direct bookings" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#questions", label: "Questions" },
] as const;

export function SiteHeader() {
  return (
    <header className="rl-header">
      <div className="rl-wrap rl-header-row">
        <a href="#top" className="rl-wordmark" aria-label="Oriel, back to top">
          <Logo />
          <Wordmark />
        </a>

        <nav aria-label="Main" className="rl-nav">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="rl-nav-link">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="rl-header-actions">
          <Link href="/sign-in" prefetch={false} className="rl-nav-link rl-signin">
            Sign in
          </Link>
          <ActionLink size="md" />
        </div>
      </div>
    </header>
  );
}
