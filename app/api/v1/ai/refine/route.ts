import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CHANNEL_KEYS } from "@/lib/v1/domain";
import { OpenAICampaignProvider, moderateText } from "@/server/v1/ai-provider";
import { sha256 } from "@/server/v1/credentials";
import {
  authorizationErrorResponse,
  requireApiUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";

const schema = z.object({
  workspaceId: z.string().uuid(),
  campaignId: z.string().uuid(),
  contentItemId: z.string().uuid(),
  channel: z.enum(CHANNEL_KEYS),
  instruction: z.string().trim().min(3).max(1000),
  current: z.object({
    headline: z.string().min(1).max(500),
    body: z.string().min(1).max(5000),
    cta: z.string().min(1).max(100),
  }),
  brandSummary: z.string().max(5000).default(""),
});

export async function POST(request: Request) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  let runId: string | null = null;
  try {
    const user = await requireApiUser(request);
    const input = schema.parse(await request.json());
    await requireWorkspaceRole(user.id, input.workspaceId, ["owner", "admin", "marketer"]);
    const admin = getSupabaseAdmin();
    const { data: item } = await admin
      .from("content_items")
      .select("id,channel_key")
      .eq("id", input.contentItemId)
      .eq("campaign_id", input.campaignId)
      .eq("workspace_id", input.workspaceId)
      .single();
    if (!item || item.channel_key !== input.channel)
      return Response.json(
        { ok: false, errors: [{ code: "not_found", message: "Campaign content was not found.", recoverable: false }], operationId, auditEventId },
        { status: 404 },
      );
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [{ data: workspace }, { count }] = await Promise.all([
      admin.from("workspaces").select("ai_monthly_limit").eq("id", input.workspaceId).single(),
      admin.from("ai_runs").select("id", { count: "exact", head: true }).eq("workspace_id", input.workspaceId).gte("created_at", monthStart.toISOString()),
    ]);
    if (!workspace || (count ?? 0) >= workspace.ai_monthly_limit)
      return Response.json(
        { ok: false, errors: [{ code: "ai_limit", message: "This workspace has reached its monthly AI generation limit. Manual editing remains available.", recoverable: true }], operationId, auditEventId },
        { status: 429 },
      );
    const moderation = await moderateText(
      `${input.instruction}\n${input.current.headline}\n${input.current.body}`,
    );
    runId = crypto.randomUUID();
    await admin.from("ai_runs").insert({
      id: runId,
      workspace_id: input.workspaceId,
      campaign_id: input.campaignId,
      kind: "content.refine",
      model: process.env.OPENAI_TEXT_MODEL ?? "gpt-5.4",
      prompt_version: "content-refine-v1",
      input_hash: await sha256(JSON.stringify(input)),
      inputs: input,
      moderation,
      status: moderation.flagged ? "rejected" : "running",
      created_by: user.id,
    });
    if (moderation.flagged)
      return Response.json(
        { ok: false, errors: [{ code: "moderation", message: "This refinement request could not be processed. Edit it and try again.", recoverable: true }], operationId, auditEventId },
        { status: 422 },
      );
    const refined = await new OpenAICampaignProvider().refineCopy(input);
    await admin.from("ai_runs").update({
      status: "succeeded",
      model: refined.model,
      output: { headline: refined.headline, body: refined.body, cta: refined.cta },
      usage: { ...refined.usage, responseId: refined.responseId },
    }).eq("id", runId);
    await admin.from("audit_events").insert({
      id: auditEventId,
      workspace_id: input.workspaceId,
      actor_id: user.id,
      action: "ai.content_refined",
      resource_type: "ai_run",
      resource_id: runId,
      metadata: { operationId, contentItemId: input.contentItemId, responseId: refined.responseId },
    });
    return Response.json({
      ok: true,
      data: { headline: refined.headline, body: refined.body, cta: refined.cta, aiRunId: runId },
      operationId,
      auditEventId,
    });
  } catch (error) {
    if (runId)
      await getSupabaseAdmin().from("ai_runs").update({
        status: "failed",
        error: { message: error instanceof Error ? error.message : "AI refinement failed." },
      }).eq("id", runId);
    if (error instanceof z.ZodError)
      return Response.json(
        { ok: false, errors: error.issues.map((issue) => ({ code: "validation", field: issue.path.join("."), message: issue.message, recoverable: true })), operationId, auditEventId },
        { status: 400 },
      );
    return authorizationErrorResponse(error);
  }
}
