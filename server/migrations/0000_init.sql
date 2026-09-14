CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer,
	`metadata` text,
	`ip_address` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_logs_user_idx` ON `audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `colleges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `colleges_name_unique` ON `colleges` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `colleges_code_unique` ON `colleges` (`code`);--> statement-breakpoint
CREATE TABLE `departments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`college_id` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`college_id`) REFERENCES `colleges`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_code_unique` ON `departments` (`code`);--> statement-breakpoint
CREATE INDEX `departments_college_idx` ON `departments` (`college_id`);--> statement-breakpoint
CREATE TABLE `pay_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer NOT NULL,
	`pay_date` integer NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pay_periods_range_idx` ON `pay_periods` (`type`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `pay_periods_status_idx` ON `pay_periods` (`status`);--> statement-breakpoint
CREATE TABLE `pay_stubs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`pay_period_id` integer NOT NULL,
	`regular_minutes` integer DEFAULT 0 NOT NULL,
	`overtime_minutes` integer DEFAULT 0 NOT NULL,
	`gross_pay_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`generated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pay_period_id`) REFERENCES `pay_periods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pay_stubs_user_period_idx` ON `pay_stubs` (`user_id`,`pay_period_id`);--> statement-breakpoint
CREATE INDEX `pay_stubs_period_idx` ON `pay_stubs` (`pay_period_id`);--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `refresh_tokens_user_idx` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_hash_idx` ON `refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `report_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`requested_by_id` integer NOT NULL,
	`scope` text NOT NULL,
	`scope_id` integer,
	`pay_period_id` integer,
	`format` text DEFAULT 'csv' NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `report_runs_requested_by_idx` ON `report_runs` (`requested_by_id`);--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`clock_in` integer NOT NULL,
	`clock_out` integer,
	`source` text DEFAULT 'WEB' NOT NULL,
	`notes` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`edited_by_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`edited_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `time_entries_user_clockin_idx` ON `time_entries` (`user_id`,`clock_in`);--> statement-breakpoint
CREATE INDEX `time_entries_status_idx` ON `time_entries` (`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`role` text DEFAULT 'STUDENT' NOT NULL,
	`pay_type` text DEFAULT 'BIWEEKLY' NOT NULL,
	`hourly_rate_cents` integer,
	`annual_salary_cents` integer,
	`department_id` integer,
	`supervisor_id` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`must_reset_pw` integer DEFAULT true NOT NULL,
	`last_login_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_department_idx` ON `users` (`department_id`);--> statement-breakpoint
CREATE INDEX `users_supervisor_idx` ON `users` (`supervisor_id`);