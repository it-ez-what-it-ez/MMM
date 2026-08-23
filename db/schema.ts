import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  timezone: text("timezone").notNull(),
  currency: text("currency").notNull(),
  approvalMode: integer("approval_mode", { mode: "boolean" })
    .notNull()
    .default(true),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  initials: text("initials").notNull(),
});

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
  },
  (table) => [
    uniqueIndex("idx_membership_workspace_user").on(
      table.workspaceId,
      table.userId,
    ),
  ],
);

export const brandProfiles = sqliteTable("brand_profiles", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  website: text("website").notNull(),
  description: text("description").notNull(),
  valueProposition: text("value_proposition").notNull(),
  audiencesJson: text("audiences_json").notNull(),
  voiceJson: text("voice_json").notNull(),
  colorsJson: text("colors_json").notNull(),
  prohibitedClaimsJson: text("prohibited_claims_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const integrationDefinitions = sqliteTable(
  "integration_definitions",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    direction: text("direction").notNull(),
    authType: text("auth_type").notNull(),
    capabilitiesJson: text("capabilities_json").notNull(),
    status: text("status").notNull(),
    iconKey: text("icon_key").notNull(),
  },
  (table) => [
    uniqueIndex("idx_integration_definition_slug").on(table.slug),
    index("idx_integration_definition_category").on(table.category),
  ],
);

export const connections = sqliteTable(
  "connections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    definitionId: text("definition_id").notNull(),
    accountName: text("account_name").notNull(),
    state: text("state").notNull(),
    capabilitiesJson: text("capabilities_json").notNull(),
    lastActivity: text("last_activity").notNull(),
    lastError: text("last_error"),
    successRate: integer("success_rate").notNull(),
  },
  (table) => [
    index("idx_connections_workspace_state").on(table.workspaceId, table.state),
  ],
);

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    objective: text("objective").notNull(),
    audience: text("audience").notNull(),
    offer: text("offer"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    state: text("state").notNull(),
    channelsJson: text("channels_json").notNull(),
    planJson: text("plan_json").notNull(),
    ownerId: text("owner_id").notNull(),
    progress: integer("progress").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_campaigns_workspace_state").on(table.workspaceId, table.state),
  ],
);

export const campaignTemplates = sqliteTable(
  "campaign_templates",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    occasion: text("occasion").notNull(),
    badge: text("badge").notNull(),
    featured: integer("featured", { mode: "boolean" }).notNull(),
    durationDays: integer("duration_days").notNull(),
    channelsJson: text("channels_json").notNull(),
    audience: text("audience").notNull(),
    objective: text("objective").notNull(),
    offer: text("offer").notNull(),
    variablesJson: text("variables_json").notNull(),
    assetsJson: text("assets_json").notNull(),
    planJson: text("plan_json").notNull(),
    recommendedBudget: integer("recommended_budget").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_campaign_templates_slug").on(table.slug),
    index("idx_campaign_templates_category_featured").on(
      table.category,
      table.featured,
    ),
  ],
);

export const campaignTemplateUses = sqliteTable(
  "campaign_template_uses",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    templateId: text("template_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    variablesJson: text("variables_json").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_campaign_template_uses_workspace_created").on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const contentItems = sqliteTable(
  "content_items",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull(),
    channel: text("channel").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    state: text("state").notNull(),
    scheduledAt: text("scheduled_at"),
    version: integer("version").notNull(),
    externalId: text("external_id"),
    metricsJson: text("metrics_json").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_content_campaign_state").on(table.campaignId, table.state),
    index("idx_content_schedule").on(table.scheduledAt),
  ],
);

export const contentVersions = sqliteTable(
  "content_versions",
  {
    id: text("id").primaryKey(),
    contentId: text("content_id").notNull(),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    reason: text("reason").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_content_version_unique").on(
      table.contentId,
      table.version,
    ),
  ],
);

export const approvals = sqliteTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    contentId: text("content_id").notNull(),
    state: text("state").notNull(),
    submitterId: text("submitter_id").notNull(),
    reviewerId: text("reviewer_id"),
    comment: text("comment"),
    createdAt: text("created_at").notNull(),
    decidedAt: text("decided_at"),
  },
  (table) => [
    index("idx_approvals_state_created").on(table.state, table.createdAt),
  ],
);

export const audiences = sqliteTable("audiences", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  rulesJson: text("rules_json").notNull(),
  size: integer("size").notNull(),
  excluded: integer("excluded").notNull(),
  destinationsJson: text("destinations_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const syncDefinitions = sqliteTable("sync_definitions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  source: text("source").notNull(),
  destination: text("destination").notNull(),
  operation: text("operation").notNull(),
  schedule: text("schedule").notNull(),
  state: text("state").notNull(),
  consentJson: text("consent_json").notNull(),
});

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: text("id").primaryKey(),
    syncId: text("sync_id").notNull(),
    state: text("state").notNull(),
    queried: integer("queried").notNull(),
    accepted: integer("accepted").notNull(),
    rejected: integer("rejected").notNull(),
    duration: text("duration").notNull(),
    error: text("error"),
    startedAt: text("started_at").notNull(),
  },
  (table) => [
    index("idx_sync_runs_sync_started").on(table.syncId, table.startedAt),
  ],
);

export const paidAdCampaigns = sqliteTable(
  "paid_ad_campaigns",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    platform: text("platform").notNull(),
    objective: text("objective").notNull(),
    state: text("state").notNull(),
    budget: integer("budget").notNull(),
    spend: integer("spend").notNull(),
    results: integer("results").notNull(),
    dateRange: text("date_range").notNull(),
    creativeJson: text("creative_json").notNull(),
    externalId: text("external_id").notNull(),
  },
  (table) => [
    index("idx_paid_ads_workspace_state").on(table.workspaceId, table.state),
  ],
);

export const performanceInsights = sqliteTable("performance_insights", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  title: text("title").notNull(),
  evidence: text("evidence").notNull(),
  confidence: integer("confidence").notNull(),
  expectedEffect: text("expected_effect").notNull(),
  action: text("action").notNull(),
  kind: text("kind").notNull(),
});

export const metricSnapshots = sqliteTable(
  "metric_snapshots",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    date: text("date").notNull(),
    impressions: integer("impressions").notNull(),
    engagement: integer("engagement").notNull(),
    clicks: integer("clicks").notNull(),
    leads: integer("leads").notNull(),
    spend: integer("spend").notNull(),
    revenue: integer("revenue").notNull(),
  },
  (table) => [
    index("idx_metrics_workspace_date").on(table.workspaceId, table.date),
  ],
);

export const mediaAssets = sqliteTable("media_assets", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  objectKey: text("object_key"),
  tagsJson: text("tags_json").notNull(),
  approvedForAi: integer("approved_for_ai", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    price: text("price").notNull(),
    currency: text("currency").notNull(),
    productUrl: text("product_url").notNull(),
    mediaId: text("media_id"),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_products_workspace_status").on(table.workspaceId, table.status),
  ],
);

export const sourceMaterials = sqliteTable("source_materials", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  sourceUrl: text("source_url"),
  extractedText: text("extracted_text").notNull(),
  createdAt: text("created_at").notNull(),
});

export const learningPreferences = sqliteTable("learning_preferences", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  label: text("label").notNull(),
  value: text("value").notNull(),
  evidenceCount: integer("evidence_count").notNull(),
  explicit: integer("explicit", { mode: "boolean" }).notNull(),
});

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    detail: text("detail").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_audit_workspace_created").on(table.workspaceId, table.createdAt),
  ],
);

export const operationLedger = sqliteTable("operation_ledger", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  operation: text("operation").notNull(),
  externalId: text("external_id").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
});

export const marketingAgentRuns = sqliteTable(
  "marketing_agent_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    createdBy: text("created_by").notNull(),
    mode: text("mode").notNull(),
    objective: text("objective").notNull(),
    status: text("status").notNull(),
    selectedTemplateId: text("selected_template_id").notNull(),
    proposalJson: text("proposal_json").notNull(),
    resultJson: text("result_json"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_agent_runs_workspace_created").on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

export const marketingAgentSteps = sqliteTable(
  "marketing_agent_steps",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    position: integer("position").notNull(),
    tool: text("tool").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    state: text("state").notNull(),
    outputJson: text("output_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_agent_steps_run_position").on(
      table.runId,
      table.position,
    ),
  ],
);
