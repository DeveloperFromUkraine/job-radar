-- remote-boards-collector · review follow-up T30 (review-2026-10-02 B12): the first fill resumes from
-- where it stopped. fill_status also gains the value `limited` (TEXT, checked in TypeScript — no DDL).
ALTER TABLE `collector_sources` ADD `fill_cursor` text;
