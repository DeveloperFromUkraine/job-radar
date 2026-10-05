// Typed client for the search API (docs/features/search-postings/contracts/openapi.yaml).
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

export interface Posting {
  id: string;
  title: string;
  company: string;
  published_at: string | null;
  first_seen_at: string;
  is_new: boolean;
  matched_skills: MatchedSkill[];
  listings: Listing[];
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
  collection_empty: boolean;
}

export interface WaitingCount {
  waiting_count: number;
}

// Every search operation changes state, so all are JSON POSTs (access guard, collector ADR-0007).
const post = <T>(path: string, body: object = {}) =>
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
