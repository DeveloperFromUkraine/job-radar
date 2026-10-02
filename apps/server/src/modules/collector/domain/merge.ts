// Match key and merge decision (AC-04, AC-05, AC-06, AC-11; ADR-0005). A merge is permanent and
// never re-decided, so the rules are exact: same normalized company + title, publication times at
// most 7 days apart, and no conflicting stated location restrictions.
import type { NormalizedListing } from "./adapter.js";
import type { SourceId } from "./sources.js";

const MERGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Generic "remote" wording, exactly as spec AC-04 lists it; longer phrases first. Region names stay.
const REMOTE_WORDING = [
  "100% remote",
  "fully remote",
  "remote-first",
  "work from home",
  "remote",
  "wfh",
  "anywhere",
];
const REMOTE_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(${REMOTE_WORDING.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}])`,
  "giu",
);

// Legal suffixes (Inc, Ltd, LLC, GmbH, Sp. z o.o. and similar), compared after punctuation is gone.
const LEGAL_SUFFIXES = [
  "sp z o o",
  "s a",
  "inc",
  "ltd",
  "llc",
  "gmbh",
  "corp",
  "corporation",
  "co",
  "company",
  "limited",
  "plc",
  "ag",
  "bv",
  "oy",
  "ab",
  "sa",
  "srl",
  "sas",
  "pty",
  "llp",
  "ug",
];

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

function normalizeTitle(title: string): string {
  return words(title.replace(REMOTE_RE, " "));
}

function normalizeCompany(company: string): string {
  let name = words(company);
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of LEGAL_SUFFIXES) {
      if (name.endsWith(` ${suffix}`)) {
        name = name.slice(0, -suffix.length - 1).trim();
        changed = true;
      }
    }
  }
  return name;
}

export function matchKey(company: string, title: string): string {
  return `${normalizeCompany(company)}|${normalizeTitle(title)}`;
}

export interface Candidate {
  postingId: string;
  status: "open" | "closed";
  /** Latest publication time among the posting's listings, as the sources state them. */
  latestPublishedAt: number | null;
  listings: {
    listingId: string;
    sourceId: SourceId;
    sourceItemId: string;
    locationRestriction: string | null;
  }[];
}

export interface KnownListing {
  listingId: string;
  postingId: string;
  postingStatus: "open" | "closed";
}

export type MergeDecision =
  | { kind: "update-known"; listingId: string; postingId: string; reopen: boolean }
  | { kind: "replace-same-source"; postingId: string; replacesListingId: string; reopen: boolean }
  | { kind: "attach"; postingId: string; reopen: boolean }
  | { kind: "create" };

const withinWindow = (a: number | null, b: number | null) =>
  a !== null && b !== null && Math.abs(a - b) <= MERGE_WINDOW_MS;

// Most recent latest publication first, then the oldest posting id (UUIDv7 sorts by creation).
const byPreference = (a: Candidate, b: Candidate) =>
  (b.latestPublishedAt ?? 0) - (a.latestPublishedAt ?? 0) || a.postingId.localeCompare(b.postingId);

/**
 * `candidates` are the not-removed postings with the listing's match key. Same-source re-posts are
 * checked before the cross-source merge, so a board re-posting a role never adds a second listing;
 * an item the source still returns is never a re-post.
 */
export function decideMerge(
  listing: NormalizedListing,
  known: KnownListing | null,
  candidates: readonly Candidate[],
  /** Item ids the source returned in this fetch: a live item is never treated as re-posted. */
  fetchedItemIds: ReadonlySet<string> = new Set(),
): MergeDecision {
  if (known) {
    return {
      kind: "update-known",
      listingId: known.listingId,
      postingId: known.postingId,
      reopen: known.postingStatus === "closed",
    };
  }

  const inWindow = candidates
    .filter((c) => withinWindow(listing.publishedAt, c.latestPublishedAt))
    .sort(byPreference);

  for (const c of inWindow) {
    // A re-post replaces the source's old item only once that item is gone from the source (AC-04);
    // two live items are two roles, decided by the location rule below (AC-05).
    const own = c.listings.find(
      (l) => l.sourceId === listing.sourceId && !fetchedItemIds.has(l.sourceItemId),
    );
    if (own) {
      return {
        kind: "replace-same-source",
        postingId: c.postingId,
        replacesListingId: own.listingId,
        reopen: c.status === "closed",
      };
    }
  }

  const conflicts = (c: Candidate) =>
    listing.locationRestriction !== null &&
    c.listings.some(
      (l) => l.locationRestriction !== null && l.locationRestriction !== listing.locationRestriction,
    );
  const target = inWindow.find((c) => !conflicts(c));
  return target
    ? { kind: "attach", postingId: target.postingId, reopen: target.status === "closed" }
    : { kind: "create" };
}

/** A merged posting shows the earliest publication time among its listings (AC-04 note). */
export function earliestPublishedAt(current: number | null, incoming: number | null): number | null {
  if (current === null) return incoming;
  if (incoming === null) return current;
  return Math.min(current, incoming);
}
