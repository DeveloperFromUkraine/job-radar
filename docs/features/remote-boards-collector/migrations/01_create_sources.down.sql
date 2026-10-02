-- Manual dev rollback only. The repo's real rollback is restoring the pre-migration backup (project ADR-0003).
-- Run after 02 and 03 down: their tables reference collector_sources.
DROP TABLE IF EXISTS `collector_source_flags`;
DROP INDEX IF EXISTS `collector_request_ledger_source_sent_idx`;
DROP TABLE IF EXISTS `collector_request_ledger`;
DROP INDEX IF EXISTS `collector_source_disabled_periods_source_idx`;
DROP TABLE IF EXISTS `collector_source_disabled_periods`;
DROP TABLE IF EXISTS `collector_sources`;
