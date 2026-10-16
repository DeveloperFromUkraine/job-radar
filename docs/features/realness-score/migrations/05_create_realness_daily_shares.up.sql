-- realness-score · the daily lowered share: one row per calendar day of the machine's time zone, kept on the
-- day's first opening of the owner's list (spec AC-14, §7 baseline; sad.md §6 flow 6). INSERT OR IGNORE keeps the first.

CREATE TABLE IF NOT EXISTS `realness_daily_shares` (
  `day` text PRIMARY KEY NOT NULL,             -- YYYY-MM-DD in the machine's time zone
  `postings` integer NOT NULL,                 -- postings in the owner's list at that opening
  `lowered` integer NOT NULL,                  -- of them, how many had a penalty (switch-on rules)
  `recorded_at` integer NOT NULL               -- UTC epoch ms
);
