// Search tables (docs/features/search-postings/data-model.md).
// Times are UTC epoch milliseconds; rules live in search/domain, not in the DB.
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const searchState = sqliteTable("search_state", {
  id: integer("id").primaryKey(), // always 1
  lastSkills: text("last_skills"), // JSON array; null = none (AC-13)
  visitStartedAt: integer("visit_started_at"),
  visitLastSeenAt: integer("visit_last_seen_at"),
  previousVisitStartedAt: integer("previous_visit_started_at"), // null on the first visit
});
