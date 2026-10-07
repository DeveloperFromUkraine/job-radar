// The only SQL in tracking. Every change is one synchronous statement on the shared connection, so
// there are no partial writes; undo is one statement guarded by the change id (sad §8, ADR-0003).
// Posting details are never joined here — the app layer reads them through collector/app.
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "../../../core/db.js";
import type { MarkRow } from "../domain/mark.js";
import { trackingMarks } from "./schema.js";

/** The posting was removed (by clean-up) since it was shown: the FK refused the write (AC-15). */
export class PostingGone extends Error {}

const CHUNK = 500; // far under SQLite's bound-variable limit

function foreignKeyFailed(err: unknown): boolean {
  const code = (e: unknown) => (e as { code?: string } | undefined)?.code;
  return (
    code(err) === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
    code((err as Error)?.cause) === "SQLITE_CONSTRAINT_FOREIGNKEY"
  );
}

export function getMark(db: Db, postingId: string): MarkRow | null {
  return db.select().from(trackingMarks).where(eq(trackingMarks.postingId, postingId)).get() ?? null;
}

/** Inserts or replaces the posting's row. */
export function writeMark(db: Db, row: MarkRow): void {
  const { postingId, ...rest } = row;
  try {
    db.insert(trackingMarks)
      .values(row)
      .onConflictDoUpdate({ target: trackingMarks.postingId, set: rest })
      .run();
  } catch (err) {
    if (foreignKeyFailed(err)) throw new PostingGone();
    throw err;
  }
}

/** Replaces the row only while `changeId` is still current; false = it changed since (AC-04). */
export function replaceGuarded(db: Db, row: MarkRow, changeId: string): boolean {
  const { postingId, ...rest } = row;
  const { changes } = db
    .update(trackingMarks)
    .set(rest)
    .where(and(eq(trackingMarks.postingId, postingId), eq(trackingMarks.changeId, changeId)))
    .run();
  return changes === 1;
}

/** Deletes the row (undo of a first mark) only while `changeId` is still current. */
export function deleteGuarded(db: Db, postingId: string, changeId: string): boolean {
  const { changes } = db
    .delete(trackingMarks)
    .where(and(eq(trackingMarks.postingId, postingId), eq(trackingMarks.changeId, changeId)))
    .run();
  return changes === 1;
}

/** Ids of postings marked applied or skipped right now (cleared rows are unmarked). */
export function markedIds(db: Db): Set<string> {
  return new Set(
    db
      .select({ id: trackingMarks.postingId })
      .from(trackingMarks)
      .where(isNotNull(trackingMarks.mark))
      .all()
      .map((r) => r.id),
  );
}

/** Every row, most recently changed first, ties by posting id (the marked view's order, AC-05). */
export function markRowsNewestFirst(db: Db): MarkRow[] {
  return db
    .select()
    .from(trackingMarks)
    .orderBy(desc(trackingMarks.markedAt), asc(trackingMarks.postingId))
    .all();
}

export function rowsFor(db: Db, postingIds: readonly string[]): MarkRow[] {
  const rows: MarkRow[] = [];
  for (let i = 0; i < postingIds.length; i += CHUNK)
    rows.push(
      ...db
        .select()
        .from(trackingMarks)
        .where(inArray(trackingMarks.postingId, postingIds.slice(i, i + CHUNK)))
        .all(),
    );
  return rows;
}
