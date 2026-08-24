import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { campaignContentSchema, campaignPlanSchema } from "@/lib/v1/domain";
import {
  authorizationErrorResponse,
  requireApiUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";

const inputSchema = z.object({
  workspaceId: z.string().uuid(),
  content: campaignContentSchema,
  aiRunId: z.string().uuid().nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    const input = inputSchema.parse(await request.json());
    const { id: campaignId, itemId } = await params;
    if (input.content.id !== itemId)
      return Response.json(
        {
          ok: false,
          errors: [{ code: "item_mismatch", field: "content.id", message: "The edited item does not match this route.", recoverable: false }],
          operationId,
          auditEventId,
        },
        { status: 400 },
      );
    await requireWorkspaceRole(user.id, input.workspaceId, [
      "owner",
      "admin",
      "marketer",
    ]);
    const admin = getSupabaseAdmin();
    const [{ data: campaign }, { data: item }] = await Promise.all([
      admin
        .from("campaigns")
        .select("id,plan,status")
        .eq("id", campaignId)
        .eq("workspace_id", input.workspaceId)
        .single(),
      admin
        .from("content_items")
        .select("id,channel_key,current_version_id")
        .eq("id", itemId)
        .eq("campaign_id", campaignId)
        .eq("workspace_id", input.workspaceId)
        .single(),
    ]);
    if (!campaign || !item)
      return Response.json(
        {
          ok: false,
          errors: [{ code: "not_found", message: "Campaign content was not found.", recoverable: false }],
          operationId,
          auditEventId,
        },
        { status: 404 },
      );
    if (item.channel_key !== input.content.channel)
      return Response.json(
        {
          ok: false,
          errors: [{ code: "channel_immutable", field: "content.channel", message: "Create a new campaign item to change its channel.", recoverable: true }],
          operationId,
          auditEventId,
        },
        { status: 409 },
      );

    const plan = campaignPlanSchema.parse(campaign.plan);
    const index = plan.content.findIndex((entry) => entry.id === itemId);
    if (index < 0) throw new Error("The campaign plan no longer contains this item.");
    const { data: currentVersion } = item.current_version_id
      ? await admin
          .from("content_versions")
          .select("version")
          .eq("id", item.current_version_id)
          .single()
      : { data: null };
    const versionId = crypto.randomUUID();
    const version = (currentVersion?.version ?? 0) + 1;
    const { error: versionError } = await admin.from("content_versions").insert({
      id: versionId,
      workspace_id: input.workspaceId,
      content_item_id: itemId,
      version,
      copy: {
        headline: input.content.headline,
        body: input.content.body,
        cta: input.content.cta,
        carouselSlides: input.content.carouselSlides,
        searchHeadlines: input.content.searchHeadlines,
        searchDescriptions: input.content.searchDescriptions,
        searchKeywords: input.content.searchKeywords,
        publishingOptions: input.content.publishingOptions,
      },
      creative_scene: input.content.scene ?? {},
      rendered_media_ids: input.content.mediaIds,
      targeting: input.content.targeting,
      destination_url: input.content.destinationUrl,
      unresolved_fields: input.content.unresolvedFields,
      created_by: user.id,
    });
    if (versionError) throw versionError;

    plan.content[index] = input.content;
    const nextPlan = campaignPlanSchema.parse(plan);
    await admin
      .from("content_items")
      .update({ current_version_id: versionId, status: "draft" })
      .eq("id", itemId);
    await admin
      .from("campaigns")
      .update({ plan: nextPlan, status: "draft" })
      .eq("id", campaignId);

    if (item.current_version_id) {
      const { data: schedules } = await admin
        .from("schedules")
        .select("id,publish_job_id")
        .eq("content_version_id", item.current_version_id)
        .in("status", ["pending", "queued"]);
      const scheduleIds = (schedules ?? []).map((entry) => entry.id);
      const jobIds = (schedules ?? [])
        .map((entry) => entry.publish_job_id)
        .filter((value): value is string => Boolean(value));
      if (scheduleIds.length)
        await admin.from("schedules").update({ status: "cancelled" }).in("id", scheduleIds);
      if (jobIds.length)
        await admin.from("publish_jobs").update({ status: "cancelled" }).in("id", jobIds);
    }

    await admin.from("audit_events").insert({
      id: auditEventId,
      workspace_id: input.workspaceId,
      actor_id: user.id,
      action: "content.version_created",
      resource_type: "content_version",
      resource_id: versionId,
      metadata: {
        operationId,
        campaignId,
        contentItemId: itemId,
        version,
        approvalInvalidated: campaign.status === "approved",
        previousVersionId: item.current_version_id,
      },
    });
    if (input.aiRunId)
      await admin
        .from("ai_runs")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", input.aiRunId)
        .eq("workspace_id", input.workspaceId)
        .eq("campaign_id", campaignId);
    return Response.json({
      ok: true,
      data: { campaignId, contentItemId: itemId, versionId, version, approvalInvalidated: true },
      operationId,
      auditEventId,
    });
  } catch (error) {
    if (error instanceof z.ZodError)
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
    return authorizationErrorResponse(error);
  }
}
