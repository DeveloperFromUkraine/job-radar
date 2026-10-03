// Finalize (sad §6 Flow 7): after every due source is done — apply the closures each verdict
// allows, hold back above 30%, set health flags and per-source counts, mark the run finished.
// An interrupted run never gets here, so nothing is closed on its basis (AC-20).
import { decideClosures } from "../domain/closures.js";
import { evaluateFlags, type StoredFlagKind } from "../domain/health.js";
import { cleanupDay } from "../domain/retention.js";
import { sourceState } from "../domain/settings.js";
import { SOURCES, sourceById } from "../domain/sources.js";
import {
  categoriesSeenSince,
  closeListings,
  closePostings,
  openPostingsTouching,
} from "../infra/repo/postings.js";
import { finishRun, recentOutcomes, updateRunSource } from "../infra/repo/runs.js";
import { applyFlags, readFlags, readSource } from "../infra/repo/sources.js";
import { readState } from "../infra/repo/state.js";
import type { CollectorDeps } from "./deps.js";
import type { FetchVerdict } from "./ingest.js";
import type { StartedRun } from "./scheduler.js";

const DAY = 24 * 60 * 60 * 1000;

// A complete read re-checks every closure; a capped one only where the source closes by expiry (R2).
function rechecksClosures(sourceId: FetchVerdict["sourceId"], verdicts: readonly FetchVerdict[]): boolean {
  const completeness = verdicts.find((v) => v.sourceId === sourceId)?.completeness;
  return (
    completeness === "complete" || (completeness === "capped" && sourceById(sourceId).closesByExpiry === true)
  );
}

export function finalizeRun(
  deps: CollectorDeps,
  run: Pick<StartedRun, "runId" | "settings">,
  verdicts: readonly FetchVerdict[],
): { cleanupDay: string | null } {
  const { db } = deps;
  const now = deps.now();
  const enabled = new Set(SOURCES.filter((s) => sourceState(run.settings, s) === "enabled").map((s) => s.id));
  const runSources = verdicts.map((v) => v.sourceId);
  const postings = openPostingsTouching(db, runSources);
  const decision = decideClosures({
    runId: run.runId,
    now,
    enabledSources: enabled,
    fetches: [...verdicts],
    postings,
  });

  db.transaction((tx) => {
    closeListings(tx, decision.listingsToClose, now);
    closePostings(
      tx,
      decision.postingsToClose.map((c) => c.postingId),
      now,
    );

    for (const sourceId of runSources) {
      const held = decision.heldBySource[sourceId] ?? 0;
      updateRunSource(tx, run.runId, sourceId, { closed: decision.closedBySource[sourceId] ?? 0, held });

      const open = postings.filter((p) =>
        p.listings.some((l) => l.sourceId === sourceId && l.status === "open"),
      ).length;
      const flags = evaluateFlags({
        now,
        firstSuccessAt: readSource(tx, sourceId).firstSuccessAt,
        recentOutcomes: recentOutcomes(tx, sourceId, now - 8 * DAY),
        currentFlags: readFlags(tx, sourceId).map((f) => f.kind as StoredFlagKind),
        held: held > 0 ? { held, open } : null,
        ownerCategories: run.settings.sources[sourceId].categories,
        // The published list where the source has one (static, AC-24); otherwise the 7-day rule.
        publishedCategories: sourceById(sourceId).publishedCategories ?? null,
        categoriesMatchedLast7Days: categoriesSeenSince(tx, sourceId, now - 7 * DAY),
        closuresRechecked: rechecksClosures(sourceId, verdicts),
      });
      applyFlags(tx, sourceId, flags.raised, flags.cleared, now);
    }
    finishRun(tx, run.runId, now);
  });

  return { cleanupDay: cleanupDay(readState(db).lastCleanupOn, now, deps.timeZone) };
}
