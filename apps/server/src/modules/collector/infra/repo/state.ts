// collector_state: the single module-state row (id 1).
import { eq } from "drizzle-orm";
import type { Db } from "../../../../core/db.js";
import { collectorState } from "../schema.js";

const ROW = 1;

export type StateRow = typeof collectorState.$inferSelect;

export function readState(db: Db): StateRow {
  db.insert(collectorState).values({ id: ROW }).onConflictDoNothing().run();
  const row = db.select().from(collectorState).where(eq(collectorState.id, ROW)).get();
  if (!row) throw new Error("collector_state row missing");
  return row;
}

export function updateState(db: Db, values: Partial<Omit<StateRow, "id">>): void {
  readState(db);
  db.update(collectorState).set(values).where(eq(collectorState.id, ROW)).run();
}
