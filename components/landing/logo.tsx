/** A doorway and its open threshold: a small, legible hospitality mark. */
export function Logo() {
  return (
    <svg className="rl-mark" viewBox="0 0 32 36" fill="none" aria-hidden="true">
      <path d="M4 32V10a10 10 0 0 1 20 0v22" stroke="currentColor" strokeWidth="3.5" />
      <path d="M12 32V12l16-6v26" fill="currentColor" />
      <path d="M2 33h28" stroke="currentColor" strokeWidth="3" />
      <path d="M23 18v4" stroke="var(--rl-accent, #dbaf79)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ period = false }: { period?: boolean }) {
  return <span>RoomLine{period ? "." : ""}</span>;
}
