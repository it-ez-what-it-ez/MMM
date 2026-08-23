import { env } from "cloudflare:workers";
import type { AppState, Role } from "@/lib/types";
import {
  campaignTemplateSchema,
  seededCampaignTemplates,
} from "@/lib/campaign-templates";

type Row = Record<string, unknown>;

function db() {
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) throw new Error("GrowthOS database is unavailable.");
  return binding;
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL, timezone TEXT NOT NULL, currency TEXT NOT NULL, approval_mode INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, initials TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS memberships (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_workspace_user ON memberships(workspace_id, user_id)`,
  `CREATE TABLE IF NOT EXISTS brand_profiles (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, website TEXT NOT NULL, description TEXT NOT NULL, value_proposition TEXT NOT NULL, audiences_json TEXT NOT NULL, voice_json TEXT NOT NULL, colors_json TEXT NOT NULL, prohibited_claims_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS integration_definitions (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, direction TEXT NOT NULL, auth_type TEXT NOT NULL, capabilities_json TEXT NOT NULL, status TEXT NOT NULL, icon_key TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_definition_slug ON integration_definitions(slug)`,
  `CREATE INDEX IF NOT EXISTS idx_integration_definition_category ON integration_definitions(category)`,
  `CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, definition_id TEXT NOT NULL, account_name TEXT NOT NULL, state TEXT NOT NULL, capabilities_json TEXT NOT NULL, last_activity TEXT NOT NULL, last_error TEXT, success_rate INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_connections_workspace_state ON connections(workspace_id, state)`,
  `CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, objective TEXT NOT NULL, audience TEXT NOT NULL, offer TEXT, start_date TEXT NOT NULL, end_date TEXT NOT NULL, state TEXT NOT NULL, channels_json TEXT NOT NULL, plan_json TEXT NOT NULL, owner_id TEXT NOT NULL, progress INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_campaigns_workspace_state ON campaigns(workspace_id, state)`,
  `CREATE TABLE IF NOT EXISTS campaign_templates (id TEXT PRIMARY KEY, slug TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, occasion TEXT NOT NULL, badge TEXT NOT NULL, featured INTEGER NOT NULL, duration_days INTEGER NOT NULL, channels_json TEXT NOT NULL, audience TEXT NOT NULL, objective TEXT NOT NULL, offer TEXT NOT NULL, variables_json TEXT NOT NULL, assets_json TEXT NOT NULL, plan_json TEXT NOT NULL, recommended_budget INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_templates_slug ON campaign_templates(slug)`,
  `CREATE INDEX IF NOT EXISTS idx_campaign_templates_category_featured ON campaign_templates(category, featured)`,
  `CREATE TABLE IF NOT EXISTS campaign_template_uses (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, template_id TEXT NOT NULL, campaign_id TEXT NOT NULL, variables_json TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_campaign_template_uses_workspace_created ON campaign_template_uses(workspace_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS content_items (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, channel TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL, scheduled_at TEXT, version INTEGER NOT NULL, external_id TEXT, metrics_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_content_campaign_state ON content_items(campaign_id, state)`,
  `CREATE INDEX IF NOT EXISTS idx_content_schedule ON content_items(scheduled_at)`,
  `CREATE TABLE IF NOT EXISTS content_versions (id TEXT PRIMARY KEY, content_id TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_content_version_unique ON content_versions(content_id, version)`,
  `CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, content_id TEXT NOT NULL, state TEXT NOT NULL, submitter_id TEXT NOT NULL, reviewer_id TEXT, comment TEXT, created_at TEXT NOT NULL, decided_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_approvals_state_created ON approvals(state, created_at)`,
  `CREATE TABLE IF NOT EXISTS audiences (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, rules_json TEXT NOT NULL, size INTEGER NOT NULL, excluded INTEGER NOT NULL, destinations_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sync_definitions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, source TEXT NOT NULL, destination TEXT NOT NULL, operation TEXT NOT NULL, schedule TEXT NOT NULL, state TEXT NOT NULL, consent_json TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sync_runs (id TEXT PRIMARY KEY, sync_id TEXT NOT NULL, state TEXT NOT NULL, queried INTEGER NOT NULL, accepted INTEGER NOT NULL, rejected INTEGER NOT NULL, duration TEXT NOT NULL, error TEXT, started_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_runs_sync_started ON sync_runs(sync_id, started_at)`,
  `CREATE TABLE IF NOT EXISTS paid_ad_campaigns (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, platform TEXT NOT NULL, objective TEXT NOT NULL, state TEXT NOT NULL, budget INTEGER NOT NULL, spend INTEGER NOT NULL, results INTEGER NOT NULL, date_range TEXT NOT NULL, creative_json TEXT NOT NULL, external_id TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_paid_ads_workspace_state ON paid_ad_campaigns(workspace_id, state)`,
  `CREATE TABLE IF NOT EXISTS performance_insights (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT NOT NULL, evidence TEXT NOT NULL, confidence INTEGER NOT NULL, expected_effect TEXT NOT NULL, action TEXT NOT NULL, kind TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS metric_snapshots (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, date TEXT NOT NULL, impressions INTEGER NOT NULL, engagement INTEGER NOT NULL, clicks INTEGER NOT NULL, leads INTEGER NOT NULL, spend INTEGER NOT NULL, revenue INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_metrics_workspace_date ON metric_snapshots(workspace_id, date)`,
  `CREATE TABLE IF NOT EXISTS media_assets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, object_key TEXT, tags_json TEXT NOT NULL, approved_for_ai INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, price TEXT NOT NULL, currency TEXT NOT NULL, product_url TEXT NOT NULL, media_id TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_products_workspace_status ON products(workspace_id, status)`,
  `CREATE TABLE IF NOT EXISTS source_materials (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, source_url TEXT, extracted_text TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS learning_preferences (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, label TEXT NOT NULL, value TEXT NOT NULL, evidence_count INTEGER NOT NULL, explicit INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_workspace_created ON audit_events(workspace_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS operation_ledger (idempotency_key TEXT PRIMARY KEY, operation TEXT NOT NULL, external_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS marketing_agent_runs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, created_by TEXT NOT NULL, mode TEXT NOT NULL, objective TEXT NOT NULL, status TEXT NOT NULL, selected_template_id TEXT NOT NULL, proposal_json TEXT NOT NULL, result_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_created ON marketing_agent_runs(workspace_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS marketing_agent_steps (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, position INTEGER NOT NULL, tool TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, state TEXT NOT NULL, output_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_steps_run_position ON marketing_agent_steps(run_id, position)`,
];

const json = JSON.stringify;
const ts = (day: number, hour = 14) =>
  `2026-08-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:20:00.000Z`;

async function insert(table: string, fields: string[], values: unknown[]) {
  const placeholders = fields.map(() => "?").join(",");
  await db()
    .prepare(
      `INSERT INTO ${table} (${fields.join(",")}) VALUES (${placeholders})`,
    )
    .bind(...values)
    .run();
}

async function seedCampaignTemplates() {
  const statement = db().prepare(
    "INSERT OR REPLACE INTO campaign_templates (id, slug, name, description, category, occasion, badge, featured, duration_days, channels_json, audience, objective, offer, variables_json, assets_json, plan_json, recommended_budget, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  await db().batch(
    seededCampaignTemplates.map((template) =>
      statement.bind(
        template.id,
        template.slug,
        template.name,
        template.description,
        template.category,
        template.occasion,
        template.badge,
        template.featured ? 1 : 0,
        template.durationDays,
        json(template.channels),
        template.audience,
        template.objective,
        template.offer,
        json(template.variables),
        json(template.assets),
        json({
          topics: template.topics,
          successMetrics: template.successMetrics,
        }),
        template.recommendedBudget,
        template.updatedAt,
      ),
    ),
  );
}

async function seedChatGPTAdsDefinition() {
  await db().batch([
    db().prepare(
      "INSERT OR IGNORE INTO integration_definitions (id, name, slug, description, category, direction, auth_type, capabilities_json, status, icon_key) VALUES ('int-chatgpt-ads', 'ChatGPT Ads', 'chatgpt-ads', 'Create paused chat card campaigns and read their delivery status.', 'Advertising', 'DESTINATION', 'API_KEY', '[\"CREATE_AD_CAMPAIGN\",\"READ_METRICS\"]', 'AVAILABLE', 'chatgpt-ads')",
    ),
    db().prepare(
      "INSERT OR IGNORE INTO integration_definitions (id, name, slug, description, category, direction, auth_type, capabilities_json, status, icon_key) VALUES ('int-reddit-ads', 'Reddit Ads', 'reddit-ads', 'Create paused sponsored-post campaigns and read their delivery status.', 'Advertising', 'DESTINATION', 'OAUTH', '[\"CREATE_AD_CAMPAIGN\",\"READ_METRICS\"]', 'AVAILABLE', 'reddit-ads')",
    ),
  ]);
}

async function seedProducts() {
  const createdAt = "2026-08-20T14:00:00.000Z";
  const statement = db().prepare(
    "INSERT OR IGNORE INTO products (id, workspace_id, name, description, price, currency, product_url, media_id, status, created_at, updated_at) VALUES (?, 'ws-northstar', ?, ?, ?, 'CAD', ?, ?, 'ACTIVE', ?, ?)",
  );
  await db().batch([
    statement.bind(
      "product-growth-signals",
      "Growth Signals",
      "A focused analytics workspace that turns customer behavior into the next best marketing action.",
      "$49 / month",
      "https://northstar.example/growth-signals",
      "media-1",
      createdAt,
      createdAt,
    ),
    statement.bind(
      "product-activation-benchmark",
      "2026 Activation Benchmark",
      "A practical benchmark report for SaaS teams improving activation and time-to-value.",
      "Free report",
      "https://northstar.example/activation-benchmark",
      "media-2",
      createdAt,
      createdAt,
    ),
  ]);
}

export async function initializeDatabase() {
  await db().batch(
    schemaStatements.map((statement) => db().prepare(statement)),
  );
  await seedCampaignTemplates();
  await seedProducts();
  await seedChatGPTAdsDefinition();
  const existing = await db()
    .prepare("SELECT id FROM workspaces LIMIT 1")
    .first();
  if (existing) return;

  await insert(
    "workspaces",
    ["id", "name", "slug", "timezone", "currency", "approval_mode"],
    [
      "ws-northstar",
      "Northstar Analytics",
      "northstar-analytics",
      "America/Toronto",
      "CAD",
      1,
    ],
  );
  const people = [
    ["user-owner", "Maya Chen", "maya@northstar.demo", "MC", "OWNER"],
    ["user-admin", "Noah Williams", "noah@northstar.demo", "NW", "ADMIN"],
    ["user-marketer", "Priya Shah", "priya@northstar.demo", "PS", "MARKETER"],
    ["user-reviewer", "Eli Morgan", "eli@northstar.demo", "EM", "REVIEWER"],
    ["user-viewer", "Sofia Kim", "sofia@northstar.demo", "SK", "VIEWER"],
  ];
  for (const [id, name, email, initials, role] of people) {
    await insert(
      "users",
      ["id", "name", "email", "initials"],
      [id, name, email, initials],
    );
    await insert(
      "memberships",
      ["id", "workspace_id", "user_id", "role"],
      [`membership-${id}`, "ws-northstar", id, role],
    );
  }
  await insert(
    "brand_profiles",
    [
      "id",
      "workspace_id",
      "name",
      "website",
      "description",
      "value_proposition",
      "audiences_json",
      "voice_json",
      "colors_json",
      "prohibited_claims_json",
      "updated_at",
    ],
    [
      "brand-northstar",
      "ws-northstar",
      "Northstar Analytics",
      "https://northstar.example",
      "A B2B SaaS analytics platform that helps growing teams turn product and revenue data into clear decisions.",
      "See the full customer journey, identify growth opportunities, and move from signal to action without a data team.",
      json([
        "SaaS founders",
        "Growth leaders",
        "Revenue operations",
        "Product marketers",
      ]),
      json({
        traits: ["Confident", "Clear", "Helpful"],
        tone: "Friendly expert",
        readingLevel: "Grade 8",
        emoji: "Rarely",
        use: ["clarity", "momentum", "signal"],
        avoid: ["revolutionary", "game-changing", "guaranteed"],
      }),
      json(["#0F766E", "#7357D8", "#0F172A", "#F7FAF9"]),
      json([
        "Guaranteed revenue growth",
        "Instant ROI",
        "Zero implementation effort",
      ]),
      ts(15, 13),
    ],
  );

  const definitions = [
    [
      "int-website",
      "Website",
      "website",
      "Capture forms, behavior, and first-party events.",
      "Customer data",
      "SOURCE",
      "API_KEY",
      ["READ_CUSTOMERS", "READ_CONTENT"],
      "AVAILABLE",
    ],
    [
      "int-csv",
      "CSV upload",
      "csv",
      "Import audiences and customer records securely.",
      "Storage",
      "SOURCE",
      "API_KEY",
      ["READ_CUSTOMERS"],
      "AVAILABLE",
    ],
    [
      "int-postgres",
      "PostgreSQL",
      "postgresql",
      "Query customer and product data from PostgreSQL.",
      "Databases",
      "SOURCE",
      "CONNECTION_STRING",
      ["READ_CUSTOMERS"],
      "AVAILABLE",
    ],
    [
      "int-snowflake",
      "Snowflake",
      "snowflake",
      "Activate governed warehouse data.",
      "Databases",
      "SOURCE",
      "SERVICE_ACCOUNT",
      ["READ_CUSTOMERS"],
      "AVAILABLE",
    ],
    [
      "int-bigquery",
      "BigQuery",
      "bigquery",
      "Connect analytics-ready data models.",
      "Databases",
      "SOURCE",
      "SERVICE_ACCOUNT",
      ["READ_CUSTOMERS", "READ_METRICS"],
      "AVAILABLE",
    ],
    [
      "int-stripe",
      "Stripe",
      "stripe",
      "Use purchase and subscription signals.",
      "Payments",
      "SOURCE",
      "API_KEY",
      ["READ_CUSTOMERS", "READ_METRICS"],
      "AVAILABLE",
    ],
    [
      "int-ga",
      "Google Analytics",
      "google-analytics",
      "Measure acquisition and conversion performance.",
      "Analytics",
      "SOURCE",
      "OAUTH",
      ["READ_METRICS"],
      "AVAILABLE",
    ],
    [
      "int-posthog",
      "PostHog",
      "posthog",
      "Use product events and funnels as marketing context.",
      "Analytics",
      "SOURCE",
      "API_KEY",
      ["READ_CUSTOMERS", "READ_METRICS"],
      "AVAILABLE",
    ],
    [
      "int-segment",
      "Segment",
      "segment",
      "Route first-party customer events.",
      "Customer data",
      "BOTH",
      "API_KEY",
      ["READ_CUSTOMERS", "UPLOAD_CONVERSION"],
      "AVAILABLE",
    ],
    [
      "int-meta",
      "Meta Ads",
      "meta-ads",
      "Build audiences and create paused campaigns.",
      "Advertising",
      "DESTINATION",
      "OAUTH",
      ["WRITE_AUDIENCE", "CREATE_AD_CAMPAIGN", "READ_METRICS"],
      "AVAILABLE",
    ],
    [
      "int-google-ads",
      "Google Ads",
      "google-ads",
      "Activate audiences, conversions, and campaigns.",
      "Advertising",
      "DESTINATION",
      "OAUTH",
      [
        "WRITE_AUDIENCE",
        "CREATE_AD_CAMPAIGN",
        "UPLOAD_CONVERSION",
        "READ_METRICS",
      ],
      "AVAILABLE",
    ],
    [
      "int-linkedin-ads",
      "LinkedIn Ads",
      "linkedin-ads",
      "Reach professional audiences with paid media.",
      "Advertising",
      "DESTINATION",
      "OAUTH",
      ["WRITE_AUDIENCE", "CREATE_AD_CAMPAIGN"],
      "BETA",
    ],
    [
      "int-tiktok",
      "TikTok Ads",
      "tiktok-ads",
      "Create and measure short-form ad campaigns.",
      "Advertising",
      "DESTINATION",
      "OAUTH",
      ["CREATE_AD_CAMPAIGN", "READ_METRICS"],
      "COMING_SOON",
    ],
    [
      "int-klaviyo",
      "Klaviyo",
      "klaviyo",
      "Create campaigns and update customer profiles.",
      "Email",
      "DESTINATION",
      "API_KEY",
      ["CREATE_EMAIL_CAMPAIGN", "READ_METRICS"],
      "AVAILABLE",
    ],
    [
      "int-mailchimp",
      "Mailchimp",
      "mailchimp",
      "Create email campaigns and audience segments.",
      "Email",
      "DESTINATION",
      "OAUTH",
      ["CREATE_EMAIL_CAMPAIGN"],
      "AVAILABLE",
    ],
    [
      "int-hubspot",
      "HubSpot",
      "hubspot",
      "Sync contacts and marketing activity.",
      "CRM",
      "BOTH",
      "OAUTH",
      ["READ_CUSTOMERS", "CREATE_EMAIL_CAMPAIGN"],
      "AVAILABLE",
    ],
    [
      "int-linkedin",
      "LinkedIn",
      "linkedin",
      "Publish organic content to company pages.",
      "Social publishing",
      "DESTINATION",
      "OAUTH",
      ["PUBLISH_ORGANIC_CONTENT", "READ_METRICS"],
      "AVAILABLE",
    ],
    [
      "int-instagram",
      "Instagram",
      "instagram",
      "Schedule and publish approved social content.",
      "Social publishing",
      "DESTINATION",
      "OAUTH",
      ["PUBLISH_ORGANIC_CONTENT", "READ_METRICS"],
      "AVAILABLE",
    ],
    [
      "int-wordpress",
      "WordPress",
      "wordpress",
      "Publish articles to your content hub.",
      "Content management",
      "DESTINATION",
      "API_KEY",
      ["PUBLISH_ORGANIC_CONTENT"],
      "AVAILABLE",
    ],
    [
      "int-slack",
      "Slack",
      "slack",
      "Send alerts and approval notifications.",
      "Messaging",
      "DESTINATION",
      "OAUTH",
      ["SEND_NOTIFICATION"],
      "AVAILABLE",
    ],
    [
      "int-webhook",
      "HTTP webhook",
      "webhook",
      "Trigger custom downstream workflows.",
      "Webhooks",
      "DESTINATION",
      "API_KEY",
      ["SEND_NOTIFICATION", "UPLOAD_CONVERSION"],
      "AVAILABLE",
    ],
  ];
  for (const [
    id,
    name,
    slug,
    description,
    category,
    direction,
    authType,
    capabilities,
    status,
  ] of definitions) {
    await insert(
      "integration_definitions",
      [
        "id",
        "name",
        "slug",
        "description",
        "category",
        "direction",
        "auth_type",
        "capabilities_json",
        "status",
        "icon_key",
      ],
      [
        id,
        name,
        slug,
        description,
        category,
        direction,
        authType,
        json(capabilities),
        status,
        String(slug),
      ],
    );
  }
  const connections = [
    [
      "conn-ga",
      "int-ga",
      "Northstar GA4",
      "CONNECTED",
      ["READ_METRICS"],
      ts(15, 12),
      null,
      99,
    ],
    [
      "conn-meta",
      "int-meta",
      "Northstar Growth",
      "CONNECTED",
      ["WRITE_AUDIENCE", "CREATE_AD_CAMPAIGN", "READ_METRICS"],
      ts(15, 11),
      null,
      98,
    ],
    [
      "conn-linkedin",
      "int-linkedin",
      "Northstar Analytics",
      "CONNECTED",
      ["PUBLISH_ORGANIC_CONTENT", "READ_METRICS"],
      ts(15, 10),
      null,
      97,
    ],
    [
      "conn-klaviyo",
      "int-klaviyo",
      "Northstar Lifecycle",
      "DEGRADED",
      ["CREATE_EMAIL_CAMPAIGN", "READ_METRICS"],
      ts(14, 21),
      "Rate limit reached during metric import",
      91,
    ],
  ];
  for (const row of connections)
    await insert(
      "connections",
      [
        "id",
        "workspace_id",
        "definition_id",
        "account_name",
        "state",
        "capabilities_json",
        "last_activity",
        "last_error",
        "success_rate",
      ],
      [
        row[0],
        "ws-northstar",
        row[1],
        row[2],
        row[3],
        json(row[4]),
        row[5],
        row[6],
        row[7],
      ],
    );

  const campaigns = [
    [
      "camp-activation",
      "Analytics Activation Launch",
      "A coordinated product launch that turns reporting into a clear growth story.",
      "Increase demo bookings for the activation analytics release",
      "Growth leaders at SaaS companies with 20–250 employees",
      "30-minute growth signal audit",
      "2026-08-12",
      "2026-09-02",
      "LIVE",
      ["LinkedIn", "Email", "Meta Ads"],
      {
        topics: [
          "Signal to action",
          "Fewer reporting gaps",
          "Faster growth decisions",
        ],
        successMetrics: ["120 demo bookings", "3.5% CTR"],
        risks: ["Message may feel too technical"],
        assumptions: ["Analytics maturity is a buying trigger"],
      },
      72,
    ],
    [
      "camp-benchmark",
      "2026 SaaS Benchmarks",
      "Turn proprietary benchmark insights into an educational demand program.",
      "Build authority and generate qualified leads",
      "SaaS operators and founders",
      "Download the 2026 benchmark report",
      "2026-08-18",
      "2026-09-12",
      "AWAITING_APPROVAL",
      ["LinkedIn", "Email", "Google Ads"],
      {
        topics: [
          "Activation benchmarks",
          "Retention signals",
          "Efficient growth",
        ],
        successMetrics: ["800 report downloads", "80 MQLs"],
        risks: ["Benchmark claims need careful sourcing"],
        assumptions: ["Benchmark content will outperform feature content"],
      },
      46,
    ],
    [
      "camp-winback",
      "Trial Win-back",
      "Re-engage inactive trials with useful activation guidance.",
      "Convert dormant trials into product-qualified leads",
      "Trial users inactive for 14 days",
      "Personalized activation review",
      "2026-08-08",
      "2026-08-29",
      "SCHEDULED",
      ["Email", "Meta Ads"],
      {
        topics: ["Quick wins", "Activation gaps", "Proof of value"],
        successMetrics: ["12% reactivation", "25 demos"],
        risks: ["Over-contacting inactive users"],
        assumptions: ["Consent remains valid"],
      },
      61,
    ],
  ];
  for (const c of campaigns)
    await insert(
      "campaigns",
      [
        "id",
        "workspace_id",
        "title",
        "summary",
        "objective",
        "audience",
        "offer",
        "start_date",
        "end_date",
        "state",
        "channels_json",
        "plan_json",
        "owner_id",
        "progress",
        "created_at",
      ],
      [
        c[0],
        "ws-northstar",
        c[1],
        c[2],
        c[3],
        c[4],
        c[5],
        c[6],
        c[7],
        c[8],
        json(c[9]),
        json(c[10]),
        "user-marketer",
        c[11],
        ts(8),
      ],
    );

  const content = [
    [
      "content-1",
      "camp-activation",
      "LinkedIn",
      "Organic post",
      "The dashboard is not the decision",
      "Your dashboard tells you what happened. GrowthOS helps your team decide what to do next—using the signals already in your product and revenue data.",
      "PUBLISHED",
      ts(13, 15),
      2,
      "linkedin_post_84ed20",
      { impressions: 18640, clicks: 742, conversions: 31 },
    ],
    [
      "content-2",
      "camp-activation",
      "Email",
      "Campaign email",
      "Your clearest growth signal is already there",
      "Most SaaS teams do not need more dashboards. They need a clearer path from signal to action. See how Northstar turns customer behavior into next steps.",
      "PUBLISHED",
      ts(14, 13),
      1,
      "klaviyo_campaign_34ad8c",
      { impressions: 12280, clicks: 1150, conversions: 54 },
    ],
    [
      "content-3",
      "camp-activation",
      "Meta Ads",
      "Paid social",
      "Stop reporting. Start deciding.",
      "Find the growth signals hiding across product, revenue, and campaign data.",
      "APPROVED",
      ts(18, 16),
      3,
      null,
      { impressions: 0, clicks: 0, conversions: 0 },
    ],
    [
      "content-4",
      "camp-activation",
      "LinkedIn",
      "Carousel",
      "5 signals your growth dashboard misses",
      "A practical breakdown of the customer signals that indicate activation, expansion, and churn risk.",
      "SCHEDULED",
      ts(20, 15),
      1,
      null,
      { impressions: 0, clicks: 0, conversions: 0 },
    ],
    [
      "content-5",
      "camp-benchmark",
      "LinkedIn",
      "Organic post",
      "What efficient SaaS teams measure first",
      "The best growth teams do not track everything. They align around a small set of signals that reveal activation and retention early.",
      "AWAITING_APPROVAL",
      ts(21, 14),
      1,
      null,
      { impressions: 0, clicks: 0, conversions: 0 },
    ],
    [
      "content-6",
      "camp-benchmark",
      "Email",
      "Campaign email",
      "The 2026 activation benchmark report",
      "We analyzed the activation patterns that separate efficient SaaS teams from the rest. Get the practical benchmarks and see where your funnel stands.",
      "AWAITING_APPROVAL",
      ts(22, 13),
      2,
      null,
      { impressions: 0, clicks: 0, conversions: 0 },
    ],
    [
      "content-7",
      "camp-benchmark",
      "Google Ads",
      "Responsive search ad",
      "SaaS Activation Benchmarks",
      "Compare your activation metrics with efficient SaaS teams. Download the 2026 report.",
      "AWAITING_APPROVAL",
      ts(23, 15),
      1,
      null,
      { impressions: 0, clicks: 0, conversions: 0 },
    ],
    [
      "content-8",
      "camp-benchmark",
      "LinkedIn",
      "Document ad",
      "Benchmark your activation engine",
      "Eight pages of evidence, examples, and next steps for improving product activation.",
      "AWAITING_APPROVAL",
      ts(25, 15),
      1,
      null,
      { impressions: 0, clicks: 0, conversions: 0 },
    ],
    [
      "content-9",
      "camp-winback",
      "Email",
      "Lifecycle email",
      "Your Northstar workspace is ready when you are",
      "You already connected the signals. Take ten minutes to see where customers are getting stuck—and what to do next.",
      "SCHEDULED",
      ts(17, 14),
      2,
      null,
      { impressions: 0, clicks: 0, conversions: 0 },
    ],
    [
      "content-10",
      "camp-winback",
      "Meta Ads",
      "Retargeting ad",
      "Find your next growth move",
      "Return to Northstar and turn product activity into a focused action plan.",
      "APPROVED",
      ts(19, 17),
      1,
      null,
      { impressions: 0, clicks: 0, conversions: 0 },
    ],
    [
      "content-11",
      "camp-winback",
      "Email",
      "Lifecycle email",
      "A faster path to activation clarity",
      "Book a short activation review and leave with three practical improvements for your funnel.",
      "DRAFT",
      null,
      1,
      null,
      { impressions: 0, clicks: 0, conversions: 0 },
    ],
    [
      "content-12",
      "camp-activation",
      "Meta Ads",
      "Paid social",
      "One signal. One next move.",
      "Your customer data should tell the team what to do next—not create another reporting project.",
      "FAILED",
      ts(14, 16),
      1,
      null,
      { impressions: 0, clicks: 0, conversions: 0 },
    ],
  ];
  for (const c of content) {
    await insert(
      "content_items",
      [
        "id",
        "campaign_id",
        "channel",
        "type",
        "title",
        "body",
        "state",
        "scheduled_at",
        "version",
        "external_id",
        "metrics_json",
        "updated_at",
      ],
      [...c.slice(0, 10), json(c[10]), ts(15, 12)],
    );
    await insert(
      "content_versions",
      ["id", "content_id", "version", "body", "reason", "created_at"],
      [`version-${c[0]}-${c[8]}`, c[0], c[8], c[5], "Seeded content", ts(12)],
    );
  }
  for (const [i, contentId] of [
    "content-5",
    "content-6",
    "content-7",
    "content-8",
  ].entries())
    await insert(
      "approvals",
      ["id", "content_id", "state", "submitter_id", "created_at"],
      [
        `approval-${i + 1}`,
        contentId,
        "PENDING",
        "user-marketer",
        ts(15, 9 + i),
      ],
    );

  const audiences = [
    [
      "aud-trials",
      "Engaged trials",
      "Trial users showing recent product intent and valid channel consent.",
      [
        { field: "Lifecycle stage", operator: "is", value: "Trial" },
        { field: "Last active date", operator: "within", value: "14 days" },
        { field: "Email consent", operator: "is", value: "true" },
      ],
      3842,
      219,
      ["Klaviyo", "Meta Ads", "Google Ads"],
    ],
    [
      "aud-expansion",
      "Expansion-ready accounts",
      "Active customers with strong usage and high lead scores.",
      [
        { field: "Plan", operator: "is not", value: "Enterprise" },
        { field: "Lead score", operator: "greater than", value: "75" },
      ],
      1260,
      83,
      ["LinkedIn Ads", "HubSpot"],
    ],
  ];
  for (const a of audiences)
    await insert(
      "audiences",
      [
        "id",
        "workspace_id",
        "name",
        "description",
        "rules_json",
        "size",
        "excluded",
        "destinations_json",
        "updated_at",
      ],
      [
        a[0],
        "ws-northstar",
        a[1],
        a[2],
        json(a[3]),
        a[4],
        a[5],
        json(a[6]),
        ts(15),
      ],
    );

  const syncs = [
    [
      "sync-trials",
      "Engaged trials → Meta",
      "Engaged trials",
      "Meta Ads",
      "Upload audience",
      "Every 6 hours",
      "HEALTHY",
      ["Advertising consent required", "Suppression list exclusion"],
    ],
    [
      "sync-klaviyo",
      "Trial profiles → Klaviyo",
      "Engaged trials",
      "Klaviyo",
      "Update contacts",
      "Daily at 09:00",
      "FAILED",
      ["Email consent required", "Region allowed"],
    ],
    [
      "sync-conversions",
      "Demo conversions → Google Analytics",
      "Website events",
      "Google Analytics",
      "Send conversion events",
      "Hourly",
      "HEALTHY",
      ["Region allowed"],
    ],
  ];
  for (const s of syncs)
    await insert(
      "sync_definitions",
      [
        "id",
        "workspace_id",
        "name",
        "source",
        "destination",
        "operation",
        "schedule",
        "state",
        "consent_json",
      ],
      [s[0], "ws-northstar", ...s.slice(1, 7), json(s[7])],
    );
  const runs = [
    [
      "run-1",
      "sync-trials",
      "SUCCEEDED",
      4180,
      3842,
      338,
      "42s",
      null,
      ts(15, 11),
    ],
    [
      "run-2",
      "sync-klaviyo",
      "FAILED",
      4012,
      0,
      4012,
      "18s",
      "Destination rate limit exceeded. Retry after 15 minutes.",
      ts(15, 9),
    ],
    [
      "run-3",
      "sync-conversions",
      "SUCCEEDED",
      932,
      928,
      4,
      "11s",
      null,
      ts(15, 12),
    ],
    [
      "run-4",
      "sync-trials",
      "SUCCEEDED",
      4120,
      3784,
      336,
      "39s",
      null,
      ts(15, 5),
    ],
  ];
  for (const r of runs)
    await insert(
      "sync_runs",
      [
        "id",
        "sync_id",
        "state",
        "queried",
        "accepted",
        "rejected",
        "duration",
        "error",
        "started_at",
      ],
      r,
    );

  const ads = [
    [
      "ad-active",
      "Activation Signals — Retargeting",
      "Meta Ads",
      "Leads",
      "ACTIVE",
      4200,
      2380,
      96,
      "Aug 1 – Aug 31",
      [
        {
          headline: "Stop reporting. Start deciding.",
          body: "Turn customer signals into your next best growth move.",
          cta: "Book demo",
        },
      ],
      "meta_campaign_a92f10",
    ],
    [
      "ad-paused",
      "SaaS Benchmark — Search",
      "Google Ads",
      "Traffic",
      "PAUSED",
      2800,
      0,
      0,
      "Aug 18 – Sep 12",
      [
        {
          headline: "2026 SaaS Activation Benchmarks",
          body: "Compare your funnel with efficient SaaS teams.",
          cta: "Download",
        },
      ],
      "google_campaign_f81cd0",
    ],
  ];
  for (const a of ads)
    await insert(
      "paid_ad_campaigns",
      [
        "id",
        "workspace_id",
        "name",
        "platform",
        "objective",
        "state",
        "budget",
        "spend",
        "results",
        "date_range",
        "creative_json",
        "external_id",
      ],
      [a[0], "ws-northstar", ...a.slice(1, 9), json(a[9]), a[10]],
    );

  const insights = [
    [
      "insight-1",
      "Turn the signal-to-action post into a series",
      "The post generated 2.1× your median click-through rate and 31 demo conversions.",
      92,
      "+18–25 qualified clicks per post",
      "Create a three-part LinkedIn and email series",
      "OPPORTUNITY",
    ],
    [
      "insight-2",
      "Refresh the activation retargeting creative",
      "Frequency reached 4.8 and CTR declined 19% over the last seven days.",
      88,
      "Recover 10–15% CTR",
      "Generate three distinct creative angles",
      "WARNING",
    ],
    [
      "insight-3",
      "Reconnect Klaviyo before the next send",
      "The latest contact sync failed after a destination rate-limit response.",
      99,
      "Protect 3,842 eligible recipients",
      "Review connection health and retry the sync",
      "CONNECTION",
    ],
    [
      "insight-4",
      "Schedule LinkedIn posts for early afternoon",
      "Approved posts sent between 13:00–15:00 earned 34% more engagement.",
      81,
      "+9–14% engagement",
      "Apply this window to the next campaign",
      "LEARNING",
    ],
  ];
  for (const i of insights)
    await insert(
      "performance_insights",
      [
        "id",
        "workspace_id",
        "title",
        "evidence",
        "confidence",
        "expected_effect",
        "action",
        "kind",
      ],
      [i[0], "ws-northstar", ...i.slice(1)],
    );

  for (let day = 17; day <= 31; day++) {
    const scale = day % 4;
    await insert(
      "metric_snapshots",
      [
        "id",
        "workspace_id",
        "date",
        "impressions",
        "engagement",
        "clicks",
        "leads",
        "spend",
        "revenue",
      ],
      [
        `metric-jul-${day}`,
        "ws-northstar",
        `2026-07-${day}`,
        7200 + scale * 1150,
        620 + scale * 76,
        310 + scale * 42,
        18 + scale * 4,
        290 + scale * 21,
        1700 + scale * 280,
      ],
    );
  }
  for (let day = 1; day <= 15; day++) {
    const scale = day % 5;
    await insert(
      "metric_snapshots",
      [
        "id",
        "workspace_id",
        "date",
        "impressions",
        "engagement",
        "clicks",
        "leads",
        "spend",
        "revenue",
      ],
      [
        `metric-aug-${day}`,
        "ws-northstar",
        `2026-08-${String(day).padStart(2, "0")}`,
        8500 + scale * 1420,
        710 + scale * 94,
        390 + scale * 54,
        22 + scale * 6,
        315 + scale * 26,
        2050 + scale * 340,
      ],
    );
  }
  const media = [
    [
      "media-1",
      "Activation dashboard — dark",
      "IMAGE",
      ["product", "dashboard", "approved"],
      1,
    ],
    [
      "media-2",
      "Growth signals report cover",
      "IMAGE",
      ["report", "benchmark"],
      1,
    ],
    [
      "media-3",
      "Customer story — Loom",
      "VIDEO",
      ["testimonial", "customer"],
      0,
    ],
  ];
  for (const m of media)
    await insert(
      "media_assets",
      [
        "id",
        "workspace_id",
        "name",
        "kind",
        "tags_json",
        "approved_for_ai",
        "created_at",
      ],
      [m[0], "ws-northstar", m[1], m[2], json(m[3]), m[4], ts(10)],
    );
  const sources = [
    [
      "source-1",
      "2026 Activation Benchmark",
      "Product sheet",
      null,
      "Activation speed and time-to-value are the strongest predictors of long-term SaaS retention.",
    ],
    [
      "source-2",
      "Northstar messaging guardrails",
      "Brand guide",
      null,
      "Use plain language, ground claims in evidence, and never promise a guaranteed revenue outcome.",
    ],
    [
      "source-3",
      "Q2 customer research",
      "Customer research",
      null,
      "Growth leaders want fewer dashboards and clearer recommended actions.",
    ],
  ];
  for (const s of sources)
    await insert(
      "source_materials",
      [
        "id",
        "workspace_id",
        "name",
        "kind",
        "source_url",
        "extracted_text",
        "created_at",
      ],
      [s[0], "ws-northstar", ...s.slice(1), ts(7)],
    );
  const prefs = [
    [
      "pref-1",
      "CTA pattern",
      "Prefer specific, low-friction invitations such as “See the signals”",
      8,
      0,
    ],
    [
      "pref-2",
      "Posting time",
      "LinkedIn performs best between 13:00 and 15:00 ET",
      12,
      0,
    ],
    [
      "pref-3",
      "Words to avoid",
      "Avoid “revolutionary” and “game-changing”",
      14,
      1,
    ],
  ];
  for (const p of prefs)
    await insert(
      "learning_preferences",
      ["id", "workspace_id", "label", "value", "evidence_count", "explicit"],
      [p[0], "ws-northstar", ...p.slice(1)],
    );
  const audits = [
    [
      "audit-1",
      "user-marketer",
      "CAMPAIGN_GENERATED",
      "Campaign",
      "camp-benchmark",
      "Generated a coordinated campaign plan and four content items",
      ts(15, 8),
    ],
    [
      "audit-2",
      "user-reviewer",
      "CONTENT_APPROVED",
      "ContentItem",
      "content-3",
      "Approved Meta Ads creative for scheduling",
      ts(14, 16),
    ],
    [
      "audit-3",
      "user-marketer",
      "PUBLISH_COMPLETED",
      "ContentItem",
      "content-2",
      "Published email campaign to Klaviyo",
      ts(14, 13),
    ],
    [
      "audit-4",
      "user-admin",
      "SYNC_FAILED",
      "SyncRun",
      "run-2",
      "Klaviyo returned a recoverable rate-limit error",
      ts(15, 9),
    ],
    [
      "audit-5",
      "user-admin",
      "CONNECTION_CHANGED",
      "Connection",
      "conn-klaviyo",
      "Connection marked degraded after failed activity",
      ts(15, 9),
    ],
  ];
  for (const a of audits)
    await insert(
      "audit_events",
      [
        "id",
        "workspace_id",
        "actor_id",
        "action",
        "entity_type",
        "entity_id",
        "detail",
        "created_at",
      ],
      [a[0], "ws-northstar", ...a.slice(1)],
    );
  await db().prepare("PRAGMA optimize").run();
}

function parse<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}
async function rows(sql: string) {
  return (await db().prepare(sql).all()).results as Row[];
}

export async function loadAppState(userId = "user-owner"): Promise<AppState> {
  await initializeDatabase();
  const [
    workspaceRows,
    userRows,
    brandRows,
    definitions,
    connections,
    campaigns,
    templates,
    content,
    approvals,
    audiences,
    syncs,
    syncRuns,
    paidAds,
    insights,
    metrics,
    audits,
    media,
    sources,
    learning,
    agentRuns,
    agentSteps,
    products,
  ] = await Promise.all([
    rows("SELECT * FROM workspaces LIMIT 1"),
    rows(
      "SELECT u.*, m.role FROM users u JOIN memberships m ON m.user_id = u.id ORDER BY u.name",
    ),
    rows("SELECT * FROM brand_profiles LIMIT 1"),
    rows("SELECT * FROM integration_definitions ORDER BY name"),
    rows("SELECT * FROM connections ORDER BY last_activity DESC"),
    rows("SELECT * FROM campaigns ORDER BY created_at DESC"),
    rows(
      "SELECT * FROM campaign_templates ORDER BY featured DESC, category, name",
    ),
    rows("SELECT * FROM content_items ORDER BY updated_at DESC"),
    rows("SELECT * FROM approvals ORDER BY created_at DESC"),
    rows("SELECT * FROM audiences ORDER BY updated_at DESC"),
    rows("SELECT * FROM sync_definitions ORDER BY name"),
    rows("SELECT * FROM sync_runs ORDER BY started_at DESC"),
    rows("SELECT * FROM paid_ad_campaigns ORDER BY name"),
    rows("SELECT * FROM performance_insights ORDER BY confidence DESC"),
    rows("SELECT * FROM metric_snapshots ORDER BY date"),
    rows("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 100"),
    rows("SELECT * FROM media_assets ORDER BY created_at DESC"),
    rows("SELECT * FROM source_materials ORDER BY created_at DESC"),
    rows(
      "SELECT * FROM learning_preferences ORDER BY explicit DESC, evidence_count DESC",
    ),
    rows(
      "SELECT * FROM marketing_agent_runs ORDER BY created_at DESC LIMIT 20",
    ),
    rows(
      "SELECT * FROM marketing_agent_steps ORDER BY run_id, position",
    ),
    rows("SELECT * FROM products ORDER BY updated_at DESC"),
  ]);
  const users = userRows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    email: String(r.email),
    initials: String(r.initials),
    role: String(r.role) as Role,
  }));
  const currentUser = users.find((u) => u.id === userId) ?? users[0];
  const w = workspaceRows[0];
  const b = brandRows[0];
  return {
    workspace: {
      id: String(w.id),
      name: String(w.name),
      slug: String(w.slug),
      timezone: String(w.timezone),
      currency: String(w.currency),
      approvalMode: Boolean(w.approval_mode),
    },
    currentUser,
    users,
    brand: {
      id: String(b.id),
      name: String(b.name),
      website: String(b.website),
      description: String(b.description),
      valueProposition: String(b.value_proposition),
      audiences: parse(b.audiences_json),
      voice: parse(b.voice_json),
      colors: parse(b.colors_json),
      prohibitedClaims: parse(b.prohibited_claims_json),
      updatedAt: String(b.updated_at),
    },
    definitions: definitions.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      slug: String(r.slug),
      description: String(r.description),
      category: String(r.category),
      direction: String(r.direction) as "SOURCE" | "DESTINATION" | "BOTH",
      authType: String(r.auth_type) as
        "OAUTH" | "API_KEY" | "SERVICE_ACCOUNT" | "CONNECTION_STRING",
      capabilities: parse(r.capabilities_json),
      status: String(r.status) as "AVAILABLE" | "BETA" | "COMING_SOON",
      iconKey: String(r.icon_key),
    })),
    connections: connections.map((r) => ({
      id: String(r.id),
      definitionId: String(r.definition_id),
      accountName: String(r.account_name),
      state: String(r.state),
      capabilities: parse(r.capabilities_json),
      lastActivity: String(r.last_activity),
      lastError: r.last_error ? String(r.last_error) : undefined,
      successRate: Number(r.success_rate),
    })),
    campaigns: campaigns.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      summary: String(r.summary),
      objective: String(r.objective),
      audience: String(r.audience),
      offer: r.offer ? String(r.offer) : undefined,
      startDate: String(r.start_date),
      endDate: String(r.end_date),
      state: String(r.state),
      channels: parse(r.channels_json),
      plan: parse(r.plan_json),
      ownerId: String(r.owner_id),
      progress: Number(r.progress),
      createdAt: String(r.created_at),
    })),
    templates: templates.map((r) =>
      campaignTemplateSchema.parse({
        id: String(r.id),
        slug: String(r.slug),
        name: String(r.name),
        description: String(r.description),
        category: String(r.category),
        occasion: String(r.occasion),
        badge: String(r.badge),
        featured: Boolean(r.featured),
        durationDays: Number(r.duration_days),
        channels: parse(r.channels_json),
        audience: String(r.audience),
        objective: String(r.objective),
        offer: String(r.offer),
        variables: parse(r.variables_json),
        assets: parse(r.assets_json),
        topics: parse<{ topics: string[] }>(r.plan_json).topics,
        successMetrics: parse<{ successMetrics: string[] }>(r.plan_json)
          .successMetrics,
        recommendedBudget: Number(r.recommended_budget),
        updatedAt: String(r.updated_at),
      }),
    ),
    content: content.map((r) => ({
      id: String(r.id),
      campaignId: String(r.campaign_id),
      channel: String(r.channel),
      type: String(r.type),
      title: String(r.title),
      body: String(r.body),
      state: String(r.state),
      scheduledAt: r.scheduled_at ? String(r.scheduled_at) : undefined,
      version: Number(r.version),
      externalId: r.external_id ? String(r.external_id) : undefined,
      metrics: parse(r.metrics_json),
      updatedAt: String(r.updated_at),
    })),
    approvals: approvals.map((r) => ({
      id: String(r.id),
      contentId: String(r.content_id),
      state: String(r.state),
      submitterId: String(r.submitter_id),
      reviewerId: r.reviewer_id ? String(r.reviewer_id) : undefined,
      comment: r.comment ? String(r.comment) : undefined,
      createdAt: String(r.created_at),
      decidedAt: r.decided_at ? String(r.decided_at) : undefined,
    })),
    audiences: audiences.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      description: String(r.description),
      rules: parse(r.rules_json),
      size: Number(r.size),
      excluded: Number(r.excluded),
      destinations: parse(r.destinations_json),
      updatedAt: String(r.updated_at),
    })),
    syncs: syncs.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      source: String(r.source),
      destination: String(r.destination),
      operation: String(r.operation),
      schedule: String(r.schedule),
      state: String(r.state),
      consent: parse(r.consent_json),
    })),
    syncRuns: syncRuns.map((r) => ({
      id: String(r.id),
      syncId: String(r.sync_id),
      state: String(r.state),
      queried: Number(r.queried),
      accepted: Number(r.accepted),
      rejected: Number(r.rejected),
      duration: String(r.duration),
      error: r.error ? String(r.error) : undefined,
      startedAt: String(r.started_at),
    })),
    paidAds: paidAds.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      platform: String(r.platform),
      objective: String(r.objective),
      state: String(r.state),
      budget: Number(r.budget),
      spend: Number(r.spend),
      results: Number(r.results),
      dateRange: String(r.date_range),
      creative: parse(r.creative_json),
      externalId: String(r.external_id),
    })),
    insights: insights.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      evidence: String(r.evidence),
      confidence: Number(r.confidence),
      expectedEffect: String(r.expected_effect),
      action: String(r.action),
      kind: String(r.kind),
    })),
    metrics: metrics.map((r) => ({
      id: String(r.id),
      date: String(r.date),
      impressions: Number(r.impressions),
      engagement: Number(r.engagement),
      clicks: Number(r.clicks),
      leads: Number(r.leads),
      spend: Number(r.spend),
      revenue: Number(r.revenue),
    })),
    audits: audits.map((r) => ({
      id: String(r.id),
      actorId: String(r.actor_id),
      action: String(r.action),
      entityType: String(r.entity_type),
      entityId: String(r.entity_id),
      detail: String(r.detail),
      createdAt: String(r.created_at),
    })),
    media: media.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      kind: String(r.kind),
      tags: parse(r.tags_json),
      approvedForAi: Boolean(r.approved_for_ai),
      createdAt: String(r.created_at),
    })),
    sources: sources.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      kind: String(r.kind),
      sourceUrl: r.source_url ? String(r.source_url) : undefined,
      extractedText: String(r.extracted_text),
      createdAt: String(r.created_at),
    })),
    learning: learning.map((r) => ({
      id: String(r.id),
      label: String(r.label),
      value: String(r.value),
      evidenceCount: Number(r.evidence_count),
      explicit: Boolean(r.explicit),
    })),
    agentRuns: agentRuns.map((r) => ({
      id: String(r.id),
      createdBy: String(r.created_by),
      mode: String(r.mode) as
        | "LIFECYCLE"
        | "PERFORMANCE"
        | "CROSS_CHANNEL",
      objective: String(r.objective),
      status: String(r.status) as
        | "READY_FOR_REVIEW"
        | "EXECUTED"
        | "FAILED",
      selectedTemplateId: String(r.selected_template_id),
      proposal: parse(r.proposal_json),
      result: r.result_json ? parse(r.result_json) : undefined,
      steps: agentSteps
        .filter((step) => String(step.run_id) === String(r.id))
        .map((step) => ({
          id: String(step.id),
          position: Number(step.position),
          tool: String(step.tool),
          title: String(step.title),
          detail: String(step.detail),
          state: String(step.state) as "COMPLETED" | "BLOCKED",
          output: parse(step.output_json),
          createdAt: String(step.created_at),
        })),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    })),
    products: products.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      description: String(r.description),
      price: String(r.price),
      currency: String(r.currency),
      productUrl: String(r.product_url),
      mediaId: r.media_id ? String(r.media_id) : undefined,
      status: String(r.status) as "ACTIVE" | "DRAFT" | "ARCHIVED",
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    })),
    chatGptAdsConfigured: Boolean(
      (env as unknown as { OPENAI_ADS_API_KEY?: string }).OPENAI_ADS_API_KEY?.trim(),
    ),
    redditAdsConfigured: (() => {
      const values = env as unknown as Record<string, string | undefined>;
      return [
        "REDDIT_ADS_CLIENT_ID",
        "REDDIT_ADS_CLIENT_SECRET",
        "REDDIT_ADS_REFRESH_TOKEN",
        "REDDIT_AD_ACCOUNT_ID",
        "REDDIT_ADS_PROFILE_ID",
        "REDDIT_ADS_FUNDING_INSTRUMENT_ID",
        "REDDIT_ADS_USER_AGENT",
      ].every((key) => Boolean(values[key]?.trim()));
    })(),
  };
}

export function database() {
  return db();
}
