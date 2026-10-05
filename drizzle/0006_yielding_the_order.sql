CREATE TABLE `cash_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`voucher_number` text NOT NULL,
	`received_from` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'SAR' NOT NULL,
	`purpose` text NOT NULL,
	`payment_method` text DEFAULT 'CASH' NOT NULL,
	`destination_account` text NOT NULL,
	`reference_number` text,
	`branch_code` text,
	`department_code` text,
	`status` text DEFAULT 'CONFIRMED' NOT NULL,
	`created_by_email` text NOT NULL,
	`created_by_name` text NOT NULL,
	`confirmed_by_email` text NOT NULL,
	`confirmed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cash_receipts_voucher_number_unique` ON `cash_receipts` (`voucher_number`);--> statement-breakpoint
CREATE INDEX `cash_receipts_status_date_idx` ON `cash_receipts` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `cash_receipts_branch_date_idx` ON `cash_receipts` (`branch_code`,`created_at`);--> statement-breakpoint
ALTER TABLE `files` ADD `receipt_id` text REFERENCES cash_receipts(id);--> statement-breakpoint
CREATE INDEX `files_receipt_idx` ON `files` (`receipt_id`,`created_at`);