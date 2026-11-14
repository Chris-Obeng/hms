import { Composition, Folder } from "remotion";
import { CalendarFilm, FolioFilm } from "../components/landing/film/compositions";
import { CALENDAR_FILM } from "../components/landing/film/calendar-scene";
import { FOLIO_FILM } from "../components/landing/film/folio-scene";

/**
 * Landing-page product films, for Remotion Studio (`pnpm film:studio`) and
 * renders (`pnpm film:render <id>`). The site plays the same compositions live
 * in the Remotion Player; see components/landing/film/product-film.tsx.
 */
export const RemotionRoot = () => {
  return (
    <Folder name="Landing">
      <Composition
        id="CalendarWide"
        component={CalendarFilm}
        durationInFrames={CALENDAR_FILM.durationInFrames}
        fps={CALENDAR_FILM.fps}
        width={CALENDAR_FILM.wide.width}
        height={CALENDAR_FILM.wide.height}
        defaultProps={{ variant: "wide" as const }}
      />
      <Composition
        id="CalendarCompact"
        component={CalendarFilm}
        durationInFrames={CALENDAR_FILM.durationInFrames}
        fps={CALENDAR_FILM.fps}
        width={CALENDAR_FILM.compact.width}
        height={CALENDAR_FILM.compact.height}
        defaultProps={{ variant: "compact" as const }}
      />
      <Composition
        id="Folio"
        component={FolioFilm}
        durationInFrames={FOLIO_FILM.durationInFrames}
        fps={FOLIO_FILM.fps}
        width={FOLIO_FILM.width}
        height={FOLIO_FILM.height}
      />
    </Folder>
  );
};
