-- remote-boards-collector · Posting aggregate: postings and their per-source listings (ADR-0005).
-- Owner marks are NOT stored here (ADR-0006).

CREATE TABLE IF NOT EXISTS `collector_postings` (
  `id` text PRIMARY KEY NOT NULL,              -- UUIDv7, stable across merge, close and reopen
  `match_key` text NOT NULL,                   -- normalized company + title (AC-04)
  `title` text NOT NULL,                       -- from the posting's first listing
  `company` text NOT NULL,
  `published_at` integer,                      -- earliest publication time among its listings
  `first_found_at` integer NOT NULL,           -- never changes on merge (AC-06)
  `status` text NOT NULL,                      -- open | closed
  `closed_at` integer,
  `last_offered_at` integer NOT NULL           -- last time an enabled source offered it (AC-10)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `collector_postings_match_key_idx`
  ON `collector_postings` (`match_key`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `collector_listings` (
  `id` text PRIMARY KEY NOT NULL,
  `posting_id` text NOT NULL REFERENCES `collector_postings`(`id`) ON DELETE CASCADE,
  `source_id` text NOT NULL REFERENCES `collector_sources`(`id`),
  `source_item_id` text NOT NULL,
  `url` text NOT NULL,                         -- link back to the source (attribution)
  `title` text NOT NULL,                       -- plain text, HTML stripped at ingest
  `company` text NOT NULL,
  `description` text NOT NULL,                 -- plain text
  `location_restriction` text,                 -- exactly as the source states it; NULL = unknown, never "anywhere" (AC-21, AC-22)
  `categories` text NOT NULL,                  -- JSON array of the source's categories (AC-23, AC-24)
  `published_at` integer,                      -- NULL when the source gives none
  `expires_at` integer,                        -- direct close signal where the source has one (Himalayas)
  `first_collected_at` integer NOT NULL,       -- freshness metric (spec §6)
  `is_first_fill` integer NOT NULL,            -- boolean: excluded from the freshness sample (AC-19)
  `last_seen_at` integer NOT NULL,
  `last_seen_run_id` text NOT NULL,            -- no FK: runs are pruned after 60 days
  `status` text NOT NULL,                      -- open | closed
  `closed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `collector_listings_source_item_uq`
  ON `collector_listings` (`source_id`, `source_item_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `collector_listings_posting_idx`
  ON `collector_listings` (`posting_id`);
