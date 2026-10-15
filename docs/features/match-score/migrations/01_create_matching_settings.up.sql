-- match-score · module state: the singleton row holding the profile, its version, the scoring cap,
-- the one-time data notice agreement and the scorer's current problem (sad.md §5, ADR-0005, ADR-0006).

CREATE TABLE IF NOT EXISTS `matching_settings` (
  `id` integer PRIMARY KEY NOT NULL,           -- always 1: one row per database
  `profile` text,                              -- JSON profile (CONTEXT: Profile), checked in matching/domain; NULL = no profile yet (AC-15)
  `profile_version` integer NOT NULL,          -- 0 with no profile; +1 on every save that changes a profile field (AC-10); scores against a lower version are stale
  `profile_saved_at` integer,                  -- when the profile was last changed
  `cap_usd_micros` integer NOT NULL,           -- scoring cap in millionths of a dollar, 0..100_000_000; written as 5_000_000 ($5) with the row (AC-12, AC-19)
  `notice_agreed_at` integer,                  -- when the owner agreed to the data notice; NULL = nothing may be sent (AC-20)
  `last_success_at` integer,                   -- when a scoring last returned a usable answer (scoring health, AC-14)
  `scoring_problem` text,                      -- provider_unreachable | rate_limited | key_missing | key_refused; NULL = none (AC-14). Cap reached is computed, not stored
  `scoring_problem_at` integer                 -- when the current problem was first seen
);
