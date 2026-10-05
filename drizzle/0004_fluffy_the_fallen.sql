CREATE TABLE `notification_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`notification_id` text NOT NULL,
	`user_email` text NOT NULL,
	`read_at` integer NOT NULL,
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_reads_user_unique_idx` ON `notification_reads` (`notification_id`,`user_email`);--> statement-breakpoint
CREATE INDEX `notification_reads_user_idx` ON `notification_reads` (`user_email`,`read_at`);