import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { approvalBlockers, campaignPlanSchema } from "@/lib/v1/domain";
import {
  authorizationErrorResponse,
  requireApiUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";

const inputSchema = z.object({ workspaceId: z.string().uuid() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    const input = inputSchema.parse(await request.json());
    const { id } = await params;
    await requireWorkspaceRole(user.id, input.workspaceId, [
      "owner",
      "admin",
      "reviewer",
    ]);
    const admin = getSupabaseAdmin();
    const [
      { data: campaign, error: campaignError },
      { data: workspace, error: workspaceError },
    ] = await Promise.all([
      admin
        .from("campaigns")
        .select("id,workspace_id,created_by,plan,status")
        .eq("id", id)
        .eq("workspace_id", input.workspaceId)
        .single(),
      admin
        .from("workspaces")
        .select("approval_mode,monthly_spend_ceiling_cents")
        .eq("id", input.workspaceId)
        .single(),
    ]);
    if (campaignError || !campaign)
      return Response.json(
        {
          ok: false,
          errors: [
            {
              code: "not_found",
              message: "Campaign not found.",
              recoverable: false,
            },
          ],
          operationId,
          auditEventId,
        },
        { status: 404 },
      );
    if (workspaceError || !workspace)
      throw workspaceError ?? new Error("Workspace could not be loaded.");
    if (workspace.approval_mode === "team" && campaign.created_by === user.id) {
      return Response.json(
        {
          ok: false,
          errors: [
            {
              code: "separate_approver_required",
              message:
                "Team approval requires a different owner, administrator, or reviewer to approve this campaign.",
              recoverable: true,
            },
          ],
          operationId,
          auditEventId,
        },
        { status: 403 },
      );
    }
    const plan = campaignPlanSchema.parse(campaign.plan);
    const blockers = approvalBlockers(plan);
    const mediaIds = [
      ...new Set(plan.content.flatMap((item) => item.mediaIds)),
    ];
    if (mediaIds.length) {
      const { data: acceptedMedia } = await admin
        .from("media_assets")
        .select("id")
        .eq("workspace_id", input.workspaceId)
        .in("id", mediaIds)
        .eq("moderation_status", "accepted");
      const accepted = new Set((acceptedMedia ?? []).map((item) => item.id));
      for (const id of mediaIds)
        if (!accepted.has(id))
          blockers.push(`Creative media ${id} has not passed moderation`);
    }
    if (
      plan.dailyBudgetCents &&
      workspace.monthly_spend_ceiling_cents &&
      plan.dailyBudgetCents * 31 > workspace.monthly_spend_ceiling_cents
    )
      blockers.push(
        "The projected monthly budget exceeds the workspace spend ceiling",
      );
    if (blockers.length) {
      return Response.json(
        {
          ok: false,
          errors: blockers.map((message) => ({
            code: "approval_blocked",
            message,
            recoverable: true,
          })),
          operationId,
          auditEventId,
        },
        { status: 409 },
      );
    }
    const { data: items, error: itemsError } = await admin
      .from("content_items")
      .select("id,current_version_id")
      .eq("campaign_id", id)
      .eq("workspace_id", input.workspaceId);
    if (itemsError) throw itemsError;
    if (!items?.length || items.some((item) => !item.current_version_id))
      throw new Error("Campaign content versions are incomplete.");
    const approvals = items.map((item) => ({
      workspace_id: input.workspaceId,
      campaign_id: id,
      content_version_id: item.current_version_id,
      decision: "approved",
      decided_by: user.id,
    }));
    const { error: approvalError } = await admin
      .from("approvals")
      .insert(approvals);
    if (approvalError) throw approvalError;
    await admin
      .from("content_items")
      .update({ status: "approved" })
      .eq("campaign_id", id)
      .eq("workspace_id", input.workspaceId);
    await admin.from("campaigns").update({ status: "approved" }).eq("id", id);
    await admin
      .from("audit_events")
      .insert({
        id: auditEventId,
        workspace_id: input.workspaceId,
        actor_id: user.id,
        action: "campaign.approved",
        resource_type: "campaign",
        resource_id: id,
        metadata: {
          operationId,
          contentVersionIds: items.map((item) => item.current_version_id),
          approvalMode: workspace.approval_mode,
        },
      });
    return Response.json({
      ok: true,
      data: { campaignId: id, approvedVersions: items.length },
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
