// Matching tables (docs/features/match-score/data-model.md, ADR-0005, ADR-0006).
// Times are UTC epoch milliseconds; money is integer millionths of a dollar; enum-like TEXT values
// are checked in TypeScript, not by CHECK. Rules live in matching/domain.
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { postings } from "../../collector/infra/schema.js";

// One singleton row (id always 1), upserted lazily with version 0 and the $5 cap.
export const matchingSettings = sqliteTable("matching_settings", {
  id: integer("id").primaryKey(), // always 1
  profile: text("profile"), // JSON profile; null = no profile yet (AC-15)
  profileVersion: integer("profile_version").notNull(), // +1 on a save that changes a profile field (AC-10)
  profileSavedAt: integer("profile_saved_at"),
  capUsdMicros: integer("cap_usd_micros").notNull(), // 0..100_000_000 (AC-19)
  noticeAgreedAt: integer("notice_agreed_at"), // null = nothing may be sent (AC-20)
  lastSuccessAt: integer("last_success_at"),
  scoringProblem: text("scoring_problem", {
    enum: ["provider_unreachable", "rate_limited", "key_missing", "key_refused"],
  }),
  scoringProblemAt: integer("scoring_problem_at"),
});

// One current score per posting, removed with the posting (ADR-0005).
export const matchingScores = sqliteTable("matching_scores", {
  postingId: text("posting_id")
    .primaryKey()
    .references(() => postings.id, { onDelete: "cascade" }),
  total: integer("total"), // null = never scored (the row only carries strikes)
  skillsPart: integer("skills_part"), // null = not stated
  roleTypePart: integer("role_type_part"),
  seniorityPart: integer("seniority_part"),
  termsPart: integer("terms_part"),
  note: text("note"),
  claims: text("claims"), // JSON array of the posting's own words
  textFingerprint: text("text_fingerprint"),
  profileVersion: integer("profile_version"),
  scorerVersion: text("scorer_version"),
  scoredAt: integer("scored_at"),
  strikeCount: integer("strike_count").notNull(), // consecutive unusable answers against strike_key (AC-18)
  strikeKey: text("strike_key"),
  lastFailure: text("last_failure"),
  lastFailureAt: integer("last_failure_at"),
});

// One row per attempt: reserved at its largest possible cost, settled from usage (ADR-0006).
export const matchingSpend = sqliteTable(
  "matching_spend",
  {
    id: text("id").primaryKey(), // UUIDv7
    kind: text("kind", { enum: ["score", "draft"] }).notNull(),
    postingId: text("posting_id"), // no FK: spend outlives posting clean-up
    model: text("model").notNull(),
    reservedUsdMicros: integer("reserved_usd_micros").notNull(),
    settledUsdMicros: integer("settled_usd_micros"), // null = in flight or no answer (the reservation counts)
    outcome: text("outcome", { enum: ["reserved", "answered", "unusable", "no_answer"] }).notNull(),
    inputTokens: integer("input_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    outputTokens: integer("output_tokens"),
    startedAt: integer("started_at").notNull(),
    settledAt: integer("settled_at"),
  },
  (t) => [index("matching_spend_started_idx").on(t.startedAt)],
);
