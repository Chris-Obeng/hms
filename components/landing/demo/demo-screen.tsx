"use client";

import { Player, type PlayerRef } from "@remotion/player";
import {
  DURATION_IN_FRAMES,
  HEIGHT,
  ProductDemo,
  WIDTH,
} from "./product-demo";

export default function DemoScreen({
  playerRef,
}: {
  playerRef: React.RefObject<PlayerRef | null>;
}) {
  return (
    <Player
      ref={playerRef}
      component={ProductDemo}
      durationInFrames={DURATION_IN_FRAMES}
      compositionWidth={WIDTH}
      compositionHeight={HEIGHT}
      fps={30}
      loop
      style={{ width: "100%", height: "100%" }}
    />
  );
}
