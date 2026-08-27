import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  authorizationErrorResponse,
  requireApiUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";
import { paidAdapter } from "@/server/v1/adapters/paid";
import type { PausedResources } from "@/server/v1/adapters/contracts";
import {
  buildPaidInput,
  campaignPlanHash,
  loadApprovedCampaign,
  paidChannels,
  preflightPaidDestinations,
} from "@/server/v1/launch";
import { loadProviderAccountContext } from "@/server/v1/provider-context";
import { enqueueOrganicPublish } from "@/server/v1/queues";
import { enqueueMessageBatch } from "@/server/v1/queues";
import { messagingChannels, preflightMessagingDestinations } from "@/server/v1/messaging-launch";

const schema = z.object({
  workspaceId: z.string().uuid(),
  proposalOperationId: z.string().uuid(),
  confirmed: z.literal(true),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  const created: Array<{
    deploymentId: string;
    accountId: string;
    provider: Parameters<typeof paidAdapter>[0];
    resources: PausedResources;
    activated: boolean;
  }> = [];
  const createdScheduleIds: string[] = [];
  const createdPublishJobIds: string[] = [];
  const createdMessageBatchIds: string[] = [];
  let workspaceIdForCompensation = "";
  try {
    const user = await requireApiUser(request);
    const input = schema.parse(await request.json());
    workspaceIdForCompensation = input.workspaceId;
    const { id } = await params;
    await requireWorkspaceRole(user.id, input.workspaceId, [
      "owner",
      "admin",
      "marketer",
    ]);
    const admin = getSupabaseAdmin();
    const { plan } = await loadApprovedCampaign(input.workspaceId, id);
    const { data: proposal } = await admin
      .from("operations")
      .select("id,request,status")
      .eq("id", input.proposalOperationId)
      .eq("workspace_id", input.workspaceId)
      .eq("campaign_id", id)
      .eq("kind", "campaign.launch.proposal")
      .single();
    if (!proposal || proposal.status !== "pending")
      return Response.json(
        {
          ok: false,
          errors: [
            {
              code: "proposal_invalid",
              message:
                "This launch confirmation is missing, expired, or already used. Run preflight again.",
              recoverable: true,
            },
          ],
          operationId,
          auditEventId,
        },
        { status: 409 },
      );
    const expectedHash = (proposal.request as Record<string, unknown>).planHash;
    if (expectedHash !== (await campaignPlanHash(plan)))
      return Response.json(
        {
          ok: false,
          errors: [
            {
              code: "campaign_changed",
              message:
                "The campaign changed after preflight. Review and approve the new version, then run preflight again.",
              recoverable: true,
            },
          ],
          operationId,
          auditEventId,
        },
        { status: 409 },
      );
    const [validations, messagingValidations] = await Promise.all([
      preflightPaidDestinations(input.workspaceId, plan),
      preflightMessagingDestinations(input.workspaceId, plan),
    ]);
    if ([...validations, ...messagingValidations].some((result) => !result.valid))
      return Response.json(
        {
          ok: false,
          errors: [...validations, ...messagingValidations].flatMap((result) =>
            result.errors.map((error) => ({ ...error, recoverable: true })),
          ),
          operationId,
          auditEventId,
        },
        { status: 409 },
      );
    const idempotencyKey = `campaign-launch:${id}:${input.proposalOperationId}`;
    const existing = await admin
      .from("operations")
      .select("id,status,result,error")
      .eq("workspace_id", input.workspaceId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing.data)
      return Response.json({
        ok: existing.data.status === "succeeded",
        data: existing.data.result,
        errors: existing.data.error ? [existing.data.error] : undefined,
        operationId: existing.data.id,
        auditEventId,
      });
    await admin
      .from("operations")
      .insert({
        id: operationId,
        workspace_id: input.workspaceId,
        campaign_id: id,
        kind: "campaign.launch",
        idempotency_key: idempotencyKey,
        status: "running",
        requested_by: user.id,
        request: proposal.request,
        started_at: new Date().toISOString(),
      });
    await admin
      .from("operations")
      .update({ status: "succeeded", completed_at: new Date().toISOString() })
      .eq("id", input.proposalOperationId);

    for (const item of plan.content.filter((content) =>
      paidChannels.has(content.channel),
    )) {
      const context = await loadProviderAccountContext(
        input.workspaceId,
        item.accountId!,
      );
      const adapter = paidAdapter(context.provider);
      const providerInput = await buildPaidInput(
        input.workspaceId,
        plan,
        item,
        context,
      );
      const resources = await adapter.createPaused(context, providerInput);
      const deploymentId = crypto.randomUUID();
      await admin
        .from("campaign_deployments")
        .insert({
          id: deploymentId,
          workspace_id: input.workspaceId,
          campaign_id: id,
          operation_id: operationId,
          provider_account_id: item.accountId,
          channel_key: item.channel,
          external_campaign_id: resources.campaignId,
          external_resource_ids: resources.resourceIds,
          status: "paused",
          provider_request_id: resources.providerRequestId ?? null,
        });
      created.push({
        deploymentId,
        accountId: item.accountId!,
        provider: context.provider,
        resources,
        activated: false,
      });
    }

    for (const deployed of created) {
      const context = await loadProviderAccountContext(
        input.workspaceId,
        deployed.accountId,
      );
      await paidAdapter(deployed.provider).activate(
        context,
        deployed.resources,
      );
      deployed.activated = true;
      await admin
        .from("campaign_deployments")
        .update({ status: "active" })
        .eq("id", deployed.deploymentId);
    }

    const { data: itemRows } = await admin
      .from("content_items")
      .select("id,current_version_id,channel_key")
      .eq("campaign_id", id)
      .eq("workspace_id", input.workspaceId);
    const messaging = plan.content.filter((item) => messagingChannels.has(item.channel));
    for (const item of messaging) {
      const row = itemRows?.find(
        (candidate) => candidate.id === item.id && candidate.current_version_id,
      );
      if (!row?.current_version_id || !item.accountId || !item.messaging?.audienceId)
        throw new Error(`Messaging delivery for ${item.channel} is incomplete.`);
      const batchId = crypto.randomUUID();
      const runAfter = item.scheduledFor ?? plan.startsAt;
      await admin.from("message_batches").insert({
        id: batchId,
        workspace_id: input.workspaceId,
        campaign_id: id,
        content_version_id: row.current_version_id,
        provider_account_id: item.accountId,
        list_id: item.messaging.audienceId,
        channel: item.channel,
        status: "queued",
        scheduled_for: runAfter,
        idempotency_key: `messaging:${row.current_version_id}:${item.accountId}:${item.messaging.audienceId}`,
        eligible_count: item.messaging.estimatedRecipients,
        created_by: user.id,
      });
      createdMessageBatchIds.push(batchId);
      await enqueueMessageBatch(batchId, runAfter);
    }
    const organic = plan.content.filter(
      (item) => !paidChannels.has(item.channel) && !messagingChannels.has(item.channel),
    );
    for (const item of organic) {
      const row = itemRows?.find(
        (candidate) =>
          candidate.id === item.id &&
          candidate.current_version_id,
      );
      if (!row?.current_version_id || !item.accountId)
        throw new Error(`Organic delivery for ${item.channel} is incomplete.`);
      const scheduleId = crypto.randomUUID();
      const jobId = crypto.randomUUID();
      const runAfter = item.scheduledFor ?? plan.startsAt;
      await admin
        .from("schedules")
        .insert({
          id: scheduleId,
          workspace_id: input.workspaceId,
          campaign_id: id,
          content_version_id: row.current_version_id,
          provider_account_id: item.accountId,
          scheduled_for: runAfter,
          status: "queued",
          created_by: user.id,
        });
      createdScheduleIds.push(scheduleId);
      await admin
        .from("publish_jobs")
        .insert({
          id: jobId,
          workspace_id: input.workspaceId,
          schedule_id: scheduleId,
          idempotency_key: `organic:${row.current_version_id}:${item.accountId}`,
          status: "queued",
          run_after: runAfter,
        });
      createdPublishJobIds.push(jobId);
      await admin
        .from("schedules")
        .update({ publish_job_id: jobId })
        .eq("id", scheduleId);
      await enqueueOrganicPublish(jobId, runAfter);
    }
    const campaignStatus = created.length
      ? "live"
      : organic.length || messaging.length
        ? "scheduled"
        : "completed";
    await admin
      .from("campaigns")
      .update({ status: campaignStatus })
      .eq("id", id);
    const result = {
      campaignId: id,
      status: campaignStatus,
      deployments: created.map((item) => ({
        deploymentId: item.deploymentId,
        provider: item.provider,
        campaignId: item.resources.campaignId,
      })),
      scheduledOrganic: organic.length,
      scheduledMessaging: messaging.length,
    };
    await admin
      .from("operations")
      .update({
        status: "succeeded",
        result,
        completed_at: new Date().toISOString(),
      })
      .eq("id", operationId);
    await admin
      .from("audit_events")
      .insert({
        id: auditEventId,
        workspace_id: input.workspaceId,
        actor_id: user.id,
        action: "campaign.launched",
        resource_type: "campaign",
        resource_id: id,
        operation_id: operationId,
        metadata: result,
      });
    return Response.json({ ok: true, data: result, operationId, auditEventId });
  } catch (error) {
    const admin = getSupabaseAdmin();
    const compensationErrors: string[] = [];
    if (createdMessageBatchIds.length)
      await admin.from("message_batches").update({ status: "cancelled" }).in("id", createdMessageBatchIds);
    if (createdPublishJobIds.length)
      await admin
        .from("publish_jobs")
        .update({ status: "cancelled" })
        .in("id", createdPublishJobIds);
    if (createdScheduleIds.length)
      await admin
        .from("schedules")
        .update({ status: "cancelled" })
        .in("id", createdScheduleIds);
    for (const deployed of created.filter((item) => item.activated).reverse()) {
      try {
        const context = await loadProviderAccountContext(
          workspaceIdForCompensation,
          deployed.accountId,
        );
        await paidAdapter(deployed.provider).pause(context, deployed.resources);
        await admin
          .from("campaign_deployments")
          .update({ status: "paused_after_failure" })
          .eq("id", deployed.deploymentId);
      } catch (cause) {
        compensationErrors.push(
          cause instanceof Error ? cause.message : "Compensating pause failed",
        );
        await admin
          .from("campaign_deployments")
          .update({
            status: "needs_attention",
            error: {
              message:
                "Automatic pause failed. Manual provider action is required.",
            },
          })
          .eq("id", deployed.deploymentId);
      }
    }
    const message =
      error instanceof Error ? error.message : "Campaign launch failed.";
    await admin
      .from("operations")
      .update({
        status: compensationErrors.length ? "needs_attention" : "failed",
        error: { code: "launch_failed", message, compensationErrors },
        completed_at: new Date().toISOString(),
      })
      .eq("id", operationId);
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
    return authorizationErrorResponse(
      compensationErrors.length
        ? new Error(
            `${message} Automatic compensation was incomplete; manual provider action is required.`,
          )
        : error,
    );
  }
}
