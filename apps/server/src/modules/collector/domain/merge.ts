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
    lastSeenRunId?: string;
    publishedAt?: number | null;
    expiresAt?: number | null;
    status?: "open" | "closed";
  }[];
}

/** What this fetch proves about the source's items (AC-04 re-post rule, review R1). */
export interface Presence {
  /** Only a complete fetch can prove an item is gone; a capped or partial one, or a fill page, cannot. */
  complete: boolean;
  /** A complete fetch speaks only for items published after this time (Jobicy's window); null = all. */
  coversPublishedAfter: number | null;
  fetchedItemIds: ReadonlySet<string>;
  runId: string;
  /** An item whose stated expiry is at or before this time is gone (AC-04); null on a partial read. */
  expiredBy: number | null;
}

const PROVES_ALL: Presence = {
  complete: true,
  coversPublishedAfter: null,
  fetchedItemIds: new Set(),
  runId: "",
  expiredBy: null,
};

function provenGone(l: Candidate["listings"][number], presence: Presence): boolean {
  if (presence.fetchedItemIds.has(l.sourceItemId)) return false; // offered again: never a re-post
  if (l.lastSeenRunId !== undefined && l.lastSeenRunId === presence.runId) return false; // seen in this run
  if (l.status === "closed") return true; // already confirmed gone by an earlier run (review M1)
  if (presence.expiredBy !== null && l.expiresAt != null && l.expiresAt <= presence.expiredBy) return true;
  if (!presence.complete) return false;
  if (presence.coversPublishedAfter === null) return true;
  return l.publishedAt != null && l.publishedAt > presence.coversPublishedAfter;
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
  /** What the fetch proves: an item not proven gone is live, never a re-post. */
  presence: Presence = PROVES_ALL,
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

  const conflicts = (c: Candidate) =>
    listing.locationRestriction !== null &&
    c.listings.some(
      (l) => l.locationRestriction !== null && l.locationRestriction !== listing.locationRestriction,
    );

  for (const c of inWindow) {
    // A re-post replaces the source's old item only once that item is proven gone (AC-04) and the
    // stated locations agree; otherwise the two items are two roles, decided below (AC-05).
    if (conflicts(c)) continue;
    const own = c.listings.find((l) => l.sourceId === listing.sourceId && provenGone(l, presence));
    if (own) {
      return {
        kind: "replace-same-source",
        postingId: c.postingId,
        replacesListingId: own.listingId,
        reopen: c.status === "closed",
      };
    }
  }

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
