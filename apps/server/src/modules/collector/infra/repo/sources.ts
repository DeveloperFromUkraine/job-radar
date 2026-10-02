// collector_sources + collector_request_ledger queries.
import { and, eq, gt } from "drizzle-orm";
import type { Db } from "../../../../core/db.js";
import { newId } from "../../../../core/id.js";
import { SOURCES, type SourceId } from "../../domain/sources.js";
import { requestLedger, sources } from "../schema.js";

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

export function readSource(db: Db, sourceId: SourceId): SourceRow {
  const row = db.select().from(sources).where(eq(sources.id, sourceId)).get();
  if (!row) throw new Error(`source ${sourceId} missing — ensureSources not called`);
  return row;
}

export function readSources(db: Db): SourceRow[] {
  return db.select().from(sources).all();
}

export function updateSource(db: Db, sourceId: SourceId, values: Partial<Omit<SourceRow, "id">>): void {
  db.update(sources).set(values).where(eq(sources.id, sourceId)).run();
}
