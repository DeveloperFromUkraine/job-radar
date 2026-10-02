// collector_sources + collector_request_ledger queries.
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import type { Db } from "../../../../core/db.js";
import { newId } from "../../../../core/id.js";
import type { FlagDraft, StoredFlagKind } from "../../domain/health.js";
import { SOURCES, type SourceId } from "../../domain/sources.js";
import { requestLedger, sourceDisabledPeriods, sourceFlags, sources } from "../schema.js";
import type { DbOrTx } from "./tx.js";

/** One row per registry source; a new source in the registry needs no migration. */
export function ensureSources(db: Db): void {
  for (const s of SOURCES) {
    db.insert(sources).values({ id: s.id, fillStatus: "pending" }).onConflictDoNothing().run();
  }
}

/** Written before the request is sent, so a crash still counts the read (ADR-0003, AC-20). */
export function recordRead(db: Db, sourceId: SourceId, at: number): void {
  db.transaction((tx) => {
    tx.insert(requestLedger).values({ id: newId(), sourceId, sentAt: at }).run();
    tx.update(sources).set({ lastReadAt: at }).where(eq(sources.id, sourceId)).run();
  });
}

export function readTimesSince(db: Db, sourceId: SourceId, since: number): number[] {
  return db
    .select({ sentAt: requestLedger.sentAt })
    .from(requestLedger)
    .where(and(eq(requestLedger.sourceId, sourceId), gt(requestLedger.sentAt, since)))
    .all()
    .map((r) => r.sentAt);
}

export type SourceRow = typeof sources.$inferSelect;

export function readSource(db: DbOrTx, sourceId: SourceId): SourceRow {
  const row = db.select().from(sources).where(eq(sources.id, sourceId)).get();
  if (!row) throw new Error(`source ${sourceId} missing — ensureSources not called`);
  return row;
}

export function readSources(db: Db): SourceRow[] {
  return db.select().from(sources).all();
}

export function updateSource(db: DbOrTx, sourceId: SourceId, values: Partial<Omit<SourceRow, "id">>): void {
  db.update(sources).set(values).where(eq(sources.id, sourceId)).run();
}

/** Opens a disabled period when a source becomes disabled and closes it when it is enabled again (AC-26). */
export function syncDisabledPeriod(db: Db, sourceId: SourceId, disabled: boolean, at: number): void {
  const open = db
    .select()
    .from(sourceDisabledPeriods)
    .where(and(eq(sourceDisabledPeriods.sourceId, sourceId), isNull(sourceDisabledPeriods.disabledUntil)))
    .get();
  if (disabled && !open) {
    db.insert(sourceDisabledPeriods).values({ id: newId(), sourceId, disabledFrom: at }).run();
  } else if (!disabled && open) {
    db.update(sourceDisabledPeriods)
      .set({ disabledUntil: at })
      .where(eq(sourceDisabledPeriods.id, open.id))
      .run();
  }
}

export function readDisabledPeriods(db: Db): (typeof sourceDisabledPeriods.$inferSelect)[] {
  return db.select().from(sourceDisabledPeriods).all();
}

export type FlagRow = typeof sourceFlags.$inferSelect;

export function readFlags(db: DbOrTx, sourceId?: SourceId): FlagRow[] {
  const q = db.select().from(sourceFlags);
  return sourceId ? q.where(eq(sourceFlags.sourceId, sourceId)).all() : q.all();
}

/** A raised flag keeps the time it was first raised; its reason follows the latest numbers. */
export function applyFlags(
  db: DbOrTx,
  sourceId: SourceId,
  raised: readonly FlagDraft[],
  cleared: readonly StoredFlagKind[],
  at: number,
): void {
  for (const flag of raised) {
    db.insert(sourceFlags)
      .values({ sourceId, kind: flag.kind, reason: flag.reason, raisedAt: at })
      .onConflictDoUpdate({ target: [sourceFlags.sourceId, sourceFlags.kind], set: { reason: flag.reason } })
      .run();
  }
  if (cleared.length > 0) {
    db.delete(sourceFlags)
      .where(and(eq(sourceFlags.sourceId, sourceId), inArray(sourceFlags.kind, [...cleared])))
      .run();
  }
}
