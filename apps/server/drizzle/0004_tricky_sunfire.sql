CREATE TABLE `tracking_marks` (
	`posting_id` text PRIMARY KEY NOT NULL,
	`mark` text,
	`marked_at` integer NOT NULL,
	`previous_mark` text,
	`previous_marked_at` integer,
	`applied_lost_at` integer,
	`previous_applied_lost_at` integer,
	`change_id` text NOT NULL,
	FOREIGN KEY (`posting_id`) REFERENCES `collector_postings`(`id`) ON UPDATE no action ON DELETE cascade
);
