// Realness state (docs/features/realness-score/data-model.md). Times are UTC epoch milliseconds.
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { postings } from "../../collector/infra/schema.js";

export const realnessSettings = sqliteTable("realness_settings", {
  id: integer("id").primaryKey(), // always 1
  realnessOn: integer("realness_on", { mode: "boolean" }).notNull(), // no row = never chosen = on (AC-10)
});

// The posting's realness at its latest mark, switch-on rules (AC-14).
export const realnessMarkRecords = sqliteTable("realness_mark_records", {
  postingId: text("posting_id")
    .primaryKey()
    .references(() => postings.id, { onDelete: "cascade" }),
  mark: text("mark", { enum: ["applied", "skipped"] }).notNull(),
  penalty: integer("penalty").notNull(), // 0..30
  signals: text("signals").notNull(), // JSON array as the API shows it; [] = none
  recordedAt: integer("recorded_at").notNull(),
});

// One row per calendar day of the machine's time zone; the day's first opening wins (AC-14).
export const realnessDailyShares = sqliteTable("realness_daily_shares", {
  day: text("day").primaryKey(), // YYYY-MM-DD
  postings: integer("postings").notNull(),
  lowered: integer("lowered").notNull(),
  recordedAt: integer("recorded_at").notNull(),
});
