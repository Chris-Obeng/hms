import { OrielGlyph } from "@/components/brand/oriel-mark";

/** Oriel mark (lib/brand/mark.ts): a marigold sun with an arched window. */
export function Logo({ size = 24 }: { size?: number }) {
  return <OrielGlyph size={size} className="rl-mark" />;
}

/** Lowercase wordmark, set in the brand face. */
export function Wordmark() {
  return <span className="rl-wordmark-text">oriel</span>;
}
