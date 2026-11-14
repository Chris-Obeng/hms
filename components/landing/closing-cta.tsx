import type { CSSProperties } from "react";
import { OrielGlyph } from "@/components/brand/oriel-mark";
import { ActionLink, SecondaryLink } from "./action-link";

export function ClosingCta() {
  return (
    <section className="rl-band-dark rl-on-ink rl-closing" aria-labelledby="closing-heading">
      <div className="rl-wrap rl-closing-inner" data-reveal="">
        <div className="rl-closing-copy">
          <h2 id="closing-heading" className="rl-h2 rl-r">
            Your front desk, calmer by&nbsp;tonight.
          </h2>
          <p className="rl-lead rl-r" style={{ "--i": 1 } as CSSProperties}>
            Add your rooms and rates today. Take your first booking tonight.
          </p>
          <div className="rl-actions rl-r" style={{ "--i": 2 } as CSSProperties}>
            <ActionLink />
            <SecondaryLink href="/sign-in">Sign in</SecondaryLink>
          </div>
        </div>
        <div className="rl-closing-mark rl-r" style={{ "--i": 1 } as CSSProperties} aria-hidden="true">
          <OrielGlyph size={320} className="text-[var(--rl-night)]" />
        </div>
      </div>
    </section>
  );
}
