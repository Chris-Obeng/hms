"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type RefAttributes,
} from "react";
import type { PlayerRef } from "@remotion/player";
import { CALENDAR_FILM, CalendarScene, type CalendarVariant } from "./calendar-scene";
import { FOLIO_FILM, FolioScene } from "./folio-scene";
import type { FilmId } from "./film-player";

type PlayerComponent = ComponentType<
  { film: FilmId; variant: CalendarVariant } & RefAttributes<PlayerRef>
>;

type Playback = "idle" | "playing" | "paused" | "ended";

/** Keep in step with the calendar breakpoint in app/landing.css. */
const WIDE_QUERY = "(min-width: 1024px)";

/**
 * A product film on the landing page.
 *
 * 1. The server renders frame 0 of the scene as plain HTML, sized with
 *    container-query units, so the frame has content and a fixed aspect ratio
 *    before any JavaScript runs (no layout shift, nothing blank).
 * 2. When the frame scrolls into view, the Remotion Player loads on top and
 *    plays once from frame 0, so the hand-off is invisible.
 * 3. It pauses when scrolled away. One small control pauses, resumes or
 *    replays it (WCAG 2.2.2).
 * 4. With prefers-reduced-motion the Player never loads; the poster switches
 *    to the film's final frame, which carries the whole story.
 */
export function ProductFilm({
  film,
  label,
  description,
  className,
}: {
  film: FilmId;
  /** Accessible name of the figure, e.g. "Oriel room calendar". */
  label: string;
  /** What the film shows, for screen readers. */
  description: string;
  className?: string;
}) {
  const figureRef = useRef<HTMLElement>(null);
  const playerRef = useRef<PlayerRef>(null);
  const visibleRef = useRef(false);
  const [Player, setPlayer] = useState<PlayerComponent | null>(null);
  const [variant, setVariant] = useState<CalendarVariant>("wide");
  const [stillFrame, setStillFrame] = useState(0);
  const [ready, setReady] = useState(false);
  const [playback, setPlayback] = useState<Playback>("idle");

  const lastFrame =
    (film === "folio" ? FOLIO_FILM.durationInFrames : CALENDAR_FILM.durationInFrames) - 1;

  // Pick the composition for this screen; reduced motion shows the final frame.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia(WIDE_QUERY);
    const sync = () => {
      setVariant(wide.matches ? "wide" : "compact");
      setStillFrame(reduce.matches ? lastFrame : 0);
    };
    sync();
    wide.addEventListener("change", sync);
    reduce.addEventListener("change", sync);
    return () => {
      wide.removeEventListener("change", sync);
      reduce.removeEventListener("change", sync);
    };
  }, [lastFrame]);

  // Load the Player the first time the film is mostly on screen.
  useEffect(() => {
    const el = figureRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let requested = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
        if (!entry.isIntersecting || requested) return;
        requested = true;
        void import("./film-player").then((mod) => {
          if (!cancelled) setPlayer(() => mod.default as PlayerComponent);
        });
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  // Wire the Player's events once it mounts, then start from frame 0.
  useEffect(() => {
    const player = playerRef.current;
    if (!Player || !player) return;

    const onPlay = () => {
      setReady(true);
      setPlayback("playing");
    };
    const onPause = () => setPlayback((p) => (p === "ended" ? p : "paused"));
    const onEnded = () => setPlayback("ended");

    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onEnded);
    player.seekTo(0);
    if (visibleRef.current) player.play();

    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onEnded);
    };
  }, [Player, variant]);

  // Pause off screen, resume on return (unless the visitor paused it).
  const userPaused = useRef(false);
  useEffect(() => {
    const el = figureRef.current;
    if (!el || !Player) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const player = playerRef.current;
        if (!player) return;
        if (!entry.isIntersecting && player.isPlaying()) player.pause();
        if (entry.isIntersecting && !player.isPlaying() && !userPaused.current) {
          if (player.getCurrentFrame() < lastFrame) player.play();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [Player, lastFrame]);

  const onControl = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (playback === "playing") {
      userPaused.current = true;
      player.pause();
      return;
    }
    userPaused.current = false;
    if (playback === "ended" || player.getCurrentFrame() >= lastFrame) {
      player.seekTo(0);
      setPlayback("playing");
    }
    player.play();
  }, [playback, lastFrame]);

  const controlLabel =
    playback === "playing" ? "Pause" : playback === "ended" ? "Replay" : "Play";

  return (
    <figure
      ref={figureRef}
      className={["rl-film", `rl-film--${film}`, className].filter(Boolean).join(" ")}
      aria-label={label}
    >
      <div className="rl-film-frame">
        {film === "folio" ? (
          <div className="rl-film-stage" aria-hidden="true" style={stageUnit(FOLIO_FILM.width)}>
            <FolioScene frame={stillFrame} />
          </div>
        ) : (
          <>
            <div
              className="rl-film-stage rl-film-stage--wide"
              aria-hidden="true"
              style={stageUnit(CALENDAR_FILM.wide.width)}
            >
              <CalendarScene frame={stillFrame} variant="wide" />
            </div>
            <div
              className="rl-film-stage rl-film-stage--compact"
              aria-hidden="true"
              style={stageUnit(CALENDAR_FILM.compact.width)}
            >
              <CalendarScene frame={stillFrame} variant="compact" />
            </div>
          </>
        )}

        {Player ? (
          <div className="rl-film-player" data-ready={ready ? "true" : undefined} aria-hidden="true">
            <Player key={variant} ref={playerRef} film={film} variant={variant} />
          </div>
        ) : null}

        {Player && ready ? (
          <button type="button" className="rl-film-control" onClick={onControl}>
            <ControlIcon state={playback} />
            <span>{controlLabel}</span>
            <span className="rl-sr"> the {label.toLowerCase()} animation</span>
          </button>
        ) : null}
      </div>
      <figcaption className="rl-sr">{description}</figcaption>
    </figure>
  );
}

/** `--u` turns the scene's composition pixels into a share of the frame width. */
function stageUnit(compositionWidth: number): CSSProperties {
  return { "--u": `calc(100cqw / ${compositionWidth})` } as CSSProperties;
}

function ControlIcon({ state }: { state: Playback }) {
  if (state === "playing") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M5 3.5v9M11 3.5v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (state === "ended") {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.8h2.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M5 3.2v9.6L12.6 8z" fill="currentColor" />
    </svg>
  );
}
