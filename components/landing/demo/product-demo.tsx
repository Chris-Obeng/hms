import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { easeOut, span, ui } from "./ui";
import type { DemoSize } from "./scenes";
import { PaymentScreen } from "./screens/payment";

/*
 * The composition: one folio, settled end to end.
 *
 * The scene is a plain, hook-free component in ./screens that reads a local
 * frame number; this is the only file in the folder that knows Remotion
 * exists. Timing, canvas sizes and the caption live in ./scenes, which the
 * page reads directly — so the window and caption render long before this
 * module is ever fetched.
 */

export {
  DURATION_IN_FRAMES,
  DURATION_SECONDS,
  FPS,
  SIZES,
  CAPTION,
  type DemoSize,
} from "./scenes";

export function ProductDemo({ size = "desktop" }: { size?: DemoSize }) {
  const frame = useCurrentFrame();
  // The composition is rendered at SIZES[size]; width tells us the geometry.
  const { width } = useVideoConfig();
  const wide = size === "desktop" || width >= 900;

  // A single evergreen rule draws across the top edge as the folio opens — the
  // one bit of chrome, and it says "live", not "next scene".
  const draw = easeOut(span(frame, 0, 22));

  return (
    <AbsoluteFill style={{ background: ui.paper, overflow: "hidden" }}>
      <PaymentScreen frame={frame} wide={wide} />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: 2,
          width: `${draw * 100}%`,
          background: ui.brand,
        }}
      />
    </AbsoluteFill>
  );
}
