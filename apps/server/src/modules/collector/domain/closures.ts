// Closures in finalize (sad §6 Run phases, ADR-0004): listings close only on a complete fetch's
// absence or a direct signal; a posting closes when every enabled source's listing is closed and at
// least one enabled source confirmed (AC-07, AC-09, AC-26); a source closing more than 30% of its
// ≥ 10 open postings in one run is held back (AC-14). A failed or partial fetch never closes (AC-08).
import type { Completeness } from "./adapter.js";
import type { SourceId } from "./sources.js";

const HOLD_BACK_MIN_OPEN = 10;
const HOLD_BACK_SHARE = 0.3;

export interface ClosureListing {
  listingId: string;
  sourceId: SourceId;
  status: "open" | "closed";
  publishedAt: number | null;
  expiresAt: number | null;
  lastSeenRunId: string;
}

export interface ClosureInput {
  runId: string;
  now: number;
  enabledSources: ReadonlySet<string>;
  /** The run's fetch verdicts, in the order the sources were read. */
  fetches: { sourceId: SourceId; completeness: Completeness; coversPublishedAfter: number | null }[];
  /** Open postings with all of their listings. */
  postings: { postingId: string; listings: ClosureListing[] }[];
}

export interface ClosureDecision {
  listingsToClose: string[];
  postingsToClose: { postingId: string; creditedTo: SourceId }[];
  closedBySource: Partial<Record<SourceId, number>>;
  heldBySource: Partial<Record<SourceId, number>>;
}

function listingConfirmedClosed(
  listing: ClosureListing,
  fetch: ClosureInput["fetches"][number],
  runId: string,
  now: number,
): boolean {
  if (listing.status !== "open") return false;
  if (fetch.completeness === "failed" || fetch.completeness === "partial") return false;
  if (listing.expiresAt !== null && listing.expiresAt <= now) return true;
  if (fetch.completeness !== "complete" || listing.lastSeenRunId === runId) return false;
  if (fetch.coversPublishedAfter === null) return true;
  return listing.publishedAt !== null && listing.publishedAt > fetch.coversPublishedAfter;
}

export function decideClosures(input: ClosureInput): ClosureDecision {
  const order = input.fetches.map((f) => f.sourceId);
  const candidates = new Map<string, SourceId>(); // listingId → confirming source
  for (const fetch of input.fetches) {
    for (const posting of input.postings) {
      for (const listing of posting.listings) {
        if (
          listing.sourceId === fetch.sourceId &&
          listingConfirmedClosed(listing, fetch, input.runId, input.now)
        ) {
          candidates.set(listing.listingId, fetch.sourceId);
        }
      }
    }
  }

  const postingClosures = (closing: Map<string, SourceId>) => {
    const out: { postingId: string; creditedTo: SourceId }[] = [];
    for (const posting of input.postings) {
      const enabled = posting.listings.filter((l) => input.enabledSources.has(l.sourceId));
      if (enabled.length === 0) continue;
      if (!enabled.every((l) => l.status === "closed" || closing.has(l.listingId))) continue;
      const confirmedNow = enabled
        .map((l) => closing.get(l.listingId))
        .filter((s): s is SourceId => s !== undefined);
      if (confirmedNow.length === 0) continue; // already closed before this run — nothing new
      const creditedTo = confirmedNow.sort((a, b) => order.indexOf(a) - order.indexOf(b)).at(-1) as SourceId;
      out.push({ postingId: posting.postingId, creditedTo });
    }
    return out;
  };

  // Hold back a source whose closures would exceed 30% of its open postings (≥ 10).
  const firstPass = postingClosures(candidates);
  const heldBySource: Partial<Record<SourceId, number>> = {};
  for (const sourceId of order) {
    const open = input.postings.filter((p) =>
      p.listings.some((l) => l.sourceId === sourceId && l.status === "open"),
    ).length;
    const wouldClose = firstPass.filter((c) => c.creditedTo === sourceId).length;
    if (open >= HOLD_BACK_MIN_OPEN && wouldClose > open * HOLD_BACK_SHARE)
      heldBySource[sourceId] = wouldClose;
  }
  for (const [listingId, sourceId] of [...candidates]) {
    if (heldBySource[sourceId] !== undefined) candidates.delete(listingId);
  }

  const postingsToClose = postingClosures(candidates);
  const closedBySource: Partial<Record<SourceId, number>> = {};
  for (const c of postingsToClose) closedBySource[c.creditedTo] = (closedBySource[c.creditedTo] ?? 0) + 1;

  return { listingsToClose: [...candidates.keys()], postingsToClose, closedBySource, heldBySource };
}
