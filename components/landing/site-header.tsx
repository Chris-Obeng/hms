"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Reveal } from "@/components/landing/reveal";

/*
 * Sticky, minimal, ivory. Logo + five links + one CTA. The hairline
 * appears only once the page has scrolled and there is content to divide.
 */

const NAV_ITEMS = [
  { href: "#problem", label: "The problem" },
  { href: "#modules", label: "Modules" },
  { href: "#how", label: "How it works" },
  { href: "#security", label: "Security" },
  { href: "#demo", label: "Request a demo" },
] as const;

export function SiteHeader() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="lp-header" data-stuck={stuck ? "true" : undefined}>
      <Reveal as="div" className="lp-container flex h-16 items-center justify-between">
        <Link href="/" className="lp-wordmark" aria-label="RoomLine home">
          <Logo />
          <span className="lp-wordmark__name">RoomLine</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-8 lg:flex">
          {NAV_ITEMS.map((item) => (
            <a key={item.href} href={item.href} className="lp-navlink">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/sign-in" className="lp-navlink hidden sm:inline-flex">
            Sign in
          </Link>
          <Link href="/onboarding" className="lp-btn lp-btn--solid lp-btn--sm">
            Start free trial
          </Link>
        </div>
      </Reveal>
    </header>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: "var(--lp-brand)",
        color: "var(--lp-night-fg)",
      }}
      aria-hidden="true"
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 16 16" fill="none">
        <rect x="1" y="7" width="6" height="8" rx="1" fill="currentColor" fillOpacity="0.95" />
        <rect x="9" y="4" width="6" height="11" rx="1" fill="currentColor" fillOpacity="0.55" />
      </svg>
    </span>
  );
}
