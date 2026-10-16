// realness_settings: the single module-state row (id 1). No row = never chosen = on (data-model.md).
import { eq } from "drizzle-orm";
import type { Db } from "../../../core/db.js";
import { realnessDailyShares, realnessMarkRecords, realnessSettings } from "./schema.js";

const ROW = 1;

export function readRealnessOn(db: Db): boolean {
  return db.select().from(realnessSettings).where(eq(realnessSettings.id, ROW)).get()?.realnessOn ?? true;
}

export function writeRealnessOn(db: Db, on: boolean): void {
  db.insert(realnessSettings)
    .values({ id: ROW, realnessOn: on })
    .onConflictDoUpdate({ target: realnessSettings.id, set: { realnessOn: on } })
    .run();
}

export function upsertMarkRecord(db: Db, row: typeof realnessMarkRecords.$inferInsert): void {
  const { postingId: _, ...set } = row;
  db.insert(realnessMarkRecords)
    .values(row)
    .onConflictDoUpdate({ target: realnessMarkRecords.postingId, set })
    .run();
}

export function deleteMarkRecord(db: Db, postingId: string): void {
  db.delete(realnessMarkRecords).where(eq(realnessMarkRecords.postingId, postingId)).run();
}

/** INSERT OR IGNORE: the day's first opening wins. */
export function insertDailyShare(db: Db, row: typeof realnessDailyShares.$inferInsert): void {
  db.insert(realnessDailyShares).values(row).onConflictDoNothing().run();
}
