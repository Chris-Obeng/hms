import Link from "next/link";
import type { ReactNode } from "react";
import { OrielGlyph, OrielMark } from "@/components/brand/oriel-mark";
import { WindowView } from "@/components/brand/window-view";

/**
 * The frame every Oriel account screen sits in: sign-in, sign-up, the
 * staff invite, and the account-status pages.
 *
 * Phones get one column: wordmark, the screen's single task, a quiet footer.
 * From 1024 px a marigold panel on the left holds the brand illustration (the
 * view through an oriel window) and one line of copy, so the form keeps the
 * right side to itself.
 */
export function AuthShell({
  children,
  aside,
  topAction,
  footer,
  width = "form",
}: {
  children: ReactNode;
  /** Left panel copy on desktop. Omit for a single centred column. */
  aside?: { title: ReactNode; body: ReactNode };
  /** One quiet link in the top bar, e.g. "Sign in". */
  topAction?: ReactNode;
  footer?: ReactNode;
  /** `form` is 400 px for auth forms, `status` 480 px for message screens. */
  width?: "form" | "status";
}) {
  return (
    <div className={`rl-auth${aside ? " rl-auth--split" : ""}`}>
      {aside ? (
        <aside className="rl-auth-aside" aria-hidden="true">
          <Link href="/" className="rl-wordmark rl-auth-aside-brand" tabIndex={-1}>
            <OrielMark size={28} />
            <span className="rl-wordmark-text">oriel</span>
          </Link>
          <WindowView className="rl-auth-window" />
          <div className="rl-auth-aside-copy">
            <p className="rl-auth-aside-title">{aside.title}</p>
            <p className="rl-auth-aside-body">{aside.body}</p>
          </div>
        </aside>
      ) : null}

      <div className="rl-auth-main">
        <header className="rl-auth-top">
          <Link href="/" className="rl-wordmark rl-auth-brand" aria-label="Oriel home">
            <OrielGlyph size={24} />
            <span className="rl-wordmark-text">oriel</span>
          </Link>
          {topAction ? <div className="rl-auth-top-action">{topAction}</div> : null}
        </header>

        <main id="main-content" className="rl-auth-body">
          <div className={`rl-auth-column rl-auth-column--${width} rl-enter`}>{children}</div>
        </main>

        <footer className="rl-auth-foot">
          {footer ?? <span>© {new Date().getFullYear()} Oriel · Made in Ghana</span>}
        </footer>
      </div>
    </div>
  );
}
