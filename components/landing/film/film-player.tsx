"use client";

import { forwardRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { CALENDAR_FILM, type CalendarVariant } from "./calendar-scene";
import { FOLIO_FILM } from "./folio-scene";
import { CalendarFilm, FolioFilm } from "./compositions";

export type FilmId = "calendar" | "folio";

/**
 * The Remotion Player for one film. Loaded on demand by ProductFilm when the
 * film scrolls into view, so neither Remotion nor the Player sits in the
 * landing page's first bundle.
 *
 * Every built-in interaction is off: the film is driven by ProductFilm's own
 * accessible pause / play / replay control.
 */
const FilmPlayer = forwardRef<PlayerRef, { film: FilmId; variant: CalendarVariant }>(
  function FilmPlayer({ film, variant }, ref) {
    const shared = {
      ref,
      controls: false,
      loop: false,
      autoPlay: false,
      clickToPlay: false,
      doubleClickToFullscreen: false,
      spaceKeyToPlayOrPause: false,
      moveToBeginningWhenEnded: false,
      initiallyMuted: true,
      acknowledgeRemotionLicense: true,
      style: { width: "100%", height: "100%" },
    } as const;

    if (film === "folio") {
      return (
        <Player
          {...shared}
          component={FolioFilm}
          durationInFrames={FOLIO_FILM.durationInFrames}
          fps={FOLIO_FILM.fps}
          compositionWidth={FOLIO_FILM.width}
          compositionHeight={FOLIO_FILM.height}
        />
      );
    }

    const size = CALENDAR_FILM[variant];
    return (
      <Player
        {...shared}
        component={CalendarFilm}
        inputProps={{ variant }}
        durationInFrames={CALENDAR_FILM.durationInFrames}
        fps={CALENDAR_FILM.fps}
        compositionWidth={size.width}
        compositionHeight={size.height}
      />
    );
  },
);

export default FilmPlayer;
