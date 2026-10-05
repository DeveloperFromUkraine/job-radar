CREATE TABLE `search_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_skills` text,
	`visit_started_at` integer,
	`visit_last_seen_at` integer,
	`previous_visit_started_at` integer
);
