import Link from "next/link";
import { ActionLink } from "./action-link";
import { Logo, Wordmark } from "./logo";

export function SiteHeader() {
  return (
    <header className="rl-header">
      <div className="rl-container rl-nav">
        <a href="#main-content" className="rl-wordmark" aria-label="RoomLine home">
          <Logo /><Wordmark />
        </a>
        <nav className="rl-nav-links" aria-label="Main navigation">
          <a href="#features">Platform</a>
          <a href="#how-it-works">How it works</a>
          <Link href="/sign-in" prefetch={false}>Sign in</Link>
        </nav>
        <ActionLink />
      </div>
    </header>
  );
}
