-- Manual dev rollback only (project ADR-0003: real rollback = restore the backup).
DROP INDEX IF EXISTS `collector_run_sources_source_run_idx`;
DROP TABLE IF EXISTS `collector_run_sources`;
DROP INDEX IF EXISTS `collector_runs_one_running_uq`;
DROP TABLE IF EXISTS `collector_runs`;
