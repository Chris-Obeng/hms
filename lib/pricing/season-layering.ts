/**
 * lib/pricing/season-layering.ts
 *
 * One definition of which season wins a night.
 *
 * Seasons may overlap on purpose: a conference week sits inside "Summer",
 * Christmas sits inside "High Season". `seasonal_rates.priority` states the
 * intent explicitly, and the DB constraint
 * `seasonal_rates_no_same_priority_overlap` forbids the only ambiguous case —
 * two overlapping seasons of one hotel at the *same* priority. Every other
 * ordering below is therefore a stable, total order rather than a tie-break of
 * last resort.
 *
 * Both resolvers import from here (the public funnel in
 * `resolve-public-price.ts` and the admin rate matrix in
 * `app/actions/pricing.ts`) so the price a guest is quoted and the price staff
 * see in the matrix can never disagree. The SQL resolver introduced later must
 * reproduce this exact ordering; the parity harness is what proves it does.
 */

/** The season fields layering depends on. Rows may carry more. */
export interface LayerableSeason {
  start_date: string;
  end_date: string;
  priority: number | null;
}

/** Inclusive night count of a season's range, used as the second sort key. */
function rangeWidth(season: LayerableSeason): number {
  return Date.parse(season.end_date) - Date.parse(season.start_date);
}

/**
 * Sort comparator putting the winning season first.
 *
 *   1. priority DESC     — the explicit statement of intent
 *   2. range width ASC   — narrower is more specific
 *   3. start_date DESC   — the later-declared window
 *
 * Keys 2 and 3 only ever apply to seasons that do *not* overlap (the constraint
 * rules out same-priority overlap), so they never decide a night's price on
 * their own. They exist to make the sort deterministic — array order must not
 * depend on the order Postgres happened to return rows in.
 *
 * `priority` is treated as 0 when null: the column is NOT NULL in the schema,
 * but a generated row type from an older `database.types.ts` can still widen it.
 */
export function compareSeasonPriority(
  a: LayerableSeason,
  b: LayerableSeason
): number {
  const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
  if (priorityDiff !== 0) return priorityDiff;

  const widthDiff = rangeWidth(a) - rangeWidth(b);
  if (widthDiff !== 0) return widthDiff;

  return b.start_date.localeCompare(a.start_date);
}

/**
 * Highest-priority season covering `date` (a YYYY-MM-DD night), or undefined.
 *
 * `seasons` must already be sorted with `compareSeasonPriority` — sorting is the
 * caller's job because a resolver sorts once and then queries per night.
 * Endpoints are inclusive, matching `daterange(start_date, end_date, '[]')` in
 * the exclusion constraint.
 */
export function findWinningSeason<T extends LayerableSeason>(
  sortedSeasons: T[],
  date: string
): T | undefined {
  return sortedSeasons.find((s) => s.start_date <= date && s.end_date >= date);
}
