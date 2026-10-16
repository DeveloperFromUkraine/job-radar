// realness_settings: the single module-state row (id 1). No row = never chosen = on (data-model.md).
import { eq } from "drizzle-orm";
import type { Db } from "../../../core/db.js";
import { realnessSettings } from "./schema.js";

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
