-- Manual dev rollback only (project ADR-0003: real rollback = restore the backup).
DROP INDEX IF EXISTS `collector_listings_posting_idx`;
DROP INDEX IF EXISTS `collector_listings_source_item_uq`;
DROP TABLE IF EXISTS `collector_listings`;
DROP INDEX IF EXISTS `collector_postings_match_key_idx`;
DROP TABLE IF EXISTS `collector_postings`;
