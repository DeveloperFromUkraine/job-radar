// Collector tables (docs/features/remote-boards-collector/data-model.md).
// Times are UTC epoch milliseconds; status-like TEXT values are checked in TypeScript, not by CHECK.
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// ---- Source aggregate -------------------------------------------------------------------------

export const sources = sqliteTable("collector_sources", {
  id: text("id").primaryKey(), // source code from the adapter registry
  lastReadAt: integer("last_read_at"),
  lastSuccessAt: integer("last_success_at"),
  firstSuccessAt: integer("first_success_at"),
  fillStatus: text("fill_status", { enum: ["pending", "continuing", "complete"] }).notNull(),
  fillReachedAt: integer("fill_reached_at"),
  fillNextPartDueAt: integer("fill_next_part_due_at"),
  fillCompletedAt: integer("fill_completed_at"),
});

export const sourceDisabledPeriods = sqliteTable(
  "collector_source_disabled_periods",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    disabledFrom: integer("disabled_from").notNull(),
    disabledUntil: integer("disabled_until"),
  },
  (t) => [index("collector_source_disabled_periods_source_idx").on(t.sourceId)],
);

export const requestLedger = sqliteTable(
  "collector_request_ledger",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    sentAt: integer("sent_at").notNull(),
  },
  (t) => [index("collector_request_ledger_source_sent_idx").on(t.sourceId, t.sentAt)],
);

export const sourceFlags = sqliteTable(
  "collector_source_flags",
  {
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["failing", "silent", "held_back", "unknown_location", "category_unmatched"],
    }).notNull(),
    reason: text("reason").notNull(),
    raisedAt: integer("raised_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sourceId, t.kind] })],
);

// ---- Run aggregate ----------------------------------------------------------------------------

export const runs = sqliteTable(
  "collector_runs",
  {
    id: text("id").primaryKey(),
    trigger: text("trigger", { enum: ["schedule", "catch_up", "collect_now"] }).notNull(),
    status: text("status", { enum: ["running", "finished", "incomplete"] }).notNull(),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  // At most one run in progress (CONTEXT invariant).
  (t) => [uniqueIndex("collector_runs_one_running_uq").on(t.status).where(sql`status = 'running'`)],
);

export const runSources = sqliteTable(
  "collector_run_sources",
  {
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    outcome: text("outcome", { enum: ["pending", "complete", "capped", "partial", "failed"] }).notNull(),
    failureReason: text("failure_reason"),
    itemsReturned: integer("items_returned"),
    newListings: integer("new_listings").notNull(),
    unknownLocationNew: integer("unknown_location_new").notNull(),
    added: integer("added").notNull(),
    updated: integer("updated").notNull(),
    closed: integer("closed").notNull(),
    held: integer("held").notNull(),
    noCategory: integer("no_category").notNull(),
    fetchFinishedAt: integer("fetch_finished_at"),
  },
  (t) => [
    primaryKey({ columns: [t.runId, t.sourceId] }),
    index("collector_run_sources_source_run_idx").on(t.sourceId, t.runId),
  ],
);

// ---- Posting aggregate ------------------------------------------------------------------------

export const postings = sqliteTable(
  "collector_postings",
  {
    id: text("id").primaryKey(),
    matchKey: text("match_key").notNull(),
    title: text("title").notNull(),
    company: text("company").notNull(),
    publishedAt: integer("published_at"),
    firstFoundAt: integer("first_found_at").notNull(),
    status: text("status", { enum: ["open", "closed"] }).notNull(),
    closedAt: integer("closed_at"),
    lastOfferedAt: integer("last_offered_at").notNull(),
  },
  (t) => [index("collector_postings_match_key_idx").on(t.matchKey)],
);

export const listings = sqliteTable(
  "collector_listings",
  {
    id: text("id").primaryKey(),
    postingId: text("posting_id")
      .notNull()
      .references(() => postings.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    sourceItemId: text("source_item_id").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    company: text("company").notNull(),
    description: text("description").notNull(),
    locationRestriction: text("location_restriction"), // null = unknown, never "anywhere"
    categories: text("categories").notNull(), // JSON array
    publishedAt: integer("published_at"),
    expiresAt: integer("expires_at"),
    firstCollectedAt: integer("first_collected_at").notNull(),
    isFirstFill: integer("is_first_fill", { mode: "boolean" }).notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    lastSeenRunId: text("last_seen_run_id").notNull(), // no FK: runs are pruned after 60 days
    status: text("status", { enum: ["open", "closed"] }).notNull(),
    closedAt: integer("closed_at"),
  },
  (t) => [
    uniqueIndex("collector_listings_source_item_uq").on(t.sourceId, t.sourceItemId),
    index("collector_listings_posting_idx").on(t.postingId),
  ],
);

// ---- Module state -----------------------------------------------------------------------------

export const collectorState = sqliteTable("collector_state", {
  id: integer("id").primaryKey(), // always 1
  lastValidSettings: text("last_valid_settings"),
  lastValidSettingsAt: integer("last_valid_settings_at"),
  settingsNotice: text("settings_notice", { enum: ["defaults_in_use"] }),
  settingsProblem: text("settings_problem"),
  settingsProblemAt: integer("settings_problem_at"),
  lastCleanupOn: text("last_cleanup_on"),
});

export const appSessions = sqliteTable("collector_app_sessions", {
  id: text("id").primaryKey(),
  startedAt: integer("started_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
});
