CREATE TABLE `code_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`file_path` text NOT NULL,
	`symbol_name` text NOT NULL,
	`symbol_type` text NOT NULL,
	`inputs` text,
	`outputs` text,
	`start_line` integer,
	`end_line` integer,
	`dependencies` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY (`file_path`) REFERENCES `code_index`(`file_path`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_code_chunks_file_path` ON `code_chunks` (`file_path`);--> statement-breakpoint
CREATE TABLE `code_dependencies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_chunk_id` text,
	`target_chunk_id` text,
	`dependency_type` text NOT NULL,
	`metadata` text,
	FOREIGN KEY (`source_chunk_id`) REFERENCES `code_chunks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_chunk_id`) REFERENCES `code_chunks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_code_deps_source` ON `code_dependencies` (`source_chunk_id`);--> statement-breakpoint
CREATE INDEX `idx_code_deps_target` ON `code_dependencies` (`target_chunk_id`);--> statement-breakpoint
CREATE TABLE `code_index` (
	`file_path` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`exports` text,
	`inputs` text,
	`outputs` text,
	`libraries` text,
	`category` text,
	`tags` text,
	`complexity` text,
	`lines_count` integer,
	`updated_at` integer DEFAULT (strftime('%s', 'now'))
);
--> statement-breakpoint
CREATE TABLE `failures` (
	`id` text PRIMARY KEY NOT NULL,
	`project_hash` text NOT NULL,
	`model_id` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`context` text,
	`error_message` text,
	`stack_trace` text,
	`resolved` integer DEFAULT false,
	`solution` text,
	`prosthetic_generated` integer DEFAULT false,
	`timestamp` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_failures_project_hash` ON `failures` (`project_hash`);--> statement-breakpoint
CREATE INDEX `idx_failures_model_id` ON `failures` (`model_id`);--> statement-breakpoint
CREATE INDEX `idx_failures_category` ON `failures` (`category`);--> statement-breakpoint
CREATE INDEX `idx_failures_resolved` ON `failures` (`resolved`);--> statement-breakpoint
CREATE TABLE `prosthetics` (
	`id` text PRIMARY KEY NOT NULL,
	`project_hash` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`prompt` text NOT NULL,
	`model_pair` text,
	`tags` text DEFAULT '[]',
	`effectiveness` integer,
	`applications_count` integer DEFAULT 0,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_prosthetics_project_hash` ON `prosthetics` (`project_hash`);--> statement-breakpoint
CREATE INDEX `idx_prosthetics_type` ON `prosthetics` (`type`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`project_hash` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`main_architect` text NOT NULL,
	`executor` text,
	`specialists` text DEFAULT '[]',
	`is_active` integer DEFAULT false,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now'))
);
--> statement-breakpoint
CREATE INDEX `idx_teams_project_hash` ON `teams` (`project_hash`);--> statement-breakpoint
CREATE INDEX `idx_teams_active` ON `teams` (`is_active`);--> statement-breakpoint
CREATE TABLE `test_results` (
	`id` text PRIMARY KEY NOT NULL,
	`project_hash` text NOT NULL,
	`model_id` text NOT NULL,
	`test_type` text NOT NULL,
	`test_name` text,
	`score` integer,
	`passed` integer,
	`results` text,
	`latency_ms` integer,
	`tokens_used` integer,
	`timestamp` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_test_results_project_hash` ON `test_results` (`project_hash`);--> statement-breakpoint
CREATE INDEX `idx_test_results_model_id` ON `test_results` (`model_id`);--> statement-breakpoint
CREATE INDEX `idx_test_results_test_type` ON `test_results` (`test_type`);--> statement-breakpoint
CREATE INDEX `idx_test_results_timestamp` ON `test_results` (`timestamp`);