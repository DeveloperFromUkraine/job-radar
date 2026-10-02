// collector_runs + collector_run_sources queries.
import { and, desc, eq, gte } from "drizzle-orm";
import type { Db } from "../../../../core/db.js";
import type { SourceId } from "../../domain/sources.js";
import { runSources, runs } from "../schema.js";
import type { DbOrTx } from "./tx.js";

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

export function updateRunSource(
  db: DbOrTx,
  runId: string,
  sourceId: SourceId,
  values: Partial<Omit<RunSourceRow, "runId" | "sourceId">>,
): void {
  db.update(runSources)
    .set(values)
    .where(and(eq(runSources.runId, runId), eq(runSources.sourceId, sourceId)))
    .run();
}

/** The source's outcomes in runs started since `since`, newest first. */
export function recentOutcomes(db: DbOrTx, sourceId: SourceId, since: number) {
  return db
    .select({
      outcome: runSources.outcome,
      itemsReturned: runSources.itemsReturned,
      newListings: runSources.newListings,
      unknownLocationNew: runSources.unknownLocationNew,
      failureReason: runSources.failureReason,
      startedAt: runs.startedAt,
    })
    .from(runSources)
    .innerJoin(runs, eq(runSources.runId, runs.id))
    .where(and(eq(runSources.sourceId, sourceId), gte(runs.startedAt, since)))
    .orderBy(desc(runSources.runId))
    .all();
}

export function finishRun(db: DbOrTx, runId: string, at: number): void {
  db.update(runs).set({ status: "finished", finishedAt: at }).where(eq(runs.id, runId)).run();
}
