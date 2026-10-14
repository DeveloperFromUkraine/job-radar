-- remote-filter · module state: the singleton row holding the owner's country, the filter's on/off state and a one-off look.

CREATE TABLE IF NOT EXISTS `remote_filter_settings` (
  `id` integer PRIMARY KEY NOT NULL,           -- always 1: one row per database
  `country` text,                              -- the owner's country, ISO 3166-1 alpha-2 (e.g. PL); NULL = not chosen yet, no filter (AC-04)
  `filter_on` integer NOT NULL,                -- boolean; written with the row (true), off only by the owner (AC-07); choosing a country sets it on (AC-13)
  `look_country` text,                         -- one-off look country, ISO alpha-2; NULL = no look (AC-06)
  `look_visit_started_at` integer              -- the search visit start the look belongs to; a look from an earlier visit is ignored (AC-06)
);
