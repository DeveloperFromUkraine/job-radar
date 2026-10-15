// remote_filter_settings: the single module-state row (id 1), created lazily with filter_on written
// (data-model.md). The only SQL in the module.
import { eq } from "drizzle-orm";
import type { Db } from "../../../core/db.js";
import { remoteFilterSettings } from "./schema.js";

const ROW = 1;

export type SettingsRow = Omit<typeof remoteFilterSettings.$inferSelect, "id">;

export function readSettings(db: Db): SettingsRow {
  db.insert(remoteFilterSettings).values({ id: ROW, filterOn: true }).onConflictDoNothing().run();
  const row = db.select().from(remoteFilterSettings).where(eq(remoteFilterSettings.id, ROW)).get();
  if (!row) throw new Error("remote_filter_settings row missing");
  const { id: _id, ...settings } = row;
  return settings;
}

function write(db: Db, values: Partial<SettingsRow>): void {
  readSettings(db);
  db.update(remoteFilterSettings).set(values).where(eq(remoteFilterSettings.id, ROW)).run();
}

export const writeCountry = (db: Db, country: string, filterOn: boolean) => write(db, { country, filterOn });
export const writeFilterOn = (db: Db, filterOn: boolean) => write(db, { filterOn });
// A look is set or cleared as a pair (AC-06).
export const writeLook = (db: Db, lookCountry: string | null, lookStartedAt: number | null) =>
  write(db, { lookCountry, lookStartedAt });
