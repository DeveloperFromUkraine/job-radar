// Remote-filter state (docs/features/remote-filter/data-model.md, ADR-0003).
// One singleton row (id always 1), upserted lazily; times are UTC epoch milliseconds.
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const remoteFilterSettings = sqliteTable("remote_filter_settings", {
  id: integer("id").primaryKey(), // always 1
  country: text("country"), // ISO 3166-1 alpha-2; null = not chosen yet (AC-04)
  filterOn: integer("filter_on", { mode: "boolean" }).notNull(), // written true with the row (AC-07)
  lookCountry: text("look_country"), // one-off look; null = no look (AC-06)
  lookStartedAt: integer("look_started_at"),
});
