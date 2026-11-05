CREATE TABLE `collector_companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`ats` text,
	`slug` text,
	`origin` text NOT NULL,
	`status` text NOT NULL,
	`added_at` integer NOT NULL,
	`last_checked_at` integer,
	`last_result` text,
	`open_roles` integer
);
CREATE UNIQUE INDEX `collector_companies_board_uq` ON `collector_companies` (`ats`,`slug`);
CREATE INDEX `collector_companies_name_key_idx` ON `collector_companies` (`name_key`);
CREATE INDEX `collector_companies_due_idx` ON `collector_companies` (`status`,`last_checked_at`);
