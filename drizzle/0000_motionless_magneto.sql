CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`state` text NOT NULL,
	`submitter_id` text NOT NULL,
	`reviewer_id` text,
	`comment` text,
	`created_at` text NOT NULL,
	`decided_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_approvals_state_created` ON `approvals` (`state`,`created_at`);--> statement-breakpoint
CREATE TABLE `audiences` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`rules_json` text NOT NULL,
	`size` integer NOT NULL,
	`excluded` integer NOT NULL,
	`destinations_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_workspace_created` ON `audit_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `brand_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`website` text NOT NULL,
	`description` text NOT NULL,
	`value_proposition` text NOT NULL,
	`audiences_json` text NOT NULL,
	`voice_json` text NOT NULL,
	`colors_json` text NOT NULL,
	`prohibited_claims_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`objective` text NOT NULL,
	`audience` text NOT NULL,
	`offer` text,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`state` text NOT NULL,
	`channels_json` text NOT NULL,
	`plan_json` text NOT NULL,
	`owner_id` text NOT NULL,
	`progress` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_campaigns_workspace_state` ON `campaigns` (`workspace_id`,`state`);--> statement-breakpoint
CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`definition_id` text NOT NULL,
	`account_name` text NOT NULL,
	`state` text NOT NULL,
	`capabilities_json` text NOT NULL,
	`last_activity` text NOT NULL,
	`last_error` text,
	`success_rate` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_connections_workspace_state` ON `connections` (`workspace_id`,`state`);--> statement-breakpoint
CREATE TABLE `content_items` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`channel` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`state` text NOT NULL,
	`scheduled_at` text,
	`version` integer NOT NULL,
	`external_id` text,
	`metrics_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_content_campaign_state` ON `content_items` (`campaign_id`,`state`);--> statement-breakpoint
CREATE INDEX `idx_content_schedule` ON `content_items` (`scheduled_at`);--> statement-breakpoint
CREATE TABLE `content_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`version` integer NOT NULL,
	`body` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_content_version_unique` ON `content_versions` (`content_id`,`version`);--> statement-breakpoint
CREATE TABLE `integration_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`direction` text NOT NULL,
	`auth_type` text NOT NULL,
	`capabilities_json` text NOT NULL,
	`status` text NOT NULL,
	`icon_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_integration_definition_slug` ON `integration_definitions` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_integration_definition_category` ON `integration_definitions` (`category`);--> statement-breakpoint
CREATE TABLE `learning_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`label` text NOT NULL,
	`value` text NOT NULL,
	`evidence_count` integer NOT NULL,
	`explicit` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`object_key` text,
	`tags_json` text NOT NULL,
	`approved_for_ai` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_membership_workspace_user` ON `memberships` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `metric_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`date` text NOT NULL,
	`impressions` integer NOT NULL,
	`engagement` integer NOT NULL,
	`clicks` integer NOT NULL,
	`leads` integer NOT NULL,
	`spend` integer NOT NULL,
	`revenue` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_metrics_workspace_date` ON `metric_snapshots` (`workspace_id`,`date`);--> statement-breakpoint
CREATE TABLE `operation_ledger` (
	`idempotency_key` text PRIMARY KEY NOT NULL,
	`operation` text NOT NULL,
	`external_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `paid_ad_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`objective` text NOT NULL,
	`state` text NOT NULL,
	`budget` integer NOT NULL,
	`spend` integer NOT NULL,
	`results` integer NOT NULL,
	`date_range` text NOT NULL,
	`creative_json` text NOT NULL,
	`external_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_paid_ads_workspace_state` ON `paid_ad_campaigns` (`workspace_id`,`state`);--> statement-breakpoint
CREATE TABLE `performance_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`evidence` text NOT NULL,
	`confidence` integer NOT NULL,
	`expected_effect` text NOT NULL,
	`action` text NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_materials` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`source_url` text,
	`extracted_text` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`destination` text NOT NULL,
	`operation` text NOT NULL,
	`schedule` text NOT NULL,
	`state` text NOT NULL,
	`consent_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`sync_id` text NOT NULL,
	`state` text NOT NULL,
	`queried` integer NOT NULL,
	`accepted` integer NOT NULL,
	`rejected` integer NOT NULL,
	`duration` text NOT NULL,
	`error` text,
	`started_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sync_runs_sync_started` ON `sync_runs` (`sync_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`initials` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`timezone` text NOT NULL,
	`currency` text NOT NULL,
	`approval_mode` integer DEFAULT true NOT NULL
);
