CREATE TABLE `marketing_agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_by` text NOT NULL,
	`mode` text NOT NULL,
	`objective` text NOT NULL,
	`status` text NOT NULL,
	`selected_template_id` text NOT NULL,
	`proposal_json` text NOT NULL,
	`result_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agent_runs_workspace_created` ON `marketing_agent_runs` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `marketing_agent_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`position` integer NOT NULL,
	`tool` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`state` text NOT NULL,
	`output_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agent_steps_run_position` ON `marketing_agent_steps` (`run_id`,`position`);