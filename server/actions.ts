import { z } from "zod";
import { database, initializeDatabase, loadAppState } from "@/db/runtime";
import type { ActionResult, Role } from "@/lib/types";
import { getAIProvider, MockIntegrationAdapter } from "@/server/providers";

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("connectIntegration"),
    definitionId: z.string(),
    accountName: z.string().min(2),
  }),
  z.object({
    type: z.literal("saveBrandVoice"),
    tone: z.string().min(2),
    traits: z.array(z.string()).min(1),
    avoid: z.array(z.string()),
  }),
  z.object({
    type: z.literal("createCampaign"),
    prompt: z.string().min(8),
    channels: z.array(z.string()).min(1),
  }),
  z.object({
    type: z.literal("editContent"),
    contentId: z.string(),
    body: z.string().min(12),
  }),
  z.object({
    type: z.literal("regenerateContent"),
    contentId: z.string(),
    instruction: z.string().optional(),
  }),
  z.object({ type: z.literal("submitApproval"), contentId: z.string() }),
  z.object({
    type: z.literal("decideApproval"),
    approvalId: z.string(),
    decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]),
    comment: z.string().optional(),
  }),
  z.object({
    type: z.literal("bulkApprove"),
    approvalIds: z.array(z.string()).min(1),
    confirmed: z.literal(true),
  }),
  z.object({
    type: z.literal("rescheduleContent"),
    contentId: z.string(),
    scheduledAt: z.string(),
  }),
  z.object({
    type: z.literal("publishContent"),
    contentId: z.string(),
    confirmed: z.literal(true),
  }),
  z.object({ type: z.literal("retrySync"), syncId: z.string() }),
  z.object({
    type: z.literal("createPaidAd"),
    name: z.string().min(3),
    platform: z.enum(["Meta Ads", "Google Ads"]),
    objective: z.string(),
    budget: z.number().positive(),
    headline: z.string().min(3),
    body: z.string().min(8),
  }),
  z.object({
    type: z.literal("activatePaidAd"),
    adId: z.string(),
    confirmed: z.literal(true),
  }),
  z.object({ type: z.literal("createFollowup"), insightId: z.string() }),
  z.object({
    type: z.literal("updateSettings"),
    approvalMode: z.boolean(),
    timezone: z.string(),
    currency: z.string(),
  }),
  z.object({
    type: z.literal("createAudience"),
    name: z.string().min(3),
    description: z.string().min(8),
    rules: z
      .array(
        z.object({
          field: z.string(),
          operator: z.string(),
          value: z.string(),
        }),
      )
      .min(1),
  }),
]);

type Action = z.infer<typeof actionSchema>;
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

const permissions: Record<Role, Set<string>> = {
  OWNER: new Set([
    "connectIntegration",
    "saveBrandVoice",
    "createCampaign",
    "editContent",
    "regenerateContent",
    "submitApproval",
    "decideApproval",
    "bulkApprove",
    "rescheduleContent",
    "publishContent",
    "retrySync",
    "createPaidAd",
    "activatePaidAd",
    "createFollowup",
    "updateSettings",
    "createAudience",
  ]),
  ADMIN: new Set([
    "connectIntegration",
    "saveBrandVoice",
    "createCampaign",
    "editContent",
    "regenerateContent",
    "submitApproval",
    "decideApproval",
    "bulkApprove",
    "rescheduleContent",
    "publishContent",
    "retrySync",
    "createPaidAd",
    "activatePaidAd",
    "createFollowup",
    "updateSettings",
    "createAudience",
  ]),
  MARKETER: new Set([
    "saveBrandVoice",
    "createCampaign",
    "editContent",
    "regenerateContent",
    "submitApproval",
    "rescheduleContent",
    "publishContent",
    "retrySync",
    "createPaidAd",
    "createFollowup",
    "createAudience",
  ]),
  REVIEWER: new Set(["decideApproval", "bulkApprove"]),
  VIEWER: new Set(),
};

async function audit(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  detail: string,
) {
  const auditId = id("audit");
  await database()
    .prepare(
      "INSERT INTO audit_events (id, workspace_id, actor_id, action, entity_type, entity_id, detail, created_at) VALUES (?, 'ws-northstar', ?, ?, ?, ?, ?, ?)",
    )
    .bind(auditId, actorId, action, entityType, entityId, detail, now())
    .run();
  return auditId;
}

async function find(sql: string, value: string) {
  return database().prepare(sql).bind(value).first<Record<string, unknown>>();
}

export async function performAction(
  raw: unknown,
  userId: string,
): Promise<ActionResult> {
  await initializeDatabase();
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      error: "Please review the highlighted information.",
      fields: Object.fromEntries(
        parsed.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ]),
      ),
    };
  const action: Action = parsed.data;
  const state = await loadAppState(userId);
  if (!permissions[state.currentUser.role].has(action.type))
    return {
      ok: false,
      error: `${state.currentUser.role.toLowerCase()} access cannot perform this action.`,
    };

  if (action.type === "connectIntegration") {
    const definition = state.definitions.find(
      (item) => item.id === action.definitionId,
    );
    if (!definition || definition.status === "COMING_SOON")
      return { ok: false, error: "This integration is not available yet." };
    const existing = state.connections.find(
      (item) => item.definitionId === action.definitionId,
    );
    if (existing) return { ok: true, data: { connectionId: existing.id } };
    const adapter = new MockIntegrationAdapter(
      definition.id,
      definition.capabilities as never[],
    );
    const test = await adapter.testConnection(action.accountName);
    const connectionId = id("conn");
    await database()
      .prepare(
        "INSERT INTO connections (id, workspace_id, definition_id, account_name, state, capabilities_json, last_activity, last_error, success_rate) VALUES (?, 'ws-northstar', ?, ?, 'CONNECTED', ?, ?, NULL, 100)",
      )
      .bind(
        connectionId,
        definition.id,
        action.accountName,
        JSON.stringify(definition.capabilities),
        now(),
      )
      .run();
    const auditId = await audit(
      userId,
      "CONNECTION_CREATED",
      "Connection",
      connectionId,
      `${definition.name} connected as ${action.accountName}`,
    );
    return { ok: true, data: { connectionId, test }, auditEventId: auditId };
  }
  if (action.type === "saveBrandVoice") {
    const voice = {
      ...state.brand.voice,
      tone: action.tone,
      traits: action.traits,
      avoid: action.avoid,
    };
    await database()
      .prepare(
        "UPDATE brand_profiles SET voice_json = ?, updated_at = ? WHERE id = 'brand-northstar'",
      )
      .bind(JSON.stringify(voice), now())
      .run();
    const auditId = await audit(
      userId,
      "BRAND_PROFILE_CHANGED",
      "BrandProfile",
      "brand-northstar",
      "Updated voice and style guidance",
    );
    return { ok: true, data: voice, auditEventId: auditId };
  }
  if (action.type === "createCampaign") {
    const provider = getAIProvider();
    const plan = await provider.generateCampaign({
      prompt: action.prompt,
      channels: action.channels,
      brand: state.brand,
    });
    const campaignId = id("camp");
    await database()
      .prepare(
        "INSERT INTO campaigns (id, workspace_id, title, summary, objective, audience, offer, start_date, end_date, state, channels_json, plan_json, owner_id, progress, created_at) VALUES (?, 'ws-northstar', ?, ?, ?, ?, ?, ?, ?, 'READY_FOR_REVIEW', ?, ?, ?, 24, ?)",
      )
      .bind(
        campaignId,
        plan.title,
        plan.summary,
        plan.objective,
        plan.targetAudience,
        plan.offer ?? null,
        plan.startDate,
        plan.endDate,
        JSON.stringify(plan.channels),
        JSON.stringify({
          topics: plan.topics,
          successMetrics: plan.successMetrics,
          assumptions: plan.assumptions,
          risks: plan.risks,
        }),
        userId,
        now(),
      )
      .run();
    for (const generated of plan.contentItems) {
      const contentId = id("content");
      await database()
        .prepare(
          "INSERT INTO content_items (id, campaign_id, channel, type, title, body, state, scheduled_at, version, external_id, metrics_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', NULL, 1, NULL, ?, ?)",
        )
        .bind(
          contentId,
          campaignId,
          generated.channel,
          generated.type,
          generated.title,
          generated.body,
          JSON.stringify({ impressions: 0, clicks: 0, conversions: 0 }),
          now(),
        )
        .run();
      await database()
        .prepare(
          "INSERT INTO content_versions (id, content_id, version, body, reason, created_at) VALUES (?, ?, 1, ?, 'AI generation', ?)",
        )
        .bind(id("version"), contentId, generated.body, now())
        .run();
    }
    const auditId = await audit(
      userId,
      "CAMPAIGN_GENERATED",
      "Campaign",
      campaignId,
      `Generated ${plan.contentItems.length} coordinated content items`,
    );
    return { ok: true, data: { campaignId }, auditEventId: auditId };
  }
  if (action.type === "editContent" || action.type === "regenerateContent") {
    const row = await find(
      "SELECT * FROM content_items WHERE id = ?",
      action.contentId,
    );
    if (!row) return { ok: false, error: "Content item not found." };
    const currentVersion = Number(row.version);
    const newBody =
      action.type === "editContent"
        ? action.body
        : (
            await getAIProvider().regenerateContent({
              content: state.content.find(
                (item) => item.id === action.contentId,
              )!,
              instruction: action.instruction,
              brand: state.brand,
            })
          ).body;
    await database()
      .prepare(
        "UPDATE content_items SET body = ?, version = ?, state = 'DRAFT', updated_at = ? WHERE id = ?",
      )
      .bind(newBody, currentVersion + 1, now(), action.contentId)
      .run();
    await database()
      .prepare(
        "INSERT INTO content_versions (id, content_id, version, body, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        id("version"),
        action.contentId,
        currentVersion + 1,
        newBody,
        action.type === "editContent" ? "Manual edit" : "AI regeneration",
        now(),
      )
      .run();
    const auditId = await audit(
      userId,
      action.type === "editContent" ? "CONTENT_CHANGED" : "CONTENT_REGENERATED",
      "ContentItem",
      action.contentId,
      `Created content version ${currentVersion + 1}`,
    );
    return {
      ok: true,
      data: { contentId: action.contentId, version: currentVersion + 1 },
      auditEventId: auditId,
    };
  }
  if (action.type === "submitApproval") {
    const approvalId = id("approval");
    await database()
      .prepare(
        "UPDATE content_items SET state = 'AWAITING_APPROVAL', updated_at = ? WHERE id = ?",
      )
      .bind(now(), action.contentId)
      .run();
    await database()
      .prepare(
        "INSERT INTO approvals (id, content_id, state, submitter_id, reviewer_id, comment, created_at, decided_at) VALUES (?, ?, 'PENDING', ?, NULL, NULL, ?, NULL)",
      )
      .bind(approvalId, action.contentId, userId, now())
      .run();
    const auditId = await audit(
      userId,
      "CONTENT_SUBMITTED",
      "ContentItem",
      action.contentId,
      "Submitted content for explicit approval",
    );
    return { ok: true, data: { approvalId }, auditEventId: auditId };
  }
  if (action.type === "decideApproval") {
    const approval = await find(
      "SELECT * FROM approvals WHERE id = ?",
      action.approvalId,
    );
    if (!approval) return { ok: false, error: "Approval request not found." };
    const contentState = action.decision === "APPROVED" ? "APPROVED" : "DRAFT";
    await database()
      .prepare(
        "UPDATE approvals SET state = ?, reviewer_id = ?, comment = ?, decided_at = ? WHERE id = ?",
      )
      .bind(
        action.decision,
        userId,
        action.comment ?? null,
        now(),
        action.approvalId,
      )
      .run();
    await database()
      .prepare(
        "UPDATE content_items SET state = ?, scheduled_at = CASE WHEN ? = 'APPROVED' THEN scheduled_at ELSE NULL END, updated_at = ? WHERE id = ?",
      )
      .bind(contentState, action.decision, now(), String(approval.content_id))
      .run();
    const auditId = await audit(
      userId,
      `CONTENT_${action.decision}`,
      "ContentItem",
      String(approval.content_id),
      action.comment || `Reviewer decision: ${action.decision}`,
    );
    return {
      ok: true,
      data: { contentId: approval.content_id, state: contentState },
      auditEventId: auditId,
    };
  }
  if (action.type === "bulkApprove") {
    for (const approvalId of action.approvalIds) {
      const approval = await find(
        "SELECT * FROM approvals WHERE id = ?",
        approvalId,
      );
      if (!approval) continue;
      await database()
        .prepare(
          "UPDATE approvals SET state = 'APPROVED', reviewer_id = ?, decided_at = ? WHERE id = ?",
        )
        .bind(userId, now(), approvalId)
        .run();
      await database()
        .prepare(
          "UPDATE content_items SET state = 'APPROVED', updated_at = ? WHERE id = ?",
        )
        .bind(now(), String(approval.content_id))
        .run();
    }
    const auditId = await audit(
      userId,
      "BULK_APPROVAL",
      "Approval",
      action.approvalIds.join(","),
      `Approved ${action.approvalIds.length} content items`,
    );
    return {
      ok: true,
      data: { count: action.approvalIds.length },
      auditEventId: auditId,
    };
  }
  if (action.type === "rescheduleContent") {
    const item = await find(
      "SELECT state FROM content_items WHERE id = ?",
      action.contentId,
    );
    if (!item || String(item.state) === "REJECTED")
      return { ok: false, error: "Rejected content cannot be scheduled." };
    const stateName = ["APPROVED", "SCHEDULED"].includes(String(item.state))
      ? "SCHEDULED"
      : String(item.state);
    await database()
      .prepare(
        "UPDATE content_items SET scheduled_at = ?, state = ?, updated_at = ? WHERE id = ?",
      )
      .bind(action.scheduledAt, stateName, now(), action.contentId)
      .run();
    const auditId = await audit(
      userId,
      "SCHEDULE_CHANGED",
      "ContentItem",
      action.contentId,
      `Scheduled for ${action.scheduledAt}`,
    );
    return {
      ok: true,
      data: { scheduledAt: action.scheduledAt },
      auditEventId: auditId,
    };
  }
  if (action.type === "publishContent") {
    const item = state.content.find(
      (content) => content.id === action.contentId,
    );
    if (!item || !["APPROVED", "SCHEDULED", "PUBLISHED"].includes(item.state))
      return {
        ok: false,
        error: "Content requires approval before publishing.",
      };
    const key = `publish:${action.contentId}:v${item.version}`;
    const completed = await find(
      "SELECT * FROM operation_ledger WHERE idempotency_key = ?",
      key,
    );
    if (completed)
      return {
        ok: true,
        data: { externalId: completed.external_id, idempotent: true },
      };
    const definitionId = item.channel.includes("LinkedIn")
      ? "int-linkedin"
      : item.channel.includes("Email")
        ? "int-klaviyo"
        : item.channel.includes("Google")
          ? "int-google-ads"
          : "int-meta";
    const adapter = new MockIntegrationAdapter(definitionId, []);
    const result = await adapter.publishContent!(item, key);
    await database()
      .prepare(
        "INSERT INTO operation_ledger (idempotency_key, operation, external_id, status, created_at) VALUES (?, 'publish_content', ?, 'COMPLETED', ?)",
      )
      .bind(key, result.externalId, now())
      .run();
    await database()
      .prepare(
        "UPDATE content_items SET state = 'PUBLISHED', external_id = ?, updated_at = ? WHERE id = ?",
      )
      .bind(result.externalId, now(), action.contentId)
      .run();
    const auditId = await audit(
      userId,
      "PUBLISH_COMPLETED",
      "ContentItem",
      action.contentId,
      `Published with external ID ${result.externalId}`,
    );
    return {
      ok: true,
      data: { externalId: result.externalId, idempotent: false },
      auditEventId: auditId,
    };
  }
  if (action.type === "retrySync") {
    const sync = state.syncs.find((item) => item.id === action.syncId);
    if (!sync) return { ok: false, error: "Sync not found." };
    const runId = id("run");
    await database()
      .prepare(
        "INSERT INTO sync_runs (id, sync_id, state, queried, accepted, rejected, duration, error, started_at) VALUES (?, ?, 'SUCCEEDED', 4012, 3842, 170, '31s', NULL, ?)",
      )
      .bind(runId, action.syncId, now())
      .run();
    await database()
      .prepare("UPDATE sync_definitions SET state = 'HEALTHY' WHERE id = ?")
      .bind(action.syncId)
      .run();
    if (sync.destination === "Klaviyo")
      await database()
        .prepare(
          "UPDATE connections SET state = 'CONNECTED', last_error = NULL, success_rate = 98, last_activity = ? WHERE id = 'conn-klaviyo'",
        )
        .bind(now())
        .run();
    const auditId = await audit(
      userId,
      "SYNC_COMPLETED",
      "SyncRun",
      runId,
      `Retry completed: 3,842 accepted and 170 consent-filtered`,
    );
    return { ok: true, data: { runId }, auditEventId: auditId };
  }
  if (action.type === "createPaidAd") {
    const adId = id("ad");
    const key = `create-ad:${adId}`;
    const adapter = new MockIntegrationAdapter(
      action.platform === "Meta Ads" ? "int-meta" : "int-google-ads",
      [],
    );
    const result = await adapter.createAdCampaign!(action.name, key);
    await database()
      .prepare(
        "INSERT INTO paid_ad_campaigns (id, workspace_id, name, platform, objective, state, budget, spend, results, date_range, creative_json, external_id) VALUES (?, 'ws-northstar', ?, ?, ?, 'PAUSED', ?, 0, 0, 'Aug 24 – Sep 14', ?, ?)",
      )
      .bind(
        adId,
        action.name,
        action.platform,
        action.objective,
        Math.round(action.budget),
        JSON.stringify([
          { headline: action.headline, body: action.body, cta: "Learn more" },
        ]),
        result.externalId,
      )
      .run();
    await database()
      .prepare(
        "INSERT INTO operation_ledger (idempotency_key, operation, external_id, status, created_at) VALUES (?, 'create_ad_campaign', ?, 'COMPLETED', ?)",
      )
      .bind(key, result.externalId, now())
      .run();
    const auditId = await audit(
      userId,
      "PAID_CAMPAIGN_CREATED",
      "PaidAdCampaign",
      adId,
      `Created paused ${action.platform} campaign with ${result.externalId}`,
    );
    return {
      ok: true,
      data: { adId, externalId: result.externalId },
      auditEventId: auditId,
    };
  }
  if (action.type === "activatePaidAd") {
    await database()
      .prepare("UPDATE paid_ad_campaigns SET state = 'ACTIVE' WHERE id = ?")
      .bind(action.adId)
      .run();
    const auditId = await audit(
      userId,
      "PAID_CAMPAIGN_ACTIVATED",
      "PaidAdCampaign",
      action.adId,
      "Activated paid campaign after explicit confirmation",
    );
    return { ok: true, data: { adId: action.adId }, auditEventId: auditId };
  }
  if (action.type === "createFollowup") {
    const insight = state.insights.find((item) => item.id === action.insightId);
    if (!insight) return { ok: false, error: "Recommendation not found." };
    return performAction(
      {
        type: "createCampaign",
        prompt: insight.action,
        channels: ["LinkedIn", "Email"],
      },
      userId,
    );
  }
  if (action.type === "updateSettings") {
    await database()
      .prepare(
        "UPDATE workspaces SET approval_mode = ?, timezone = ?, currency = ? WHERE id = 'ws-northstar'",
      )
      .bind(action.approvalMode ? 1 : 0, action.timezone, action.currency)
      .run();
    const auditId = await audit(
      userId,
      "WORKSPACE_SETTINGS_CHANGED",
      "Workspace",
      "ws-northstar",
      "Updated approval, timezone, and currency settings",
    );
    return { ok: true, data: action, auditEventId: auditId };
  }
  if (action.type === "createAudience") {
    const audienceId = id("aud");
    await database()
      .prepare(
        "INSERT INTO audiences (id, workspace_id, name, description, rules_json, size, excluded, destinations_json, updated_at) VALUES (?, 'ws-northstar', ?, ?, ?, 2184, 146, ?, ?)",
      )
      .bind(
        audienceId,
        action.name,
        action.description,
        JSON.stringify(action.rules),
        JSON.stringify(["Klaviyo", "Meta Ads", "Google Ads"]),
        now(),
      )
      .run();
    const auditId = await audit(
      userId,
      "AUDIENCE_CREATED",
      "Audience",
      audienceId,
      "Created visual audience with consent filtering",
    );
    return { ok: true, data: { audienceId }, auditEventId: auditId };
  }
  return { ok: false, error: "Unsupported action." };
}
