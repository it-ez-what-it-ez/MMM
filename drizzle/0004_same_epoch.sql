CREATE TABLE `oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`definition_id` text NOT NULL,
	`user_id` text NOT NULL,
	`return_to` text NOT NULL,
	`code_verifier` text,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_states_expires` ON `oauth_states` (`expires_at`);--> statement-breakpoint
CREATE TABLE `provider_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`definition_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`encrypted_access_token` text NOT NULL,
	`encrypted_refresh_token` text,
	`token_expires_at` text,
	`provider_account_id` text,
	`provider_account_name` text,
	`metadata_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_provider_credentials_workspace_definition` ON `provider_credentials` (`workspace_id`,`definition_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_provider_credentials_connection` ON `provider_credentials` (`connection_id`);