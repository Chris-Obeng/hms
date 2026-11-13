import type { CSSProperties } from "react";
import { ActionLink, SecondaryLink } from "./action-link";

export function ClosingCta() {
  return (
    <section className="rl-band-dark rl-closing" aria-labelledby="closing-heading">
      <div className="rl-wrap rl-closing-inner" data-reveal="">
        <h2 id="closing-heading" className="rl-h2 rl-r">
          Your front desk, calmer by&nbsp;tonight.
        </h2>
        <div className="rl-actions rl-r" style={{ "--i": 1 } as CSSProperties}>
          <ActionLink tone="brass" />
          <SecondaryLink href="/sign-in">Sign in</SecondaryLink>
        </div>
      </div>
    </section>
  );
}
