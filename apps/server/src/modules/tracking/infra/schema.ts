// Tracking tables (docs/features/applied-skipped/data-model.md, ADR-0003).
// Times are UTC epoch milliseconds; mark values are checked in tracking/domain, not in the DB.
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { postings } from "../../collector/infra/schema.js";

// One row per posting the owner ever marked and clean-up has not removed. The cascade lets clean-up
// remove skipped and cleared postings (AC-09); a write for a removed posting fails on it (AC-15).
export const trackingMarks = sqliteTable("tracking_marks", {
  postingId: text("posting_id")
    .primaryKey()
    .references(() => postings.id, { onDelete: "cascade" }),
  mark: text("mark", { enum: ["applied", "skipped"] }), // null = cleared (row kept for the marked view)
  markedAt: integer("marked_at").notNull(), // when the current state was set
  previousMark: text("previous_mark", { enum: ["applied", "skipped"] }), // null + null date = never marked
  previousMarkedAt: integer("previous_marked_at"),
  appliedLostAt: integer("applied_lost_at"), // starts the grace day (AC-07)
  previousAppliedLostAt: integer("previous_applied_lost_at"),
  changeId: text("change_id").notNull(), // UUIDv7, replaced on every change; undo guard (AC-04)
});
