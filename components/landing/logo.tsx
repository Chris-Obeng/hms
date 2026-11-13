import { RoomLineGlyph } from "@/components/brand/roomline-mark";

/** RoomLine open-door mark (lib/brand/mark.ts): ink frame, brass light. */
export function Logo({ size = 22 }: { size?: number }) {
  return <RoomLineGlyph size={size} className="rl-mark" />;
}

export function Wordmark() {
  return <span className="rl-wordmark-text">RoomLine</span>;
}
