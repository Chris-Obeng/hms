"use client";

import dynamic from "next/dynamic";
import { WindowShell } from "./demo/window-shell";

/*
 * The walkthrough is ~200KB of player plus the composition — far too much to
 * block the hero on. The window itself (chrome, caption) renders on
 * the server with its real geometry; the player mounts over it after
 * hydration, so the swap costs no layout and no paint of a missing frame.
 */
const DemoScreen = dynamic(() => import("./demo/demo-screen"), {
  ssr: false,
  loading: () => (
    <WindowShell playing={false} idle onToggle={() => undefined} />
  ),
});

export function DemoPlayer() {
  return <DemoScreen />;
}
