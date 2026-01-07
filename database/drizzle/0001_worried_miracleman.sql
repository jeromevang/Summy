CREATE TABLE `compression_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`claude_session_id` text,
	`transcript_hash` text NOT NULL,
	`uncompressed_data` text NOT NULL,
	`compressed_data` text,
	`compression_enabled` integer DEFAULT true,
	`compression_mode` text DEFAULT 'conservative',
	`llm_provider` text DEFAULT 'lmstudio',
	`use_rag` integer DEFAULT false,
	`decisions` text,
	`stats` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `compression_sessions_claude_session_id_unique` ON `compression_sessions` (`claude_session_id`);--> statement-breakpoint
CREATE INDEX `idx_compression_sessions_claude_id` ON `compression_sessions` (`claude_session_id`);--> statement-breakpoint
CREATE INDEX `idx_compression_sessions_enabled` ON `compression_sessions` (`compression_enabled`);--> statement-breakpoint
CREATE TABLE `compression_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`turn_number` integer NOT NULL,
	`message_count` integer NOT NULL,
	`uncompressed_snapshot` text NOT NULL,
	`compressed_snapshot` text NOT NULL,
	`decisions` text,
	`stats` text,
	`trigger_reason` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `compression_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_compression_turns_session` ON `compression_turns` (`session_id`,`turn_number`);--> statement-breakpoint
CREATE INDEX `idx_compression_turns_created` ON `compression_turns` (`created_at`);