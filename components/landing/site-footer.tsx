import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-top"><div><Link href="/" className="lp-wordmark" aria-label="RoomLine home"><Logo /><span>RoomLine.</span></Link><p>More room for hospitality.</p></div><nav aria-label="Footer navigation"><a href="#platform">Platform</a><a href="#security">Access & accountability</a><Link href="/sign-in">Sign in</Link><a href="mailto:hello@roomline.app">Get in touch<ArrowUpRight size={15} aria-hidden="true" /></a></nav></div>
        <div className="lp-footer-bottom"><span>© {new Date().getFullYear()} RoomLine</span><span>Built around your hotel. Designed around you.</span><a href="#main-content">Back to top ↑</a></div>
      </div>
    </footer>
  );
}
