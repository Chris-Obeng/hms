"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { ProductDemo } from "./product-demo";
import { DURATION_IN_FRAMES, FPS, SIZES, type DemoSize } from "./scenes";
import { WindowShell } from "./window-shell";

/*
 * The demo as a player, not a video file: the product screen is drawn from real
 * markup, so there is nothing to transcode, nothing to buffer, and the type
 * stays crisp at any width the page hands it.
 *
 * Three rules this component obeys:
 *  · It only plays while the window is on screen (IntersectionObserver), so a
 *    scrolled-away demo costs no frames.
 *  · The 30fps frame signal never touches React state per frame — the progress
 *    meter is written straight to the DOM.
 *  · `prefers-reduced-motion` is respected: the demo opens parked on the settled
 *    folio and waits for the Play control, which still works.
 */

/** The settled folio: paid, receipt sent, recorded in the audit. */
const STILL_FRAME = 150;

export default function DemoScreen() {
  const stageRef = useRef<HTMLDivElement>(null);
  const meterRef = useRef<HTMLSpanElement>(null);
  const playerRef = useRef<PlayerRef>(null);

  // null until measured: rendering before this would pick the wrong canvas.
  const [size, setSize] = useState<DemoSize | null>(null);
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);

  const ready = size !== null && reduced !== null;
  const demoSize: DemoSize = size ?? "desktop";
  const canvas = SIZES[demoSize];

  /* The stage is 8/5 on tablet-up and 3/4 below, decided in CSS. The player has
     to be told, so it watches the same breakpoint: a phone gets the phone
     composition rather than a shrunk desk one. */
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setSize(desktop.matches ? "desktop" : "mobile");
      setReduced(calm.matches);
    };
    sync();
    desktop.addEventListener("change", sync);
    calm.addEventListener("change", sync);
    return () => {
      desktop.removeEventListener("change", sync);
      calm.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (event: { detail: { frame: number } }) => {
      const meter = meterRef.current;
      if (meter) {
        meter.style.width = `${((event.detail.frame + 1) / DURATION_IN_FRAMES) * 100}%`;
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    player.addEventListener("frameupdate", onFrame);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    return () => {
      player.removeEventListener("frameupdate", onFrame);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
    };
  }, [ready, demoSize]);

  /* Park on the settled folio for reduced motion, and stay there. */
  useEffect(() => {
    if (reduced) playerRef.current?.seekTo(STILL_FRAME);
  }, [reduced, demoSize]);

  /* Play on entry, pause on exit. A loop that nobody is watching is just heat. */
  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const player = playerRef.current;
        if (!player) return;
        if (!entry.isIntersecting) {
          player.pause();
        } else if (!reduced) {
          player.play();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, [ready, reduced, demoSize]);

  const toggle = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isPlaying()) player.pause();
    else player.play();
  }, []);

  return (
    <WindowShell
      playing={playing}
      onToggle={toggle}
      idle={!ready}
      stageRef={stageRef}
      meterRef={meterRef}
    >
      {ready ? (
        <Player
          ref={playerRef}
          component={ProductDemo}
          inputProps={{ size: demoSize }}
          durationInFrames={DURATION_IN_FRAMES}
          fps={FPS}
          compositionWidth={canvas.width}
          compositionHeight={canvas.height}
          initialFrame={reduced ? STILL_FRAME : 0}
          loop
          controls={false}
          clickToPlay
          doubleClickToFullscreen={false}
          spaceKeyToPlayOrPause={false}
          allowFullscreen={false}
          showVolumeControls={false}
          acknowledgeRemotionLicense
          logLevel="warn"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
      ) : null}
    </WindowShell>
  );
}
