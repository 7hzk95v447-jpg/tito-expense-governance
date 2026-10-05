CREATE TABLE `execution_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_run_item_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`status` text NOT NULL,
	`executed_amount_minor` integer,
	`bank_reference` text,
	`reason` text,
	`proof_file_id` text,
	`executed_by_email` text NOT NULL,
	`executed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`payment_run_item_id`) REFERENCES `payment_run_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`proof_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `execution_attempt_unique_idx` ON `execution_attempts` (`payment_run_item_id`,`attempt_number`);--> statement-breakpoint
CREATE INDEX `execution_attempt_status_idx` ON `execution_attempts` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_run_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_run_id` text NOT NULL,
	`action` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`actor_email` text NOT NULL,
	`note` text,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`payment_run_id`) REFERENCES `payment_runs`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_run_actions_idempotency_key_unique` ON `payment_run_actions` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `payment_run_actions_run_idx` ON `payment_run_actions` (`payment_run_id`,`created_at`);