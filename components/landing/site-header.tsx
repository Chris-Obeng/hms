import Link from "next/link";
import { ActionLink } from "./action-link";
import { Logo, Wordmark } from "./logo";

export function SiteHeader() {
  return (
    <header className="rl-header">
      <div className="rl-wrap rl-header-row">
        <a href="#top" className="rl-wordmark" aria-label="RoomLine, back to top">
          <Logo />
          <Wordmark />
        </a>

        <div className="rl-header-actions">
          <Link href="/sign-in" prefetch={false} className="rl-nav-link rl-signin">
            Sign in
          </Link>
          <ActionLink size="sm" />
        </div>
      </div>
    </header>
  );
}
