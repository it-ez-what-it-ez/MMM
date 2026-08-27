import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CHANNEL_KEYS } from "@/lib/v1/domain";
import { OpenAICampaignProvider, moderateText } from "@/server/v1/ai-provider";
import {
  authorizationErrorResponse,
  requireApiUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";

const schema = z.object({
  workspaceId: z.string().uuid(),
  objective: z.string().trim().min(10).max(2000),
  businessName: z.string().min(1).max(120),
  brandSummary: z.string().max(5000).default(""),
  brandVoice: z.record(z.unknown()).default({}),
  product: z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(160),
    description: z.string().max(5000),
    mediaIds: z.array(z.string().uuid()).max(20),
  }),
  channels: z.array(z.enum(CHANNEL_KEYS)).min(1),
  landingUrl: z.string().url(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable(),
  currency: z.enum(["USD", "CAD"]),
  dailyBudgetCents: z.number().int().positive().nullable(),
  lifetimeBudgetCents: z.number().int().positive().nullable(),
  accountIds: z.record(z.string(), z.string().uuid()).default({}),
  targetCountries: z.array(z.enum(["US", "CA"])).min(1).max(2),
  tiktokPublishingOptions: z.object({
    privacy: z.string().nullable(),
    commentsEnabled: z.boolean(),
  }),
  messaging: z.object({
    audienceId: z.string().uuid(),
    eligible: z.object({ email: z.number().int().nonnegative(), sms: z.number().int().nonnegative() }),
    legalBusinessName: z.string().min(1).max(160),
    physicalAddress: z.string().min(5).max(500),
    fromName: z.string().max(100).nullable(),
    fromAddress: z.string().email().nullable(),
    replyToAddress: z.string().email().nullable(),
  }).nullable(),
});

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  let runId: string | null = null;
  try {
    const user = await requireApiUser(request);
    const input = schema.parse(await request.json());
    await requireWorkspaceRole(user.id, input.workspaceId, [
      "owner",
      "admin",
      "marketer",
    ]);
    const admin = getSupabaseAdmin();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [{ data: workspace }, { count: monthlyRuns }] = await Promise.all([
      admin
        .from("workspaces")
        .select("ai_monthly_limit")
        .eq("id", input.workspaceId)
        .single(),
      admin
        .from("ai_runs")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", input.workspaceId)
        .gte("created_at", monthStart.toISOString()),
    ]);
    if (!workspace) throw new Error("Workspace AI limits could not be loaded.");
    if ((monthlyRuns ?? 0) >= workspace.ai_monthly_limit)
      return Response.json(
        {
          ok: false,
          errors: [{ code: "ai_limit", message: "This workspace has reached its monthly AI generation limit. Templates remain available for manual editing.", recoverable: true }],
          operationId,
          auditEventId,
        },
        { status: 429 },
      );
    const moderation = await moderateText(
      `${input.objective}\n${input.product.name}\n${input.product.description}`,
    );
    runId = crypto.randomUUID();
    await admin
      .from("ai_runs")
      .insert({
        id: runId,
        workspace_id: input.workspaceId,
        kind: "campaign.plan",
        model: process.env.OPENAI_TEXT_MODEL ?? "gpt-5.4",
        prompt_version: "campaign-plan-v1",
        input_hash: await sha256(JSON.stringify(input)),
        inputs: input,
        moderation,
        status: moderation.flagged ? "rejected" : "running",
        created_by: user.id,
      });
    if (moderation.flagged) {
      return Response.json(
        {
          ok: false,
          errors: [
            {
              code: "moderation",
              message:
                "This request could not be generated. Edit the objective or product description and try again.",
              recoverable: true,
            },
          ],
          operationId,
          auditEventId,
        },
        { status: 422 },
      );
    }
    const provider = new OpenAICampaignProvider();
    const generated = await provider.planCampaign({
      ...input,
      accountIds: input.accountIds,
    });
    await admin
      .from("ai_runs")
      .update({
        status: "succeeded",
        model: generated.model,
        output: generated.plan,
        usage: { ...generated.usage, responseId: generated.responseId },
      })
      .eq("id", runId);
    await admin
      .from("audit_events")
      .insert({
        id: auditEventId,
        workspace_id: input.workspaceId,
        actor_id: user.id,
        action: "ai.campaign_planned",
        resource_type: "ai_run",
        resource_id: runId,
        metadata: {
          operationId,
          model: generated.model,
          responseId: generated.responseId,
        },
      });
    return Response.json({
      ok: true,
      data: { plan: generated.plan, aiRunId: runId },
      operationId,
      auditEventId,
    });
  } catch (error) {
    if (runId) {
      const admin = getSupabaseAdmin();
      await admin
        .from("ai_runs")
        .update({
          status: "failed",
          error: {
            message:
              error instanceof Error ? error.message : "Unknown AI failure",
          },
        })
        .eq("id", runId);
    }
    if (error instanceof z.ZodError) {
      return Response.json(
        {
          ok: false,
          errors: error.issues.map((issue) => ({
            code: "validation",
            field: issue.path.join("."),
            message: issue.message,
            recoverable: true,
          })),
          operationId,
          auditEventId,
        },
        { status: 400 },
      );
    }
    return authorizationErrorResponse(error);
  }
}
