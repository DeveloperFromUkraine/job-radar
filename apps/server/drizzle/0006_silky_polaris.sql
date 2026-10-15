CREATE TABLE `matching_scores` (
	`posting_id` text PRIMARY KEY NOT NULL,
	`total` integer,
	`skills_part` integer,
	`role_type_part` integer,
	`seniority_part` integer,
	`terms_part` integer,
	`note` text,
	`claims` text,
	`text_fingerprint` text,
	`profile_version` integer,
	`scorer_version` text,
	`scored_at` integer,
	`strike_count` integer NOT NULL,
	`strike_key` text,
	`last_failure` text,
	`last_failure_at` integer,
	FOREIGN KEY (`posting_id`) REFERENCES `collector_postings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `matching_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`profile` text,
	`profile_version` integer NOT NULL,
	`profile_saved_at` integer,
	`cap_usd_micros` integer NOT NULL,
	`notice_agreed_at` integer,
	`last_success_at` integer,
	`scoring_problem` text,
	`scoring_problem_at` integer
);
--> statement-breakpoint
CREATE TABLE `matching_spend` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`posting_id` text,
	`model` text NOT NULL,
	`reserved_usd_micros` integer NOT NULL,
	`settled_usd_micros` integer,
	`outcome` text NOT NULL,
	`input_tokens` integer,
	`cache_write_tokens` integer,
	`cache_read_tokens` integer,
	`output_tokens` integer,
	`started_at` integer NOT NULL,
	`settled_at` integer
);
--> statement-breakpoint
CREATE INDEX `matching_spend_started_idx` ON `matching_spend` (`started_at`);--> statement-breakpoint
ALTER TABLE `search_state` ADD `list_order` text;