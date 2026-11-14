import Link from "next/link";
import type { ReactNode } from "react";
import { RoomLineGlyph, RoomLineMark } from "@/components/brand/roomline-mark";

/**
 * The frame every RoomLine account screen sits in: sign-in, sign-up, the
 * staff invite, and the account-status pages.
 *
 * Phones get one column: wordmark, the screen's single task, a quiet footer.
 * From 1024 px an ink panel on the left carries one line about RoomLine and
 * the lit doorway, so the form keeps the right side to itself.
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
        <aside className="rl-auth-aside rl-on-ink" aria-hidden="true">
          <Link href="/" className="rl-wordmark rl-auth-aside-brand" tabIndex={-1}>
            <RoomLineGlyph size={22} className="text-white" />
            <span className="rl-wordmark-text">RoomLine</span>
          </Link>
          <div className="rl-auth-door">
            <RoomLineMark size={512} className="rl-auth-door-mark" />
            <svg className="rl-auth-door-light" viewBox="0 0 512 1152" focusable="false">
              <defs>
                <linearGradient id="rl-auth-floor" x1="0" y1="388" x2="0" y2="1100" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#FFC23D" stopOpacity="0.28" />
                  <stop offset="1" stopColor="#FFC23D" stopOpacity="0" />
                </linearGradient>
                <filter id="rl-auth-soft" x="-20%" y="-5%" width="140%" height="110%">
                  <feGaussianBlur stdDeviation="9" />
                </filter>
              </defs>
              <path d="M162 402H302L500 1152H-36Z" fill="url(#rl-auth-floor)" filter="url(#rl-auth-soft)" />
            </svg>
          </div>
          <div className="rl-auth-aside-copy">
            <p className="rl-auth-aside-title">{aside.title}</p>
            <p className="rl-auth-aside-body">{aside.body}</p>
          </div>
        </aside>
      ) : null}

      <div className="rl-auth-main">
        <header className="rl-auth-top">
          <Link href="/" className="rl-wordmark rl-auth-brand" aria-label="RoomLine home">
            <RoomLineGlyph size={22} />
            <span className="rl-wordmark-text">RoomLine</span>
          </Link>
          {topAction ? <div className="rl-auth-top-action">{topAction}</div> : null}
        </header>

        <main id="main-content" className="rl-auth-body">
          <div className={`rl-auth-column rl-auth-column--${width} rl-enter`}>{children}</div>
        </main>

        <footer className="rl-auth-foot">
          {footer ?? <span>© {new Date().getFullYear()} RoomLine · Accra</span>}
        </footer>
      </div>
    </div>
  );
}
