import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { approvalBlockers, campaignPlanSchema } from "@/lib/v1/domain";
import {
  authorizationErrorResponse,
  requireApiUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";

const schema = z
  .object({
    workspaceId: z.string().uuid(),
    decision: z.enum(["approved", "rejected", "changes_requested"]),
    comment: z.string().trim().max(2000).nullable().default(null),
  })
  .superRefine((value, context) => {
    if (value.decision !== "approved" && !value.comment?.trim())
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comment"],
        message: "Explain what needs to change.",
      });
  });

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; itemId: string }> },
) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    const input = schema.parse(await request.json());
    const { id, itemId } = await params;
    await requireWorkspaceRole(user.id, input.workspaceId, [
      "owner",
      "admin",
      "reviewer",
    ]);
    const admin = getSupabaseAdmin();
    const [campaignResult, workspaceResult, itemResult] = await Promise.all([
      admin
        .from("campaigns")
        .select("id,created_by,plan")
        .eq("id", id)
        .eq("workspace_id", input.workspaceId)
        .single(),
      admin
        .from("workspaces")
        .select("approval_mode")
        .eq("id", input.workspaceId)
        .single(),
      admin
        .from("content_items")
        .select("id,current_version_id,status")
        .eq("id", itemId)
        .eq("campaign_id", id)
        .eq("workspace_id", input.workspaceId)
        .single(),
    ]);
    const campaign = campaignResult.data;
    const workspace = workspaceResult.data;
    const item = itemResult.data;
    if (!campaign || !workspace || !item?.current_version_id)
      return Response.json(
        {
          ok: false,
          errors: [
            {
              code: "not_found",
              message: "The current content version was not found.",
              recoverable: false,
            },
          ],
          operationId,
          auditEventId,
        },
        { status: 404 },
      );
    if (
      input.decision === "approved" &&
      workspace.approval_mode === "team" &&
      campaign.created_by === user.id
    )
      return Response.json(
        {
          ok: false,
          errors: [
            {
              code: "separate_approver_required",
              message:
                "Team mode requires another owner, administrator, or reviewer to approve this version.",
              recoverable: true,
            },
          ],
          operationId,
          auditEventId,
        },
        { status: 403 },
      );

    const plan = campaignPlanSchema.parse(campaign.plan);
    const planItem = plan.content.find((content) => content.id === itemId);
    if (!planItem) throw new Error("Campaign plan and content record do not match.");
    if (input.decision === "approved") {
      const blockers = approvalBlockers({ ...plan, content: [planItem] });
      if (planItem.mediaIds.length) {
        const { data: media } = await admin
          .from("media_assets")
          .select("id")
          .eq("workspace_id", input.workspaceId)
          .in("id", planItem.mediaIds)
          .eq("moderation_status", "accepted");
        const accepted = new Set((media ?? []).map((asset) => asset.id));
        for (const mediaId of planItem.mediaIds)
          if (!accepted.has(mediaId))
            blockers.push("Every final creative must pass moderation.");
      }
      if (blockers.length)
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

    await admin.from("approvals").insert({
      workspace_id: input.workspaceId,
      campaign_id: id,
      content_version_id: item.current_version_id,
      decision: input.decision,
      comment: input.comment,
      decided_by: user.id,
    });
    const contentStatus =
      input.decision === "approved"
        ? "approved"
        : input.decision === "rejected"
          ? "rejected"
          : "in_review";
    await admin
      .from("content_items")
      .update({ status: contentStatus })
      .eq("id", itemId);

    if (input.decision !== "approved") {
      const { data: schedules } = await admin
        .from("schedules")
        .select("id,publish_job_id")
        .eq("content_version_id", item.current_version_id)
        .in("status", ["pending", "queued"]);
      const jobIds = (schedules ?? [])
        .map((schedule) => schedule.publish_job_id)
        .filter((value): value is string => Boolean(value));
      if (jobIds.length)
        await admin
          .from("publish_jobs")
          .update({ status: "cancelled" })
          .in("id", jobIds);
      if (schedules?.length)
        await admin
          .from("schedules")
          .update({ status: "cancelled" })
          .in(
            "id",
            schedules.map((schedule) => schedule.id),
          );
    }

    const { data: campaignItems } = await admin
      .from("content_items")
      .select("id,status")
      .eq("campaign_id", id);
    const allApproved = Boolean(
      campaignItems?.length &&
        campaignItems.every((content) => content.status === "approved"),
    );
    await admin
      .from("campaigns")
      .update({ status: allApproved ? "approved" : "in_review" })
      .eq("id", id);
    await admin.from("audit_events").insert({
      id: auditEventId,
      workspace_id: input.workspaceId,
      actor_id: user.id,
      action: `content.${input.decision}`,
      resource_type: "content_version",
      resource_id: item.current_version_id,
      metadata: { operationId, campaignId: id, contentItemId: itemId },
    });
    return Response.json({
      ok: true,
      data: { contentItemId: itemId, status: contentStatus, allApproved },
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
