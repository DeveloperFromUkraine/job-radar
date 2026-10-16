-- realness-score · one row per marked posting: its realness at the moment of its latest mark, worked out with
-- switch-on rules (spec AC-14, §7 KPIs; sad.md §6 flows 3 and 7). Replaced on a change, deleted on a clear,
-- removed with the posting.

CREATE TABLE IF NOT EXISTS `realness_mark_records` (
  `posting_id` text PRIMARY KEY NOT NULL,      -- one record per posting; the PK also serves the FK
  `mark` text NOT NULL,                        -- applied | skipped, checked in TypeScript
  `penalty` integer NOT NULL,                  -- 0..30
  `signals` text NOT NULL,                     -- JSON array of signals as the API shows them (kind, basis, days, boards); [] = none
  `recorded_at` integer NOT NULL,              -- when the mark was set (UTC epoch ms)
  FOREIGN KEY (`posting_id`) REFERENCES `collector_postings`(`id`) ON UPDATE no action ON DELETE cascade
);
