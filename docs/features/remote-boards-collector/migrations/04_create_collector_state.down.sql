-- Manual dev rollback only (project ADR-0003: real rollback = restore the backup).
DROP TABLE IF EXISTS `collector_app_sessions`;
DROP TABLE IF EXISTS `collector_state`;
