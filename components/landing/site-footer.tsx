import Link from "next/link";
import { Logo, Wordmark } from "./logo";

export function SiteFooter() {
  return (
    <footer className="rl-footer">
      <div className="rl-wrap">
        <div className="rl-footer-row">
          <a href="#top" className="rl-wordmark" aria-label="RoomLine, back to top">
            <Logo />
            <Wordmark />
          </a>
          <nav aria-label="Footer" className="rl-footer-links">
            <Link href="/sign-in" prefetch={false}>
              Sign in
            </Link>
            <Link href="/sign-up" prefetch={false}>
              Create workspace
            </Link>
          </nav>
          <p className="rl-small rl-muted">
            © {new Date().getFullYear()} RoomLine · Accra, Ghana
          </p>
        </div>
      </div>
    </footer>
  );
}
