// Typed client for the search API (docs/features/search-postings/contracts/openapi.yaml), with the
// mark-aware shapes and the marked view from docs/features/applied-skipped/contracts/openapi.yaml.
import { request } from "./collector";

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

export interface SearchResult extends PostingPage {
  snapshot_id: string;
  skills: string[];
  total: number;
  new_count: number;
  /** Matching open postings that are marked — "nothing left to review" (AC-13). */
  marked_count: number;
  collection_empty: boolean;
}

export interface WaitingCount {
  waiting_count: number;
}

// Every search operation changes state, so all are JSON POSTs (access guard, collector ADR-0007).
export const post = <T>(path: string, body: object = {}) =>
  request<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const snapshot = (id: string) => `/api/v1/search/snapshots/${encodeURIComponent(id)}`;

export const openVisit = () => post<Visit>("/api/v1/search/visits");
export const runSearch = (skills: string) => post<SearchResult>("/api/v1/search/snapshots", { skills });
export const getNextPage = (snapshotId: string, cursor: string) =>
  post<PostingPage>(`${snapshot(snapshotId)}/pages`, { cursor });
export const getWaitingCount = (snapshotId: string) => post<WaitingCount>(`${snapshot(snapshotId)}/waiting`);
export const runMarkedView = (skills: string) =>
  post<MarkedResult>("/api/v1/search/marked-snapshots", { skills });
export const getNextMarkedPage = (snapshotId: string, cursor: string) =>
  post<MarkedPage>(`/api/v1/search/marked-snapshots/${encodeURIComponent(snapshotId)}/pages`, { cursor });
