import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { CalendarScene, type CalendarVariant } from "./calendar-scene";
import { FolioScene } from "./folio-scene";

/**
 * Remotion compositions for the landing-page films. Each one only reads the
 * frame and hands it to a pure scene, so the Player, the server-rendered
 * poster and Remotion Studio (`pnpm film:studio`) all draw the same pixels.
 */

export type CalendarFilmProps = { variant: CalendarVariant };

export function CalendarFilm({ variant }: CalendarFilmProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#FFFFFF" }}>
      <CalendarScene frame={frame} fps={fps} variant={variant} />
    </AbsoluteFill>
  );
}

export function FolioFilm() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: "#FFFFFF" }}>
      <FolioScene frame={frame} fps={fps} />
    </AbsoluteFill>
  );
}
