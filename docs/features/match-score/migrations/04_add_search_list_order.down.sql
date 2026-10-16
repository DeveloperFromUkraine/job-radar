-- Manual dev rollback only (project ADR-0003: real rollback = restore the backup).
ALTER TABLE `search_state` DROP COLUMN `list_order`;
