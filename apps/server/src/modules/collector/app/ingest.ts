// Ingest one due source (sad §6 Flow 5): fetch inside its read budget, then one short transaction —
// store or update listings, merge them into postings (Flow 6), record the outcome and last success.
// Kept even if the run is interrupted later (AC-20). Closures happen only in finalize.
import type { Completeness, RawListing } from "../domain/adapter.js";
import { failureReasonText } from "../domain/health.js";
import { filterByCategories, normalizeListing } from "../domain/listing.js";
import { type SourceId, sourceById } from "../domain/sources.js";
import { createSourceHttp } from "../infra/http.js";
import { applyListing } from "../infra/repo/postings.js";
import { updateRunSource } from "../infra/repo/runs.js";
import { readSource, updateSource } from "../infra/repo/sources.js";
import type { DbOrTx } from "../infra/repo/tx.js";
import type { CollectorDeps } from "./deps.js";
import type { StartedRun } from "./scheduler.js";

export interface FetchVerdict {
  sourceId: SourceId;
  completeness: Completeness;
  coversPublishedAfter: number | null;
  /** Where the first fill continues back in time, when the source pages (AC-19). */
  nextCursor: string | null;
}

export interface StoredCounts {
  added: number;
  updated: number;
  newListings: number;
  unknownLocationNew: number;
  noCategory: number;
}

const CHUNK = 50;
const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Normalize in chunks that yield, so the API keeps answering during a large fetch (sad §8). */
export async function normalizeAndFilter(
  sourceId: SourceId,
  raw: readonly RawListing[],
  ownerCategories: readonly string[],
) {
  const normalized = [];
  for (let i = 0; i < raw.length; i += CHUNK) {
    for (const r of raw.slice(i, i + CHUNK)) normalized.push(normalizeListing(sourceId, r));
    await yieldToEventLoop();
  }
  return filterByCategories(normalized, ownerCategories);
}

/** Stores and merges kept listings; returns the per-posting counts for this source (AC-12, AC-25). */
export function storeListings(
  db: DbOrTx,
  kept: Parameters<typeof applyListing>[1][],
  ctx: Parameters<typeof applyListing>[2],
): Omit<StoredCounts, "noCategory"> {
  const counts = { added: 0, updated: 0, newListings: 0, unknownLocationNew: 0 };
  for (const listing of kept) {
    const { effect, newItem } = applyListing(db, listing, ctx);
    if (effect === "added") counts.added++;
    if (effect === "updated") counts.updated++;
    if (newItem) {
      counts.newListings++;
      if (listing.locationRestriction === null) counts.unknownLocationNew++;
    }
  }
  return counts;
}

export async function ingestSource(
  deps: CollectorDeps,
  run: Pick<StartedRun, "runId" | "settings">,
  sourceId: SourceId,
): Promise<FetchVerdict> {
  const { db } = deps;
  const http = createSourceHttp(db, sourceById(sourceId), { now: deps.now });
  const fetched = await deps.adapters[sourceId].fetchLatest({ http, now: deps.now() });
  const verdict: FetchVerdict = {
    sourceId,
    completeness: fetched.completeness,
    coversPublishedAfter: fetched.coversPublishedAfter,
    nextCursor: fetched.nextCursor ?? null,
  };

  if (fetched.completeness === "failed") {
    updateRunSource(db, run.runId, sourceId, {
      outcome: "failed",
      failureReason: failureReasonText(fetched.failure?.code ?? "unreadable"),
      itemsReturned: null,
    });
    return verdict;
  }

  const { kept, noCategory } = await normalizeAndFilter(
    sourceId,
    fetched.listings,
    run.settings.sources[sourceId].categories,
  );
  const now = deps.now();
  db.transaction((tx) => {
    // The first read of a never-read source starts its fill; later regular reads are regular (spec §6).
    const source = readSource(tx, sourceId);
    const counts = storeListings(tx, kept, {
      runId: run.runId,
      now,
      isFirstFill: source.fillStatus === "pending",
    });
    updateRunSource(tx, run.runId, sourceId, {
      outcome: fetched.completeness,
      failureReason: null,
      itemsReturned: fetched.itemsReturned,
      noCategory,
      fetchFinishedAt: now,
      ...counts,
    });
    // A finished fetch — complete, capped or partial — is the source's last success (AC-20).
    updateSource(tx, sourceId, { lastSuccessAt: now, firstSuccessAt: source.firstSuccessAt ?? now });
  });
  return verdict;
}
