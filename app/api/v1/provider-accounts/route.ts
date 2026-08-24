import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PROVIDER_KEYS } from "@/lib/v1/domain";
import {
  authorizationErrorResponse,
  requireApiUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";

const schema = z.object({
  workspaceId: z.string().uuid(),
  providerKey: z.enum(PROVIDER_KEYS),
  selectedAccountIds: z.array(z.string().uuid()).max(50),
  metaPageAccountId: z.string().uuid().nullable().optional(),
});

export async function PATCH(request: Request) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    const input = schema.parse(await request.json());
    await requireWorkspaceRole(user.id, input.workspaceId, ["owner", "admin"]);
    const admin = getSupabaseAdmin();
    const { data: accounts, error } = await admin
      .from("provider_accounts")
      .select("id,external_id,account_type,capabilities")
      .eq("workspace_id", input.workspaceId)
      .eq("provider_key", input.providerKey);
    if (error) throw error;
    const validIds = new Set((accounts ?? []).map((account) => account.id));
    if (input.selectedAccountIds.some((id) => !validIds.has(id)))
      return Response.json(
        {
          ok: false,
          errors: [
            {
              code: "invalid_account",
              message:
                "One or more accounts do not belong to this provider connection.",
              recoverable: true,
            },
          ],
          operationId,
          auditEventId,
        },
        { status: 400 },
      );
    const selectedAdAccounts = (accounts ?? []).filter(
      (account) =>
        input.selectedAccountIds.includes(account.id) &&
        account.account_type === "ad_account",
    );
    const ineligible = (accounts ?? []).find(
      (account) =>
        input.selectedAccountIds.includes(account.id) &&
        (account.capabilities as Record<string, unknown> | null)?.manager === true,
    );
    if (ineligible)
      return Response.json(
        {
          ok: false,
          errors: [{ code: "account_ineligible", message: `${ineligible.external_id} is a manager account. Choose an eligible client ad account.`, recoverable: true }],
          operationId,
          auditEventId,
        },
        { status: 409 },
      );
    const metaPage = input.metaPageAccountId
      ? (accounts ?? []).find(
          (account) =>
            account.id === input.metaPageAccountId &&
            account.account_type === "facebook_page",
        )
      : null;
    if (
      input.providerKey === "meta_business" &&
      selectedAdAccounts.length > 0 &&
      !metaPage
    )
      return Response.json(
        {
          ok: false,
          errors: [{ code: "meta_page_required", field: "metaPageAccountId", message: "Choose the Facebook Page that will be the visible identity for Meta ads.", recoverable: true }],
          operationId,
          auditEventId,
        },
        { status: 409 },
      );
    await admin
      .from("provider_accounts")
      .update({ selected: false })
      .eq("workspace_id", input.workspaceId)
      .eq("provider_key", input.providerKey);
    if (input.selectedAccountIds.length)
      await admin
        .from("provider_accounts")
        .update({ selected: true })
        .in("id", input.selectedAccountIds)
        .eq("workspace_id", input.workspaceId);
    if (metaPage)
      for (const account of selectedAdAccounts)
        await admin
          .from("provider_accounts")
          .update({
            capabilities: {
              ...((account.capabilities ?? {}) as Record<string, unknown>),
              pageExternalId: metaPage.external_id,
            },
          })
          .eq("id", account.id)
          .eq("workspace_id", input.workspaceId);
    await admin
      .from("audit_events")
      .insert({
        id: auditEventId,
        workspace_id: input.workspaceId,
        actor_id: user.id,
        action: "provider.accounts_selected",
        resource_type: "provider_account",
        metadata: {
          operationId,
          provider: input.providerKey,
          accountIds: input.selectedAccountIds,
          metaPageAccountId: input.metaPageAccountId ?? null,
        },
      });
    return Response.json({
      ok: true,
      data: { selectedAccountIds: input.selectedAccountIds },
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
