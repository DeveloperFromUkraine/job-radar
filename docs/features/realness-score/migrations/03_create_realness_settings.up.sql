-- realness-score · module state: the singleton row holding the owner's realness switch (spec AC-10, AC-11).
-- Upserted lazily like remote_filter_settings: no row = never chosen = on.

CREATE TABLE IF NOT EXISTS `realness_settings` (
  `id` integer PRIMARY KEY NOT NULL,           -- always 1: one row per database
  `realness_on` integer NOT NULL               -- boolean; written true with the row (AC-10: on at first opening)
);
