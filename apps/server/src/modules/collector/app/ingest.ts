// Ingest one due source (sad §6 Flow 5): fetch inside its read budget, then one short transaction —
// store or update listings, merge them into postings (Flow 6), record the outcome and last success.
// Kept even if the run is interrupted later (AC-20). Closures happen only in finalize.
import type { Completeness } from "../domain/adapter.js";
import { failureReasonText } from "../domain/health.js";
import { filterByCategories, normalizeListing } from "../domain/listing.js";
import { type SourceId, sourceById } from "../domain/sources.js";
import { createSourceHttp } from "../infra/http.js";
import { applyListing } from "../infra/repo/postings.js";
import { updateRunSource } from "../infra/repo/runs.js";
import { readSource, updateSource } from "../infra/repo/sources.js";
import type { CollectorDeps } from "./deps.js";
import type { StartedRun } from "./scheduler.js";

export interface FetchVerdict {
  sourceId: SourceId;
  completeness: Completeness;
  coversPublishedAfter: number | null;
}

const CHUNK = 50;
const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

export async function ingestSource(
  deps: CollectorDeps,
  run: Pick<StartedRun, "runId" | "settings">,
  sourceId: SourceId,
): Promise<FetchVerdict> {
  const { db } = deps;
  const http = createSourceHttp(db, sourceById(sourceId), { now: deps.now });
  const fetched = await deps.adapters[sourceId].fetchLatest({ http, now: deps.now() });
  const verdict = {
    sourceId,
    completeness: fetched.completeness,
    coversPublishedAfter: fetched.coversPublishedAfter,
  };

  if (fetched.completeness === "failed") {
    updateRunSource(db, run.runId, sourceId, {
      outcome: "failed",
      failureReason: failureReasonText(fetched.failure?.code ?? "unreadable"),
      itemsReturned: null,
    });
    return verdict;
  }

  // Normalize in chunks that yield, so the API keeps answering during a large fetch (sad §8).
  const normalized = [];
  for (let i = 0; i < fetched.listings.length; i += CHUNK) {
    for (const raw of fetched.listings.slice(i, i + CHUNK)) normalized.push(normalizeListing(sourceId, raw));
    await yieldToEventLoop();
  }
  const { kept, noCategory } = filterByCategories(normalized, run.settings.sources[sourceId].categories);

  const now = deps.now();
  db.transaction((tx) => {
    const counts = { added: 0, updated: 0, newListings: 0, unknownLocationNew: 0 };
    for (const listing of kept) {
      const { effect, newItem } = applyListing(tx, listing, { runId: run.runId, now, isFirstFill: false });
      if (effect === "added") counts.added++;
      if (effect === "updated") counts.updated++;
      if (newItem) {
        counts.newListings++;
        if (listing.locationRestriction === null) counts.unknownLocationNew++;
      }
    }
    updateRunSource(tx, run.runId, sourceId, {
      outcome: fetched.completeness,
      failureReason: null,
      itemsReturned: fetched.itemsReturned,
      noCategory,
      fetchFinishedAt: now,
      ...counts,
    });
    // A finished fetch — complete, capped or partial — is the source's last success (AC-20).
    const { firstSuccessAt } = readSource(tx, sourceId);
    updateSource(tx, sourceId, { lastSuccessAt: now, firstSuccessAt: firstSuccessAt ?? now });
  });
  return verdict;
}
