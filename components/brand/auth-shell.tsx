import Link from "next/link";
import type { ReactNode } from "react";
import { OrielGlyph, OrielMark } from "@/components/brand/oriel-mark";

/**
 * The frame every Oriel account screen sits in: sign-in, sign-up, the
 * staff invite, and the account-status pages.
 *
 * Phones get one column: wordmark, the screen's single task, a quiet footer.
 * From 1024 px a marigold panel on the left shows a glimpse of the product
 * and one line of copy, so the form keeps the right side to itself.
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
          <div className="rl-auth-today">
            <div className="rl-auth-today-head">
              <span>Today · Labadi Courtyard</span>
              <span className="rl-auth-today-live">Live</span>
            </div>
            <dl className="rl-auth-today-grid">
              <div>
                <dt>Arrivals</dt>
                <dd>6</dd>
              </div>
              <div>
                <dt>Departures</dt>
                <dd>4</dd>
              </div>
              <div>
                <dt>Rooms sold</dt>
                <dd>18 of 24</dd>
              </div>
              <div>
                <dt>Taken today</dt>
                <dd>GHS 4,820</dd>
              </div>
            </dl>
            <div className="rl-auth-today-row">
              <span className="rl-auth-today-dot" />
              <span>Nana Yaa Asare paid with MTN MoMo</span>
              <span className="rl-auth-today-amt">GHS 1,350</span>
            </div>
          </div>
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
          {footer ?? <span>© {new Date().getFullYear()} Oriel · Accra</span>}
        </footer>
      </div>
    </div>
  );
}
