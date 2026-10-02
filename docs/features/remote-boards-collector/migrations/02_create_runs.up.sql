-- remote-boards-collector · Run aggregate: collection runs and each due source's outcome in a run.

CREATE TABLE IF NOT EXISTS `collector_runs` (
  `id` text PRIMARY KEY NOT NULL,              -- UUIDv7, so id order = start order
  `trigger` text NOT NULL,                     -- schedule | catch_up | collect_now
  `status` text NOT NULL,                      -- running | finished | incomplete (AC-20)
  `started_at` integer NOT NULL,
  `finished_at` integer
);
--> statement-breakpoint
-- At most one run in progress (CONTEXT invariant); also answers "is a run in progress" (Flows 2, 3, 4).
CREATE UNIQUE INDEX IF NOT EXISTS `collector_runs_one_running_uq`
  ON `collector_runs` (`status`) WHERE `status` = 'running';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `collector_run_sources` (
  `run_id` text NOT NULL REFERENCES `collector_runs`(`id`) ON DELETE CASCADE,
  `source_id` text NOT NULL REFERENCES `collector_sources`(`id`) ON DELETE CASCADE,
  `outcome` text NOT NULL,                     -- pending | complete | capped | partial | failed (ADR-0004)
  `failure_reason` text,                       -- plain-language reason (AC-03)
  `items_returned` integer,                    -- 0 on two due runs in a row = silent (AC-13)
  `new_listings` integer NOT NULL,             -- AC-25 denominator
  `unknown_location_new` integer NOT NULL,     -- AC-25 numerator
  `added` integer NOT NULL,                    -- AC-12 counts, per posting outcome
  `updated` integer NOT NULL,
  `closed` integer NOT NULL,
  `held` integer NOT NULL,                     -- closures held back by AC-14
  `no_category` integer NOT NULL,              -- listings skipped for having no category (AC-23)
  `fetch_finished_at` integer,
  PRIMARY KEY (`run_id`, `source_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `collector_run_sources_source_run_idx`
  ON `collector_run_sources` (`source_id`, `run_id`);
