import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migration = readFileSync(
  join(root, "supabase/migrations/202608230001_growthos_v1.sql"),
  "utf8",
);
const messagingMigration = readFileSync(
  join(root, "supabase/migrations/202608260001_email_sms.sql"),
  "utf8",
);
const tacticMigration = readFileSync(
  join(root, "supabase/migrations/202608260002_tactic_engine.sql"),
  "utf8",
);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (entry === "node_modules" || entry === ".git" || entry === "dist")
      return [];
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(ts|tsx)$/.test(path)
        ? [path]
        : [];
  });
}

describe("production reset", () => {
  it("allows real first-time email signup instead of requiring seed users", () => {
    const authScreen = readFileSync(
      join(root, "app/components/AuthScreen.tsx"),
      "utf8",
    );
    const supabaseConfig = readFileSync(
      join(root, "supabase/config.toml"),
      "utf8",
    );
    expect(authScreen).toContain("shouldCreateUser: true");
    expect(supabaseConfig).toContain("enable_signup = true");
    expect(authScreen).not.toContain("shouldCreateUser: false");
  });

  it("contains no runtime mock provider or seeded Northstar workspace", () => {
    const production = [
      ...sourceFiles(join(root, "app")),
      ...sourceFiles(join(root, "lib")),
      ...sourceFiles(join(root, "server")),
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(production).not.toMatch(
      /MockAIProvider|MockMarketingAgent|ws-northstar|Northstar Analytics/,
    );
  });

  it("does not bind the retired D1 or R2 demo stores", () => {
    const hosting = JSON.parse(
      readFileSync(join(root, ".openai/hosting.json"), "utf8"),
    );
    expect(hosting.d1).toBeUndefined();
    expect(hosting.r2).toBeUndefined();
  });
});

describe("database isolation", () => {
  it("enables RLS for every workspace-owned public table", () => {
    const tables = [
      "workspaces",
      "memberships",
      "brand_profiles",
      "products_services",
      "media_assets",
      "website_imports",
      "provider_connections",
      "provider_accounts",
      "oauth_states",
      "campaigns",
      "content_items",
      "content_versions",
      "approvals",
      "schedules",
      "operations",
      "campaign_deployments",
      "publish_jobs",
      "metric_snapshots",
      "ai_runs",
      "audit_events",
    ];
    for (const table of tables) expect(migration).toContain(table);
    expect(migration).toContain("public.is_workspace_member(workspace_id)");
    expect(migration).toContain(
      "revoke all on private.provider_credentials from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant all on private.provider_credentials to service_role",
    );
  });

  it("creates no customer workspace, campaign, account, or metric seed", () => {
    expect(migration).not.toMatch(
      /Northstar|ws-northstar|demo@example|seeded/i,
    );
  });

  it("installs private media delivery and durable publishing records", () => {
    expect(migration).toContain("create table private.media_delivery_tokens");
    expect(migration).toContain("create table public.publish_jobs");
    expect(migration).toContain("select pgmq.create('organic_publishing')");
    expect(migration).toContain("create or replace function private.queue_read");
    expect(migration).toContain(
      "revoke all on function private.queue_send(text, jsonb, integer) from public, anon, authenticated",
    );
    const worker = readFileSync(
      join(root, "app/api/v1/internal/publish-due/route.ts"),
      "utf8",
    );
    expect(worker).toContain("readOrganicPublishQueue");
    expect(worker).toContain("deleteOrganicQueueMessage");
  });

  it("ships real refresh workers and immutable content edits", () => {
    expect(
      readFileSync(
        join(root, "app/api/v1/internal/refresh-tokens/route.ts"),
        "utf8",
      ),
    ).toContain("refreshAuthorizationTokens");
    const editRoute = readFileSync(
      join(root, "app/api/v1/campaigns/[id]/content/[itemId]/route.ts"),
      "utf8",
    );
    expect(editRoute).toContain('from("content_versions").insert');
    expect(editRoute).toContain('status: "cancelled"');
    expect(editRoute).toContain('status: "draft"');
  });

  it("continues OAuth into destination selection and uses live connection checks", () => {
    const oauthStart = readFileSync(
      join(root, "app/api/v1/oauth/[provider]/start/route.ts"),
      "utf8",
    );
    expect(oauthStart).toContain(
      "redirect_path: `/app/manage/connections/${provider}`",
    );
    expect(oauthStart).toContain('"config_id"');
    expect(oauthStart).toContain('provider === "linkedin_pages"');
    const healthRoute = readFileSync(
      join(root, "app/api/v1/connections/[id]/health/route.ts"),
      "utf8",
    );
    expect(healthRoute).toContain("runConnectionHealth");
    expect(healthRoute).toContain('action: "provider.health_checked"');
  });

  it("installs consent-first durable email and SMS delivery", () => {
    for (const table of ["contacts", "contact_lists", "communication_consents", "consent_events", "suppressions", "message_batches", "message_deliveries", "message_events"])
      expect(messagingMigration).toContain(`create table public.${table}`);
    expect(messagingMigration).toContain("select pgmq.create('messaging_delivery')");
    expect(messagingMigration).toContain("every imported row requires explicit consent proof");
    expect(readFileSync(join(root, "app/api/v1/internal/send-messages/route.ts"), "utf8")).toContain("readMessageQueue");
    expect(readFileSync(join(root, "app/api/v1/webhooks/twilio/[connectionId]/route.ts"), "utf8")).toContain("validateTwilioSignature");
    expect(readFileSync(join(root, "app/api/v1/webhooks/sendgrid/[connectionId]/route.ts"), "utf8")).toContain("validateSendGridSignature");
    expect(readFileSync(join(root, "app/api/v1/connections/twilio/route.ts"), "utf8")).toContain("InboundRequestUrl");
  });

  it("supports audited per-content decisions and automatic unscheduling", () => {
    const decisionRoute = readFileSync(
      join(
        root,
        "app/api/v1/campaigns/[id]/content/[itemId]/decision/route.ts",
      ),
      "utf8",
    );
    expect(decisionRoute).toContain("changes_requested");
    expect(decisionRoute).toContain('status: "cancelled"');
    expect(decisionRoute).toContain("separate_approver_required");
  });

  it("persists tactic identity and delivers repeated channel steps by item id", () => {
    for (const field of [
      "templateStepId",
      "stepLabel",
      "tacticStage",
      "scheduledFor",
      "design",
    ])
      expect(tacticMigration).toContain(`'${field}'`);
    const launchRoute = readFileSync(
      join(root, "app/api/v1/campaigns/[id]/launch/route.ts"),
      "utf8",
    );
    expect(launchRoute).toContain("candidate.id === item.id");
    expect(launchRoute).not.toContain(
      "candidate.channel_key === item.channel",
    );
  });
});
