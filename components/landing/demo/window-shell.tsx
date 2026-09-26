import type { ReactNode, Ref } from "react";
import { Pause, Play } from "lucide-react";
import { CAPTION, DURATION_SECONDS } from "./scenes";

/*
 * The window around the demo: browser chrome, the stage the player mounts into,
 * a progress meter and the single caption.
 *
 * Presentational on purpose. The server renders it empty (so the hero ships
 * with its real geometry and copy), and the client renders it again with the
 * player inside — identical markup, so nothing shifts when the video takes over.
 */

export type WindowShellProps = {
  playing: boolean;
  onToggle: () => void;
  /** True until the player chunk has arrived: same layout, no controls. */
  idle?: boolean;
  stageRef?: Ref<HTMLDivElement>;
  meterRef?: Ref<HTMLSpanElement>;
  children?: ReactNode;
};

export function WindowShell({
  playing,
  onToggle,
  idle = false,
  stageRef,
  meterRef,
  children,
}: WindowShellProps) {
  return (
    <div className="lp-window">
      <div className="lp-window__bar">
        <span className="lp-window__path">
          app.roomline.com — front desk / payments
        </span>
        <span className="lp-window__end">
          <span className="lp-chip lp-chip--clear">
            <span className="lp-chip__dot" />
            {`${DURATION_SECONDS}s · loops · no sound`}
          </span>
          {idle ? null : (
            <button
              type="button"
              className="lp-demo__toggle"
              onClick={onToggle}
              aria-label={playing ? "Pause the demo" : "Play the demo"}
            >
              {playing ? (
                <Pause size={11} aria-hidden="true" />
              ) : (
                <Play size={11} aria-hidden="true" />
              )}
              {playing ? "Pause" : "Play"}
            </button>
          )}
        </span>
      </div>

      {/* The composition is drawn DOM, not an SVG: hidden from assistive tech
          because the caption below says everything it shows. */}
      <div className="lp-stage" ref={stageRef} aria-hidden={idle ? undefined : true}>
        {children ?? (
          <div className="lp-stage__idle">
            <p className="lp-index">Live folio</p>
            <p className="lp-body" style={{ maxWidth: "26ch" }}>
              A payment clearing on a guest folio.
            </p>
          </div>
        )}
      </div>

      <div className="lp-demo__meter" aria-hidden="true">
        <span ref={meterRef} style={{ width: "0%" }} />
      </div>

      <p className="lp-demo__caption">
        <span className="lp-index">01</span>
        <span>
          <strong>{CAPTION.label}.</strong> {CAPTION.text}
        </span>
      </p>
    </div>
  );
}
