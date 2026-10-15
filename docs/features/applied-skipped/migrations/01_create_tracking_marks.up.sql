-- applied-skipped · Mark aggregate: one row per posting the owner ever marked and clean-up has not removed (ADR-0003).
-- Partly supersedes collector ADR-0006: the reference cascades on delete instead of restricting it.
-- The primary key is the FK, so the FK needs no separate index.

CREATE TABLE IF NOT EXISTS `tracking_marks` (
  `posting_id` text PRIMARY KEY NOT NULL REFERENCES `collector_postings`(`id`) ON DELETE CASCADE,
  `mark` text,                                 -- applied | skipped; NULL = cleared (row kept for the marked view, AC-05, AC-07)
  `marked_at` integer NOT NULL,                -- when the current state was set (the mark's date, or when it was cleared)
  `previous_mark` text,                        -- applied | skipped; NULL = cleared, or never marked when previous_marked_at is NULL too
  `previous_marked_at` integer,                -- the previous state's original date, restored by undo (AC-03)
  `applied_lost_at` integer,                   -- when applied was last lost; starts the grace day (AC-07); NULL while applied or never applied
  `previous_applied_lost_at` integer,          -- applied_lost_at before the latest change, restored by undo (AC-03)
  `change_id` text NOT NULL                    -- UUIDv7, replaced on every change; undo applies only while it is current (AC-04)
);
