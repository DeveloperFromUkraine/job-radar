CREATE TABLE `collector_app_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `collector_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_valid_settings` text,
	`last_valid_settings_at` integer,
	`settings_notice` text,
	`settings_problem` text,
	`settings_problem_at` integer,
	`last_cleanup_on` text
);
--> statement-breakpoint
CREATE TABLE `collector_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`posting_id` text NOT NULL,
	`source_id` text NOT NULL,
	`source_item_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`description` text NOT NULL,
	`location_restriction` text,
	`categories` text NOT NULL,
	`published_at` integer,
	`expires_at` integer,
	`first_collected_at` integer NOT NULL,
	`is_first_fill` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`last_seen_run_id` text NOT NULL,
	`status` text NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`posting_id`) REFERENCES `collector_postings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `collector_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collector_listings_source_item_uq` ON `collector_listings` (`source_id`,`source_item_id`);--> statement-breakpoint
CREATE INDEX `collector_listings_posting_idx` ON `collector_listings` (`posting_id`);--> statement-breakpoint
CREATE TABLE `collector_postings` (
	`id` text PRIMARY KEY NOT NULL,
	`match_key` text NOT NULL,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`published_at` integer,
	`first_found_at` integer NOT NULL,
	`status` text NOT NULL,
	`closed_at` integer,
	`last_offered_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `collector_postings_match_key_idx` ON `collector_postings` (`match_key`);--> statement-breakpoint
CREATE TABLE `collector_request_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`sent_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `collector_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collector_request_ledger_source_sent_idx` ON `collector_request_ledger` (`source_id`,`sent_at`);--> statement-breakpoint
CREATE TABLE `collector_run_sources` (
	`run_id` text NOT NULL,
	`source_id` text NOT NULL,
	`outcome` text NOT NULL,
	`failure_reason` text,
	`items_returned` integer,
	`new_listings` integer NOT NULL,
	`unknown_location_new` integer NOT NULL,
	`added` integer NOT NULL,
	`updated` integer NOT NULL,
	`closed` integer NOT NULL,
	`held` integer NOT NULL,
	`no_category` integer NOT NULL,
	`fetch_finished_at` integer,
	PRIMARY KEY(`run_id`, `source_id`),
	FOREIGN KEY (`run_id`) REFERENCES `collector_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `collector_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collector_run_sources_source_run_idx` ON `collector_run_sources` (`source_id`,`run_id`);--> statement-breakpoint
CREATE TABLE `collector_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collector_runs_one_running_uq` ON `collector_runs` (`status`) WHERE status = 'running';--> statement-breakpoint
CREATE TABLE `collector_source_disabled_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`disabled_from` integer NOT NULL,
	`disabled_until` integer,
	FOREIGN KEY (`source_id`) REFERENCES `collector_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collector_source_disabled_periods_source_idx` ON `collector_source_disabled_periods` (`source_id`);--> statement-breakpoint
CREATE TABLE `collector_source_flags` (
	`source_id` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`raised_at` integer NOT NULL,
	PRIMARY KEY(`source_id`, `kind`),
	FOREIGN KEY (`source_id`) REFERENCES `collector_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `collector_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`last_read_at` integer,
	`last_success_at` integer,
	`first_success_at` integer,
	`fill_status` text NOT NULL,
	`fill_reached_at` integer,
	`fill_next_part_due_at` integer,
	`fill_completed_at` integer
);
