import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  authorizationErrorResponse,
  requireApiUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";
import {
  campaignPlanHash,
  loadApprovedCampaign,
  preflightPaidDestinations,
} from "@/server/v1/launch";
import { preflightMessagingDestinations } from "@/server/v1/messaging-launch";

const schema = z.object({ workspaceId: z.string().uuid() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    const input = schema.parse(await request.json());
    const { id } = await params;
    await requireWorkspaceRole(user.id, input.workspaceId, [
      "owner",
      "admin",
      "marketer",
    ]);
    const { plan } = await loadApprovedCampaign(input.workspaceId, id);
    const [destinations, messaging] = await Promise.all([
      preflightPaidDestinations(input.workspaceId, plan),
      preflightMessagingDestinations(input.workspaceId, plan),
    ]);
    const failed = [...destinations, ...messaging].flatMap((destination) =>
      destination.errors.map((error) => ({
        ...error,
        field: error.field
          ? `${destination.channel}.${error.field}`
          : destination.channel,
      })),
    );
    if (failed.length)
      return Response.json(
        {
          ok: false,
          errors: failed.map((error) => ({ ...error, recoverable: true })),
          operationId,
          auditEventId,
        },
        { status: 409 },
      );
    const admin = getSupabaseAdmin();
    const accountIds = [...new Set(plan.content.map((item) => item.accountId).filter((value): value is string => Boolean(value)))];
    const { data: allAccounts } = accountIds.length
      ? await admin.from("provider_accounts").select("id,name,provider_key,selected").eq("workspace_id", input.workspaceId).in("id", accountIds)
      : { data: [] };
    if ((allAccounts ?? []).length !== accountIds.length || (allAccounts ?? []).some((account) => !account.selected))
      return Response.json({ ok: false, errors: [{ code: "destination_changed", message: "A selected destination account changed after approval. Review the campaign again.", recoverable: true }], operationId, auditEventId }, { status: 409 });
    const summary = {
      campaignId: id,
      campaignName: plan.name,
      planHash: await campaignPlanHash(plan),
      accounts: plan.content.map((item) => {
        const account = (allAccounts ?? []).find((entry) => entry.id === item.accountId)!;
        return { channel: item.channel, provider: account.provider_key, accountId: account.id, accountName: account.name };
      }),
      budget: {
        dailyCents: plan.dailyBudgetCents,
        lifetimeCents: plan.lifetimeBudgetCents,
        currency: plan.currency,
      },
      startsAt: plan.startsAt,
      endsAt: plan.endsAt,
      destinations: [
        ...new Set(plan.content.map((item) => item.destinationUrl)),
      ],
      messaging: messaging.map((destination) => ({
        channel: destination.channel,
        audienceId: destination.audienceId,
        eligibleRecipients: destination.eligibleRecipients,
      })),
    };
    const { error: operationError } = await admin
      .from("operations")
      .insert({
        id: operationId,
        workspace_id: input.workspaceId,
        campaign_id: id,
        kind: "campaign.launch.proposal",
        idempotency_key: `launch-proposal:${id}:${summary.planHash}`,
        status: "pending",
        requested_by: user.id,
        request: summary,
      });
    if (operationError?.code === "23505") {
      const existing = await admin
        .from("operations")
        .select("id,request")
        .eq("workspace_id", input.workspaceId)
        .eq("idempotency_key", `launch-proposal:${id}:${summary.planHash}`)
        .maybeSingle();
      if (existing.data)
        return Response.json({
          ok: true,
          data: {
            proposalOperationId: existing.data.id,
            summary: existing.data.request,
          },
          operationId: existing.data.id,
          auditEventId,
        });
    }
    if (operationError) throw operationError;
    await admin
      .from("audit_events")
      .insert({
        id: auditEventId,
        workspace_id: input.workspaceId,
        actor_id: user.id,
        action: "campaign.launch_proposed",
        resource_type: "campaign",
        resource_id: id,
        operation_id: operationId,
        metadata: summary,
      });
    return Response.json({
      ok: true,
      data: { proposalOperationId: operationId, summary },
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
