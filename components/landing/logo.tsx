/**
 * Architectural three-bar elevation mark — matches RoomLine's /sign-in and
 * /sign-up threshold identity with brushed key-brass center column.
 */
export function Logo() {
  return (
    <span className="rl-mark" aria-hidden="true">
      <span className="rl-mark-bar rl-mark-bar--1" />
      <span className="rl-mark-bar rl-mark-bar--2" />
      <span className="rl-mark-bar rl-mark-bar--3" />
    </span>
  );
}

export function Wordmark({ period = true }: { period?: boolean }) {
  return (
    <span className="rl-wordmark-text">
      RoomLine{period ? <span className="rl-wordmark-dot">.</span> : null}
    </span>
  );
}
