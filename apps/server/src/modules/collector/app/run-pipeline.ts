// One collection run end to end (sad §6 Run phases): ingest every due source in turn (+ its first
// fill), then finalize, then the daily clean-up when the day's first finished run asks for it.
// An unexpected error inside one source's ingest fails that source only (sad §8 Error handling).
import { updateRunSource } from "../infra/repo/runs.js";
import { dailyCleanup } from "./cleanup.js";
import type { CollectorDeps } from "./deps.js";
import { finalizeRun } from "./finalize.js";
import { continueFill } from "./first-fill.js";
import { type FetchVerdict, ingestSource } from "./ingest.js";
import type { MarkedPostings } from "./marked-postings.js";
import type { StartedRun } from "./scheduler.js";

export async function executeRun(
  deps: CollectorDeps,
  run: StartedRun,
  marks: MarkedPostings,
  log?: { error(obj: object, msg: string): void },
): Promise<void> {
  const verdicts: FetchVerdict[] = [];
  for (const sourceId of run.due) {
    try {
      const verdict = await ingestSource(deps, run, sourceId);
      verdicts.push(verdict);
      await continueFill(deps, run, verdict);
    } catch (err) {
      log?.error({ err, runId: run.runId, source: sourceId }, "source ingest failed");
      updateRunSource(deps.db, run.runId, sourceId, {
        outcome: "failed",
        failureReason: "The source's response could not be processed.",
      });
      verdicts.push({ sourceId, completeness: "failed", coversPublishedAfter: null, nextCursor: null });
    }
  }
  const { cleanupDay } = finalizeRun(deps, run, verdicts);
  if (cleanupDay) await dailyCleanup(deps, cleanupDay, marks);
}
