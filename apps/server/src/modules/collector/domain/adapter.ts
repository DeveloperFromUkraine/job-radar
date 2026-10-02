// The one adapter contract every source implements (ADR-0004).
import type { SourceId } from "./sources.js";

export type Completeness = "complete" | "capped" | "partial" | "failed";

/** A listing as the adapter read it — fields may still hold markup; times are UTC epoch ms. */
export interface RawListing {
  sourceItemId: string;
  url: string;
  title: string;
  company: string;
  description: string;
  /** What the source states about where candidates may work from, as stated; absent = nothing stated. */
  locationRestriction: string | readonly string[] | null | undefined;
  categories: readonly string[];
  publishedAt: number | null;
  /** A direct close signal where the source has one (Himalayas `expiryDate`). */
  expiresAt: number | null;
}

/** A listing after the per-listing rules: plain text only, location as stated or null (= unknown). */
export interface NormalizedListing {
  sourceId: SourceId;
  sourceItemId: string;
  url: string;
  title: string;
  company: string;
  description: string;
  locationRestriction: string | null;
  categories: string[];
  publishedAt: number | null;
  expiresAt: number | null;
}

export type FailureCode = "unreachable" | "refused" | "too_large" | "timed_out" | "unreadable";

/**
 * What one fetch of one source returns. Close signals are the completeness verdict (a listing
 * absent from a `complete` fetch) and each listing's `expiresAt`; `coversPublishedAfter` bounds the
 * listings a complete fetch speaks for (Jobicy's 7-day window), null when it covers everything.
 */
export interface FetchResult {
  completeness: Completeness;
  listings: RawListing[];
  /** Items the source returned, before any filtering — zero twice in a row means silent (AC-13). */
  itemsReturned: number;
  coversPublishedAfter: number | null;
  /** Where an older page starts, for sources that page back in time (first fill, AC-19). */
  nextCursor?: string | null;
  failure?: { code: FailureCode; detail: string };
}
