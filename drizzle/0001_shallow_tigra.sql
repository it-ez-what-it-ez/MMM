CREATE TABLE `campaign_template_uses` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`template_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`variables_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_campaign_template_uses_workspace_created` ON `campaign_template_uses` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `campaign_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`occasion` text NOT NULL,
	`badge` text NOT NULL,
	`featured` integer NOT NULL,
	`duration_days` integer NOT NULL,
	`channels_json` text NOT NULL,
	`audience` text NOT NULL,
	`objective` text NOT NULL,
	`offer` text NOT NULL,
	`variables_json` text NOT NULL,
	`assets_json` text NOT NULL,
	`plan_json` text NOT NULL,
	`recommended_budget` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_campaign_templates_slug` ON `campaign_templates` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_campaign_templates_category_featured` ON `campaign_templates` (`category`,`featured`);