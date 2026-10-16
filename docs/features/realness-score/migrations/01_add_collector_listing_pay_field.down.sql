-- Manual dev rollback only (project ADR-0003: real rollback = restore the backup).
ALTER TABLE `collector_listings` DROP COLUMN `pay_field`;
