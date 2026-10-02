// collector_runs + collector_run_sources queries.
import { eq } from "drizzle-orm";
import type { Db } from "../../../../core/db.js";
import type { SourceId } from "../../domain/sources.js";
import { runSources, runs } from "../schema.js";

export type RunTrigger = "schedule" | "catch_up" | "collect_now";
export type RunRow = typeof runs.$inferSelect;
export type RunSourceRow = typeof runSources.$inferSelect;

export function runningRun(db: Db): RunRow | null {
  return db.select().from(runs).where(eq(runs.status, "running")).get() ?? null;
}

/** An interrupted run is recorded as incomplete; nothing is closed on its basis (AC-20). */
export function markRunningIncomplete(db: Db): void {
  db.update(runs).set({ status: "incomplete" }).where(eq(runs.status, "running")).run();
}

/** Opens the run with one pending outcome per due source; false when another run is in progress. */
export function insertRun(
  db: Db,
  run: { id: string; trigger: RunTrigger; startedAt: number; due: readonly SourceId[] },
): boolean {
  try {
    db.transaction((tx) => {
      tx.insert(runs)
        .values({ id: run.id, trigger: run.trigger, status: "running", startedAt: run.startedAt })
        .run();
      for (const sourceId of run.due) {
        tx.insert(runSources)
          .values({
            runId: run.id,
            sourceId,
            outcome: "pending",
            newListings: 0,
            unknownLocationNew: 0,
            added: 0,
            updated: 0,
            closed: 0,
            held: 0,
            noCategory: 0,
          })
          .run();
      }
    });
    return true;
  } catch (err) {
    // collector_runs_one_running_uq: at most one run in progress.
    if ((err as { cause?: { code?: string } }).cause?.code === "SQLITE_CONSTRAINT_UNIQUE") return false;
    throw err;
  }
}

export function readRun(db: Db, runId: string): RunRow | null {
  return db.select().from(runs).where(eq(runs.id, runId)).get() ?? null;
}
