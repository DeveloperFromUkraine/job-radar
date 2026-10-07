-- remote-boards-collector · Source aggregate: per-source state, disabled periods, request ledger, health flags.
-- STAGED reference schema (SQLite). Promoted by `implement`: write collector/infra/schema.ts, run
-- `pnpm --filter @job-radar/server db:generate`, compare the resulting schema with this file.
-- Times are UTC epoch milliseconds (sad.md §8). Status-like TEXT values are enforced in TypeScript, not by CHECK.

CREATE TABLE IF NOT EXISTS `collector_sources` (
  `id` text PRIMARY KEY NOT NULL,              -- source code from the adapter registry: jobicy, himalayas, remotive, weworkremotely
  `last_read_at` integer,                      -- last request recorded in the ledger (due-check, AC-02)
  `last_success_at` integer,                   -- last fetch that finished: complete, capped or partial (AC-18, AC-20)
  `first_success_at` integer,                  -- start of collected history (AC-25 needs 7 days)
  `fill_status` text NOT NULL,                 -- pending | continuing | limited | complete (AC-19; limited since review 2026-10-02)
  `fill_reached_at` integer,                   -- oldest publication time the first fill has reached
  `fill_next_part_due_at` integer,
  `fill_completed_at` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `collector_source_disabled_periods` (
  `id` text PRIMARY KEY NOT NULL,
  `source_id` text NOT NULL REFERENCES `collector_sources`(`id`) ON DELETE CASCADE,
  `disabled_from` integer NOT NULL,
  `disabled_until` integer                     -- NULL while the source is still disabled (AC-10, AC-26)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `collector_source_disabled_periods_source_idx`
  ON `collector_source_disabled_periods` (`source_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `collector_request_ledger` (
  `id` text PRIMARY KEY NOT NULL,
  `source_id` text NOT NULL REFERENCES `collector_sources`(`id`) ON DELETE CASCADE,
  `sent_at` integer NOT NULL                   -- written BEFORE the request is sent (ADR-0003)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `collector_request_ledger_source_sent_idx`
  ON `collector_request_ledger` (`source_id`, `sent_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `collector_source_flags` (
  `source_id` text NOT NULL REFERENCES `collector_sources`(`id`) ON DELETE CASCADE,
  `kind` text NOT NULL,                        -- failing | silent | held_back | unknown_location | category_unmatched
  `reason` text NOT NULL,                      -- plain-language reason shown in source health
  `raised_at` integer NOT NULL,
  PRIMARY KEY (`source_id`, `kind`)
);
