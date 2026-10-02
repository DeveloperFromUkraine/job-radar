// First fill of a never-read source (sad §6 Flow 8, AC-19): after the regular read, older pages
// newest first, only within what the regular schedule leaves of the source's rate, back to 30 days.
// Fill pages never close anything and never raise a failure flag; their listings are first-fill.
import { and, eq, min } from "drizzle-orm";
import { fillReadAllowed, nextFillAttemptAt } from "../domain/schedule.js";
import { type SourceDefinition, sourceById } from "../domain/sources.js";
import { createSourceHttp } from "../infra/http.js";
import { readRunSource, updateRunSource } from "../infra/repo/runs.js";
import { readSource, readTimesSince, updateSource } from "../infra/repo/sources.js";
import { listings } from "../infra/schema.js";
import type { CollectorDeps } from "./deps.js";
import type { FetchVerdict } from "./ingest.js";
import { normalizeAndFilter, storeListings } from "./ingest.js";
import type { StartedRun } from "./scheduler.js";

const DAY = 24 * 60 * 60 * 1000;
const FILL_DAYS = 30;

export async function continueFill(
  deps: CollectorDeps,
  run: Pick<StartedRun, "runId" | "settings">,
  verdict: FetchVerdict,
  source: SourceDefinition = deps.sources?.find((s) => s.id === verdict.sourceId) ??
    sourceById(verdict.sourceId),
): Promise<void> {
  const { db } = deps;
  const id = verdict.sourceId;
  if (readSource(db, id).fillStatus === "complete" || verdict.completeness === "failed") return;

  const adapter = deps.adapters[id];
  const http = createSourceHttp(db, source, { now: deps.now });
  const oldest = () =>
    db
      .select({ at: min(listings.publishedAt) })
      .from(listings)
      .where(and(eq(listings.sourceId, id)))
      .get()?.at ?? null;
  const target = deps.now() - FILL_DAYS * DAY;
  let cursor = verdict.nextCursor;

  while (true) {
    const now = deps.now();
    const reached = oldest();
    if (!adapter.fetchOlder || cursor === null || (reached !== null && reached <= target)) {
      updateSource(db, id, {
        fillStatus: "complete",
        fillReachedAt: reached,
        fillCompletedAt: now,
        fillNextPartDueAt: null,
      });
      return;
    }
    const reads = readTimesSince(db, id, now - DAY);
    const continueLater = () =>
      updateSource(db, id, {
        fillStatus: "continuing",
        fillReachedAt: reached,
        fillNextPartDueAt: nextFillAttemptAt(source, readTimesSince(db, id, now - DAY), now),
      });
    if (!fillReadAllowed(source, reads, now)) return continueLater();

    // A refused or throwing page ends this part of the fill; it is never a source failure (Flow 8).
    const page = await adapter.fetchOlder({ http, now }, cursor).catch(() => null);
    if (!page || page.completeness === "failed" || page.completeness === "partial") return continueLater();

    const { kept, noCategory, fetchedItemIds } = await normalizeAndFilter(
      id,
      page.listings,
      run.settings.sources[id].categories,
    );
    db.transaction((tx) => {
      const counts = storeListings(tx, kept, {
        runId: run.runId,
        now: deps.now(),
        isFirstFill: true,
        fetchedItemIds,
      });
      const before = readRunSource(tx, run.runId, id);
      if (before) {
        updateRunSource(tx, run.runId, id, {
          added: before.added + counts.added,
          updated: before.updated + counts.updated,
          newListings: before.newListings + counts.newListings,
          unknownLocationNew: before.unknownLocationNew + counts.unknownLocationNew,
          noCategory: before.noCategory + noCategory,
        });
      }
    });
    cursor = page.nextCursor ?? null;
  }
}
