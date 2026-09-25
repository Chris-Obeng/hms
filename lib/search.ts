/**
 * lib/search.ts
 *
 * Shared contract for global dashboard search — types + input sanitiser.
 * NOT "use server": imported by the client panel (types) and the route
 * handler (types + escapeFilterTerm). No DB or auth code lives here.
 */

/**
 * Strips characters that would change the meaning of a PostgREST filter.
 * `% _ * \` are LIKE metacharacters; `, ( ) " '` are `.or()` separators —
 * removing them stops a caller injecting arbitrary filters via the term.
 */
export function escapeFilterTerm(term: string): string {
  return term.replace(/[\\%*_,()"']/g, "");
}

export type SearchHitType = "guest" | "booking" | "room";

export interface SearchHit {
  id: string;
  type: SearchHitType;
  label: string;
  subLabel: string;
  url: string;
}

export interface SearchGroup {
  type: SearchHitType;
  items: SearchHit[];
  /** True when more than the returned slice matched — drives the "See all" row. */
  hasMore: boolean;
  seeAllUrl: string;
}

export interface SearchResponse {
  query: string;
  groups: SearchGroup[];
}
