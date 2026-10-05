-- Manual dev rollback only (project ADR-0003: real rollback = restore the backup).
DROP TABLE IF EXISTS `search_state`;
