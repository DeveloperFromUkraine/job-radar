CREATE TABLE `remote_filter_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`country` text,
	`filter_on` integer NOT NULL,
	`look_country` text,
	`look_started_at` integer
);
