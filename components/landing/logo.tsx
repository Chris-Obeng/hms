import { RoomLineGlyph } from "@/components/brand/roomline-mark";

/**
 * RoomLine open-door mark (see lib/brand/mark.ts) in the landing ink, with the
 * lit room in brass.
 */
export function Logo() {
  return <RoomLineGlyph size={22} className="rl-mark" />;
}

export function Wordmark({ period = true }: { period?: boolean }) {
  return (
    <span className="rl-wordmark-text">
      RoomLine{period ? <span className="rl-wordmark-dot">.</span> : null}
    </span>
  );
}
