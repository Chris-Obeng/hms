import Link from "next/link";
import { Logo, Wordmark } from "./logo";

export function SiteFooter() {
  return (
    <footer className="rl-footer">
      <div className="rl-container">
        <div className="rl-footer-top">
          <a href="#main-content" className="rl-wordmark" aria-label="RoomLine home"><Logo /><Wordmark /></a>
          <nav aria-label="Footer navigation" className="rl-footer-links">
            <a href="#features">Platform</a><a href="#how-it-works">How it works</a><Link href="/sign-in" prefetch={false}>Sign in</Link>
          </nav>
        </div>
        <div className="rl-footer-bottom">
          <span>© {new Date().getFullYear()} RoomLine</span>
          <span>For independent hospitality in Ghana.</span>
          <a href="#main-content">Back to top ↑</a>
        </div>
      </div>
    </footer>
  );
}
