// Read-only queries behind source health and the problem marker (sad §6 Flow 10).
import { and, desc, eq, gt, gte, inArray, ne } from "drizzle-orm";
import type { Db } from "../../../../core/db.js";
import type { SourceId } from "../../domain/sources.js";
import { listings, requestLedger, runSources, runs } from "../schema.js";
import type { RunRow, RunSourceRow } from "./runs.js";

export function anyRunFinished(db: Db): boolean {
  return (
    db.select({ id: runs.id }).from(runs).where(eq(runs.status, "finished")).limit(1).get() !== undefined
  );
}

export function latestEndedRun(db: Db): RunRow | null {
  return (
    db
      .select()
      .from(runs)
      .where(inArray(runs.status, ["finished", "incomplete"]))
      .orderBy(desc(runs.id))
      .limit(1)
      .get() ?? null
  );
}

export function runOutcomes(db: Db, runId: string): RunSourceRow[] {
  return db.select().from(runSources).where(eq(runSources.runId, runId)).all();
}

/** The source's outcome in the latest run that actually read it. */
export function lastOutcome(db: Db, sourceId: SourceId): RunSourceRow | null {
  return (
    db
      .select()
      .from(runSources)
      .where(and(eq(runSources.sourceId, sourceId), ne(runSources.outcome, "pending")))
      .orderBy(desc(runSources.runId))
      .limit(1)
      .get() ?? null
  );
}

export function readsSince(db: Db, sourceId: SourceId, since: number): number {
  return db
    .select({ id: requestLedger.id })
    .from(requestLedger)
    .where(and(eq(requestLedger.sourceId, sourceId), gt(requestLedger.sentAt, since)))
    .all().length;
}

/** Regular (not first-fill) listings collected since `since`, for the freshness metric (spec §6). */
export function freshnessRows(db: Db, sourceId: SourceId, since: number) {
  return db
    .select({ publishedAt: listings.publishedAt, firstCollectedAt: listings.firstCollectedAt })
    .from(listings)
    .where(
      and(
        eq(listings.sourceId, sourceId),
        eq(listings.isFirstFill, false),
        gte(listings.firstCollectedAt, since),
      ),
    )
    .all();
}
