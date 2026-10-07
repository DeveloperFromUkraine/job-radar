-- search-postings · module state: the singleton row holding the last skills and the visit times.

CREATE TABLE IF NOT EXISTS `search_state` (
  `id` integer PRIMARY KEY NOT NULL,           -- always 1: one row per database
  `last_skills` text,                          -- JSON array of the last skills that passed the check, owner's spelling; NULL = none (AC-13)
  `visit_started_at` integer,                  -- current visit start (AC-14)
  `visit_last_seen_at` integer,                -- heartbeat from open + waiting-count polls; >30 min gap starts a new visit
  `previous_visit_started_at` integer          -- "new" = posting first collected after this; NULL on the first visit (nothing new)
);
