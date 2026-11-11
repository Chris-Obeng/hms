import Link from "next/link";
import { ActionLink } from "./action-link";
import { Logo, Wordmark } from "./logo";

export function SiteHeader() {
  return (
    <header className="rl-header">
      <div className="rl-wrap rl-nav">
        <a
          href="#main-content"
          className="rl-wordmark"
          aria-label="RoomLine home"
        >
          <Logo />
          <Wordmark />
        </a>

        <nav className="rl-nav-links" aria-label="Main navigation">
          <a href="#features" className="rl-nav-link">
            Features
          </a>
          <a href="#ghana" className="rl-nav-link">
            Ghana
          </a>
          <a href="#how-it-works" className="rl-nav-link">
            How it works
          </a>
        </nav>

        <div className="rl-nav-actions">
          <Link href="/sign-in" prefetch={false} className="rl-signin">
            Sign in
          </Link>
          <ActionLink size="sm" />
        </div>
      </div>
    </header>
  );
}
