"use client";

import { useEffect, useRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import {
  DURATION_IN_FRAMES,
  HEIGHT,
  ProductDemo,
  WIDTH,
} from "./product-demo";

/*
 * Remotion player wired to viewport visibility: plays only while the hero
 * is on screen, pauses off-screen so the page never janks on scroll.
 * Observer is created once; playback driven imperatively (no autoPlay prop).
 */
export default function DemoScreen() {
  const playerRef = useRef<PlayerRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          playerRef.current?.play();
        } else {
          playerRef.current?.pause();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="lp-stage__fit">
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
    </div>
  );
}
