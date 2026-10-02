// One collection run end to end (sad §6 Run phases): ingest every due source in turn (+ its first
// fill), then finalize, then the daily clean-up when the day's first finished run asks for it.
// An unexpected error inside one source's ingest fails that source only (sad §8 Error handling);
// a failing fill page never fakes a source failure (Flow 8); a run the pipeline cannot finish is
// recorded as incomplete, so it never blocks the next one (AC-20).
import { markRunIncomplete, updateRunSource } from "../infra/repo/runs.js";
import { dailyCleanup } from "./cleanup.js";
import type { CollectorDeps } from "./deps.js";
import { finalizeRun } from "./finalize.js";
import { continueFill } from "./first-fill.js";
import { type FetchVerdict, ingestSource } from "./ingest.js";
import type { MarkedPostings } from "./marked-postings.js";
import type { StartedRun } from "./scheduler.js";

type Log = { error(obj: object, msg: string): void };

export async function executeRun(
  deps: CollectorDeps,
  run: StartedRun,
  marks: MarkedPostings,
  log?: Log,
): Promise<void> {
  try {
    const verdicts: FetchVerdict[] = [];
    for (const sourceId of run.due) {
      let verdict: FetchVerdict;
      try {
        verdict = await ingestSource(deps, run, sourceId);
      } catch (err) {
        log?.error({ err, runId: run.runId, source: sourceId }, "source ingest failed");
        updateRunSource(deps.db, run.runId, sourceId, {
          outcome: "failed",
          failureReason: "The source's response could not be processed.",
        });
        verdict = { sourceId, completeness: "failed", coversPublishedAfter: null, nextCursor: null };
      }
      verdicts.push(verdict);
      try {
        await continueFill(deps, run, verdict);
      } catch (err) {
        // The fill stays as it was and continues in a later run; the source's read stands.
        log?.error({ err, runId: run.runId, source: sourceId }, "first fill failed");
      }
    }
    const { cleanupDay } = finalizeRun(deps, run, verdicts);
    if (cleanupDay) await dailyCleanup(deps, cleanupDay, marks);
  } catch (err) {
    markRunIncomplete(deps.db, run.runId);
    throw err;
  }
}
