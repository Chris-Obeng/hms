"use client";

import dynamic from "next/dynamic";
import { PosterFrame } from "@/components/landing/demo/poster-frame";

const DemoScreen = dynamic(() => import("@/components/landing/demo/demo-screen"), {
  ssr: false,
  loading: () => (
    <div className="lp-stage__fit">
      <PosterFrame />
    </div>
  ),
});

export function DemoPlayer() {
  return (
    <div className="lp-frame">
      <div className="lp-frame__bar" aria-hidden="true">
        <span className="lp-frame__dot" />
        <span className="lp-frame__dot" />
        <span className="lp-frame__dot" />
        <span className="lp-frame__url">app.roomline.com/dashboard</span>
      </div>
      <div className="lp-stage">
        <DemoScreen />
      </div>
    </div>
  );
}
