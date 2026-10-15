-- Manual dev rollback only (project ADR-0003: real rollback = restore the backup).
DROP INDEX IF EXISTS `matching_spend_started_idx`;
--> statement-breakpoint
DROP TABLE IF EXISTS `matching_spend`;
