-- remote-boards-collector · module-level state: the singleton state row and app running periods.

CREATE TABLE IF NOT EXISTS `collector_state` (
  `id` integer PRIMARY KEY NOT NULL,           -- always 1: one row per database
  `last_valid_settings` text,                  -- JSON copy of the last valid settings file (AC-27)
  `last_valid_settings_at` integer,
  `settings_notice` text,                      -- defaults_in_use, shown in source health only
  `settings_problem` text,                     -- plain-language reason the file is unreadable; raises the marker
  `settings_problem_at` integer,
  `last_cleanup_on` text                       -- YYYY-MM-DD in the owner's time zone (Flow 9 idempotency)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `collector_app_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `started_at` integer NOT NULL,
  `last_seen_at` integer NOT NULL              -- heartbeat from the one-minute due-check; overdue rule (AC-13)
);
