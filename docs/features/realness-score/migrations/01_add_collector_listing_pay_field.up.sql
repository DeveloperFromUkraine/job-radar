-- realness-score · a listing keeps its board's own pay field as stated (ADR-0004, spec AC-06, collector AC-11 amended).
-- Nullable, so no backfill: NULL = not read since this shipped (counts as stating pay on a board with a pay field);
-- "" = the board states nothing or has no field. Written on every fetch of the listing.
ALTER TABLE `collector_listings` ADD `pay_field` text;
