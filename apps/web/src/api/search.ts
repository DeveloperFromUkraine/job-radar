// Typed client for the search API (docs/features/search-postings/contracts/openapi.yaml), with the
// marked view from docs/features/applied-skipped/contracts/openapi.yaml, the mark- and location-aware
// main list from docs/features/remote-filter/contracts/openapi.yaml, and the match scores and list
// order from docs/features/match-score/contracts/openapi.yaml.
import { post } from "./collector";
import type { Match } from "./matching";
import type { LocationCheck, LocationFilter } from "./remoteFilter";

export interface Visit {
  last_skills: string[];
  previous_visit_started_at: string | null;
}

export interface MatchedSkill {
  skill: string;
  in_title: boolean;
}

export interface Listing {
  /** Not an enum: new sources arrive in parallel (roadmap step 11). */
  source_id: string;
  status: "open" | "closed";
  url: string | null;
  location_restriction: string | null;
}

export type Mark = "applied" | "skipped";

/** The marked posting an unmarked one looks like (applied-skipped AC-10). */
export interface LookAlike {
  mark: Mark;
  marked_at: string;
  company: string;
}

export interface MarkState {
  posting_id: string;
  mark: Mark | null;
  marked_at: string | null;
  change_id: string | null;
  /** Past the 60-day rule: losing applied means removal at clean-up (AC-07). */
  at_risk: boolean;
  /** A cleared closed posting's last day before clean-up removes it (YYYY-MM-DD). */
  removed_after: string | null;
}

export interface Posting {
  id: string;
  title: string;
  company: string;
  published_at: string | null;
  first_seen_at: string;
  is_new: boolean;
  matched_skills: MatchedSkill[];
  listings: Listing[];
  look_alike: LookAlike | null;
  /** The "check location" reason, or null when it fits or the list has no filter (remote-filter AC-02). */
  location_check: LocationCheck | null;
  /** The posting's match, or null for every posting when there is no profile (match-score AC-15). */
  match: Match | null;
}

/** A marked-view posting, open or closed (applied-skipped AC-05). */
export interface MarkedPosting {
  id: string;
  title: string;
  company: string;
  status: "open" | "closed";
  published_at: string | null;
  first_seen_at: string;
  matched_skills: MatchedSkill[];
  listings: Listing[];
  mark_state: MarkState;
  /** The last score, never re-scored; null if never scored (match-score AC-13 note). */
  match: Match | null;
}

export interface MarkedPage {
  items: MarkedPosting[];
  has_next: boolean;
  next_cursor: string | null;
}

export interface MarkedResult extends MarkedPage {
  snapshot_id: string;
  skills: string[];
  marked_count: number;
  cleared_count: number;
}

export interface PostingPage {
  items: Posting[];
  has_next: boolean;
  next_cursor: string | null;
}

export type ListOrder = "newest" | "best_match";

export interface SearchResult extends PostingPage {
  snapshot_id: string;
  /** The order this snapshot is in (match-score AC-11). */
  order: ListOrder;
  /** false → no scores and the "set up a profile" line (match-score AC-15). */
  has_profile: boolean;
  skills: string[];
  total: number;
  new_count: number;
  /** Matching open postings that are marked — "nothing left to review" (AC-13). */
  marked_count: number;
  /** Unmarked matches not open to the filter's country (remote-filter AC-07, AC-08); 0 with none or off. */
  hidden_count: number;
  collection_empty: boolean;
  location_filter: LocationFilter;
}

export interface WaitingCount {
  waiting_count: number;
}

// Every search operation changes state, so all are JSON POSTs (access guard, collector ADR-0007).
const snapshot = (id: string) => `/api/v1/search/snapshots/${encodeURIComponent(id)}`;

export const openVisit = () => post<Visit>("/api/v1/search/visits");
/** Leave `order` out to use the kept one; set it to switch and keep it (match-score AC-11). */
export const runSearch = (skills: string, order?: ListOrder) =>
  post<SearchResult>("/api/v1/search/snapshots", order ? { skills, order } : { skills });
export const getNextPage = (snapshotId: string, cursor: string) =>
  post<PostingPage>(`${snapshot(snapshotId)}/pages`, { cursor });
export const getWaitingCount = (snapshotId: string) => post<WaitingCount>(`${snapshot(snapshotId)}/waiting`);
export const runMarkedView = (skills: string) =>
  post<MarkedResult>("/api/v1/search/marked-snapshots", { skills });
export const getNextMarkedPage = (snapshotId: string, cursor: string) =>
  post<MarkedPage>(`/api/v1/search/marked-snapshots/${encodeURIComponent(snapshotId)}/pages`, { cursor });
