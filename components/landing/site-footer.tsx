import Link from "next/link";
import { Logo, Wordmark } from "./logo";

export function SiteFooter() {
  return (
    <footer className="rl-footer">
      <div className="rl-wrap">
        <div className="rl-footer-top">
          <a
            href="#main-content"
            className="rl-wordmark"
            aria-label="RoomLine home"
          >
            <Logo />
            <Wordmark />
          </a>

          <nav aria-label="Footer navigation" className="rl-footer-links">
            <a href="#features">Features</a>
            <a href="#ghana">Ghana</a>
            <a href="#how-it-works">How it works</a>
            <Link href="/sign-in" prefetch={false}>
              Sign in
            </Link>
            <Link href="/sign-up" prefetch={false}>
              Get started
            </Link>
          </nav>
        </div>

        <div className="rl-footer-meta rl-small">
          <span>© {new Date().getFullYear()} RoomLine · Accra, Ghana</span>
          <span>Lobby photos: Basile Morin, CC BY-SA 4.0</span>
          <a href="#main-content">Back to top</a>
        </div>
      </div>
    </footer>
  );
}
