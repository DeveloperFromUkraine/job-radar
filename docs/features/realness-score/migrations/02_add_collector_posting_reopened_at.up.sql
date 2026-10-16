-- realness-score · a posting keeps when it last reopened (spec AC-08, collector AC-11 amended).
-- Nullable, so no backfill: NULL = not reopened since this shipped. Set where the merge decision reopens a posting.
ALTER TABLE `collector_postings` ADD `reopened_at` integer;
