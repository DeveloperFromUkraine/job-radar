CREATE TABLE `realness_daily_shares` (
	`day` text PRIMARY KEY NOT NULL,
	`postings` integer NOT NULL,
	`lowered` integer NOT NULL,
	`recorded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `realness_mark_records` (
	`posting_id` text PRIMARY KEY NOT NULL,
	`mark` text NOT NULL,
	`penalty` integer NOT NULL,
	`signals` text NOT NULL,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`posting_id`) REFERENCES `collector_postings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `realness_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`realness_on` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `collector_listings` ADD `pay_field` text;--> statement-breakpoint
ALTER TABLE `collector_postings` ADD `reopened_at` integer;