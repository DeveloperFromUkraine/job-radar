-- match-score · spend ledger: one row per attempt (scoring or CV draft), reserved at its largest possible cost
-- before it starts and settled from the reported usage (ADR-0006, spec AC-12).

CREATE TABLE IF NOT EXISTS `matching_spend` (
  `id` text PRIMARY KEY NOT NULL,              -- UUIDv7 from core/id.ts
  `kind` text NOT NULL,                        -- score | draft
  `posting_id` text,                           -- the scored posting; NULL for a draft. No FK: spend outlives clean-up
  `model` text NOT NULL,                       -- model id the attempt used
  `reserved_usd_micros` integer NOT NULL,      -- largest possible cost, reserved in the same transaction as the cap check
  `settled_usd_micros` integer,                -- real cost from usage; NULL = in flight, or no answer (the reservation counts)
  `outcome` text NOT NULL,                     -- reserved | answered | unusable | no_answer
  `input_tokens` integer,                      -- usage as reported; NULL without an answer
  `cache_write_tokens` integer,
  `cache_read_tokens` integer,
  `output_tokens` integer,
  `started_at` integer NOT NULL,               -- attempt start; decides the calendar month (machine time zone)
  `settled_at` integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `matching_spend_started_idx` ON `matching_spend` (`started_at`);
