CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`reason` text,
	`correlation_id` text NOT NULL,
	`previous_hash` text,
	`event_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_events` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `backup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`object_key` text,
	`requested_by_email` text NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `beneficiaries` (
	`id` text PRIMARY KEY NOT NULL,
	`normalized_name` text NOT NULL,
	`display_name` text NOT NULL,
	`kind` text NOT NULL,
	`reference_number` text,
	`mobile` text,
	`bank_name` text,
	`iban` text,
	`account_name` text,
	`created_by_email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `beneficiaries_name_idx` ON `beneficiaries` (`normalized_name`);--> statement-breakpoint
CREATE INDEX `beneficiaries_iban_idx` ON `beneficiaries` (`iban`);--> statement-breakpoint
CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`name_ar` text NOT NULL,
	`code` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `branches_code_unique` ON `branches` (`code`);--> statement-breakpoint
CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`name_ar` text NOT NULL,
	`name_en` text,
	`code` text NOT NULL,
	`parent_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_code_unique` ON `departments` (`code`);--> statement-breakpoint
CREATE TABLE `expense_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`request_number` text NOT NULL,
	`draft_key` text NOT NULL,
	`created_by_email` text NOT NULL,
	`created_by_name` text NOT NULL,
	`department_code` text NOT NULL,
	`branch_code` text,
	`category_code` text NOT NULL,
	`expense_type` text NOT NULL,
	`settlement_group` text NOT NULL,
	`payment_method` text NOT NULL,
	`beneficiary_name` text NOT NULL,
	`beneficiary_type` text NOT NULL,
	`bank_name` text,
	`iban` text,
	`cash_recipient` text,
	`government_biller` text,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'SAR' NOT NULL,
	`purpose` text NOT NULL,
	`details` text NOT NULL,
	`priority` text DEFAULT 'NORMAL' NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`current_stage` text DEFAULT 'CREATOR' NOT NULL,
	`current_assignee` text,
	`revision_number` integer DEFAULT 1 NOT NULL,
	`lock_version` integer DEFAULT 1 NOT NULL,
	`submitted_at` integer,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_requests_request_number_unique` ON `expense_requests` (`request_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `expense_requests_draft_key_unique` ON `expense_requests` (`draft_key`);--> statement-breakpoint
CREATE INDEX `requests_status_stage_idx` ON `expense_requests` (`status`,`current_stage`,`created_at`);--> statement-breakpoint
CREATE INDEX `requests_creator_idx` ON `expense_requests` (`created_by_email`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `requests_department_idx` ON `expense_requests` (`department_code`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `requests_batch_group_idx` ON `expense_requests` (`payment_method`,`settlement_group`,`status`);--> statement-breakpoint
CREATE TABLE `expense_types` (
	`id` text PRIMARY KEY NOT NULL,
	`category_code` text NOT NULL,
	`name_ar` text NOT NULL,
	`settlement_group` text NOT NULL,
	`default_department_code` text,
	`workflow_code` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `expense_types_category_idx` ON `expense_types` (`category_code`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_key` text,
	`request_id` text,
	`payment_run_id` text,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`purpose` text DEFAULT 'REQUEST_ATTACHMENT' NOT NULL,
	`status` text DEFAULT 'READY' NOT NULL,
	`uploaded_by_email` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `expense_requests`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_object_key_unique` ON `files` (`object_key`);--> statement-breakpoint
CREATE INDEX `files_draft_idx` ON `files` (`draft_key`,`status`);--> statement-breakpoint
CREATE INDEX `files_request_idx` ON `files` (`request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_email` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action_url` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`sent_by_email` text NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe_idx` ON `notifications` (`recipient_email`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notifications_recipient_idx` ON `notifications` (`recipient_email`,`is_read`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_run_items` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_run_id` text NOT NULL,
	`request_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`execution_status` text DEFAULT 'PENDING' NOT NULL,
	`bank_reference` text,
	`failure_reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`payment_run_id`) REFERENCES `payment_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`request_id`) REFERENCES `expense_requests`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_run_request_unique_idx` ON `payment_run_items` (`payment_run_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `payment_run_items_request_idx` ON `payment_run_items` (`request_id`);--> statement-breakpoint
CREATE TABLE `payment_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`run_number` text NOT NULL,
	`payment_method` text NOT NULL,
	`settlement_group` text NOT NULL,
	`source_account` text NOT NULL,
	`currency` text DEFAULT 'SAR' NOT NULL,
	`status` text DEFAULT 'BATCH_DRAFT' NOT NULL,
	`prepared_by_email` text NOT NULL,
	`approved_by_email` text,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`closed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_runs_run_number_unique` ON `payment_runs` (`run_number`);--> statement-breakpoint
CREATE INDEX `payment_runs_group_idx` ON `payment_runs` (`payment_method`,`settlement_group`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `request_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`action` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`actor_email` text NOT NULL,
	`actor_name` text NOT NULL,
	`note` text,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `expense_requests`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `request_actions_idempotency_key_unique` ON `request_actions` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `request_actions_request_idx` ON `request_actions` (`request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `request_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`reason` text,
	`changed_by_email` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `expense_requests`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `request_revision_unique_idx` ON `request_revisions` (`request_id`,`revision_number`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`mobile` text,
	`department_id` text,
	`branch_id` text,
	`job_title` text,
	`system_role` text DEFAULT 'REQUESTER' NOT NULL,
	`manager_id` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_department_idx` ON `users` (`department_id`);--> statement-breakpoint
CREATE INDEX `users_branch_idx` ON `users` (`branch_id`);--> statement-breakpoint
CREATE TABLE `work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text,
	`payment_run_id` text,
	`task_type` text NOT NULL,
	`assigned_user_email` text,
	`assigned_department_code` text,
	`assigned_role` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`due_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `expense_requests`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `work_items_user_idx` ON `work_items` (`assigned_user_email`,`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `work_items_department_idx` ON `work_items` (`assigned_department_code`,`assigned_role`,`status`);