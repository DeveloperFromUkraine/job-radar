-- match-score · score aggregate: one row per posting the scorer has tried, holding its current score with the
-- fingerprints it was made against, and its run of unusable answers (ADR-0005, ADR-0008, spec AC-06, AC-10, AC-18).

CREATE TABLE IF NOT EXISTS `matching_scores` (
  `posting_id` text PRIMARY KEY NOT NULL,      -- one row per posting; removed with the posting (cascade, ADR-0005)
  `total` integer,                             -- 0..100, computed in matching/domain with fixed weights and the neutral rule (ADR-0008); NULL = never scored
  `skills_part` integer,                       -- 0..100; NULL = not stated (or never scored)
  `role_type_part` integer,                    -- 0..100; NULL = not stated
  `seniority_part` integer,                    -- 0..100; NULL = not stated (AC-04)
  `terms_part` integer,                        -- 0..100; NULL = not stated (AC-04)
  `note` text,                                 -- fit note, at most 40 words, shown as plain text (AC-01, AC-03)
  `claims` text,                               -- JSON array of the posting's own words, shown as "the posting says…" (AC-03)
  `text_fingerprint` text,                     -- hash of exactly the text scored: title, company, description, open listings' location restrictions (ADR-0005)
  `profile_version` integer,                   -- matching_settings.profile_version the score was made against (AC-10)
  `scorer_version` text,                       -- version of the prompt and output schema; a change makes every score stale (ADR-0008)
  `scored_at` integer,                         -- when the current score was stored
  `strike_count` integer NOT NULL,             -- consecutive unusable answers against strike_key; 3 = could not be scored (AC-18)
  `strike_key` text,                           -- text fingerprint + profile version + scorer version the strikes were made against; a different key resets the count
  `last_failure` text,                         -- plain-language reason for the last unusable answer
  `last_failure_at` integer,                   -- feeds "could not be scored this month" in scoring health
  FOREIGN KEY (`posting_id`) REFERENCES `collector_postings`(`id`) ON UPDATE no action ON DELETE cascade
);
