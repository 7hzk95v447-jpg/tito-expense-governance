CREATE TABLE `monthly_obligations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`obligation_type` text NOT NULL,
	`provider_name` text NOT NULL,
	`account_reference` text,
	`payment_method` text DEFAULT 'BANK' NOT NULL,
	`expected_amount_minor` integer,
	`due_day` integer DEFAULT 28 NOT NULL,
	`reminder_days_before` integer DEFAULT 3 NOT NULL,
	`next_due_date` integer NOT NULL,
	`responsible_email` text NOT NULL,
	`department_code` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`last_notified_period` text,
	`created_by_email` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `monthly_obligations_due_idx` ON `monthly_obligations` (`status`,`next_due_date`);--> statement-breakpoint
CREATE INDEX `monthly_obligations_responsible_idx` ON `monthly_obligations` (`responsible_email`,`status`);--> statement-breakpoint
ALTER TABLE `expense_requests` ADD `account_holder_name` text;--> statement-breakpoint
ALTER TABLE `expense_requests` ADD `account_name_match` text;--> statement-breakpoint
ALTER TABLE `expense_requests` ADD `account_mismatch_reason` text;--> statement-breakpoint
ALTER TABLE `expense_requests` ADD `priority_set_by_email` text;--> statement-breakpoint
ALTER TABLE `expense_requests` ADD `priority_set_at` integer;--> statement-breakpoint
ALTER TABLE `expense_requests` ADD `monthly_obligation_id` text;--> statement-breakpoint
ALTER TABLE `files` ADD `monthly_obligation_id` text;--> statement-breakpoint
ALTER TABLE `payment_runs` ADD `approved_at` integer;--> statement-breakpoint
ALTER TABLE `payment_runs` ADD `digital_signature_code` text;--> statement-breakpoint
ALTER TABLE `users` ADD `username` text NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `auth_identity_email` text;--> statement-breakpoint
ALTER TABLE `users` ADD `must_change_password` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_login_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_auth_identity_email_unique` ON `users` (`auth_identity_email`);
--> statement-breakpoint
INSERT OR IGNORE INTO `branches` (`id`,`name_ar`,`code`,`active`,`created_at`) VALUES
  ('branch-khamis','الفرع الرئيسي','KHAMIS',1,unixepoch());
--> statement-breakpoint
INSERT OR IGNORE INTO `departments` (`id`,`name_ar`,`name_en`,`code`,`active`,`created_at`) VALUES
  ('dept-branch','إدارة الفرع','Branch Management','BRANCH',1,unixepoch()),
  ('dept-warehouse','إدارة المستودع','Warehouse','WAREHOUSE',1,unixepoch()),
  ('dept-marketing','إدارة التسويق','Marketing','MARKETING',1,unixepoch()),
  ('dept-purchasing','إدارة المشتريات','Purchasing','PURCHASING',1,unixepoch()),
  ('dept-it','تقنية المعلومات','Information Technology','IT',1,unixepoch()),
  ('dept-hr','الموارد البشرية','Human Resources','HR',1,unixepoch()),
  ('dept-finance','المالية والحسابات','Finance & Accounting','FINANCE',1,unixepoch()),
  ('dept-executive','الإدارة التنفيذية','Executive Management','EXECUTIVE',1,unixepoch());
--> statement-breakpoint
INSERT OR IGNORE INTO `users` (`id`,`full_name`,`username`,`email`,`department_id`,`branch_id`,`job_title`,`system_role`,`status`,`must_change_password`,`created_at`) VALUES
  ('usr-admin-tito','مدير النظام','admin','admin@example.invalid','dept-executive','branch-khamis','مدير النظام','ADMIN','ACTIVE',0,unixepoch());
--> statement-breakpoint
INSERT OR IGNORE INTO `expense_types` (`id`,`category_code`,`name_ar`,`settlement_group`,`default_department_code`,`workflow_code`,`active`,`created_at`) VALUES
  ('et-supplier-purchase','supplier','شراء بضاعة أو توريد','SUPPLIERS','PURCHASING','STANDARD',1,unixepoch()),
  ('et-supplier-due','supplier','سداد مستحق مورد','SUPPLIERS','PURCHASING','STANDARD',1,unixepoch()),
  ('et-supplier-advance','supplier','دفعة مقدمة لمورد','SUPPLIERS','PURCHASING','STANDARD',1,unixepoch()),
  ('et-employee-advance','employee','سلفة موظف','EMPLOYEES','HR','STANDARD',1,unixepoch()),
  ('et-employee-custody','employee','عهدة مالية','EMPLOYEES','HR','STANDARD',1,unixepoch()),
  ('et-employee-entitlement','employee','استحقاق أو تعويض موظف','EMPLOYEES','HR','STANDARD',1,unixepoch()),
  ('et-gov-payment','government','سداد حكومي','GOVERNMENT','FINANCE','STANDARD',1,unixepoch()),
  ('et-ops-maintenance','operations','مصروف صيانة','MAINTENANCE_OPERATIONS','BRANCH','STANDARD',1,unixepoch()),
  ('et-ops-general','operations','مصروف تشغيلي عام','MAINTENANCE_OPERATIONS','BRANCH','STANDARD',1,unixepoch()),
  ('et-marketing-influencer','marketing','سداد مشهور أو صانع محتوى','MARKETING','MARKETING','STANDARD',1,unixepoch()),
  ('et-marketing-print','marketing','طباعة ملصقات ومواد دعائية','MARKETING','MARKETING','STANDARD',1,unixepoch()),
  ('et-marketing-campaign','marketing','حملة أو عمل دعائي','MARKETING','MARKETING','STANDARD',1,unixepoch()),
  ('et-it-hardware','it','أجهزة ومعدات تقنية','TECHNOLOGY','IT','STANDARD',1,unixepoch()),
  ('et-it-software','it','برامج وتراخيص','TECHNOLOGY','IT','STANDARD',1,unixepoch()),
  ('et-it-subscription','it','اشتراك تقني أو سحابي','TECHNOLOGY','IT','STANDARD',1,unixepoch()),
  ('et-it-network','it','شبكات واتصالات وأمن سيبراني','TECHNOLOGY','IT','STANDARD',1,unixepoch()),
  ('et-it-maintenance','it','صيانة ودعم تقني','TECHNOLOGY','IT','STANDARD',1,unixepoch()),
  ('et-it-hosting','it','استضافة ونطاقات وخدمات تقنية','TECHNOLOGY','IT','STANDARD',1,unixepoch());
