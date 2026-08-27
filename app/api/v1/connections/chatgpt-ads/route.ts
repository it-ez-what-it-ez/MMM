import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encryptCredential } from "@/server/v1/credentials";
import {
  authorizationErrorResponse,
  requireApiUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";
import { getProviderReadiness } from "@/server/v1/provider-platform";

const schema = z.object({
  workspaceId: z.string().uuid(),
  apiKey: z.string().min(20).max(500),
});

export async function POST(request: Request) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    const input = schema.parse(await request.json());
    await requireWorkspaceRole(user.id, input.workspaceId, ["owner", "admin"]);
    const readiness = await getProviderReadiness("chatgpt_ads");
    if (!readiness.ready)
      return Response.json(
        {
          ok: false,
          errors: [
            {
              code: "provider_unavailable",
              message: readiness.reason ?? "ChatGPT Ads is not ready.",
              recoverable: true,
            },
          ],
          operationId,
          auditEventId,
        },
        { status: 503 },
      );
    const response = await fetch("https://api.ads.openai.com/v1/ad_account", {
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        Accept: "application/json",
      },
    });
    const account = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok || typeof account.id !== "string")
      throw new Error(
        typeof account.message === "string"
          ? account.message
          : "OpenAI could not verify this Advertiser API key.",
      );
    const review = account.review as Record<string, unknown> | undefined;
    if (account.status !== "active" || review?.status !== "approved")
      return Response.json(
        {
          ok: false,
          errors: [{
            code: "advertiser_not_ready",
            message: "This ChatGPT advertiser account is not active and approved for API delivery yet.",
            recoverable: true,
          }],
          operationId,
          auditEventId,
        },
        { status: 409 },
      );
    const admin = getSupabaseAdmin();
    const existing = await admin
      .from("provider_connections")
      .select("id")
      .eq("workspace_id", input.workspaceId)
      .eq("provider_key", "chatgpt_ads")
      .eq("external_user_id", account.id)
      .maybeSingle();
    const connectionId = existing.data?.id ?? crypto.randomUUID();
    const encrypted = await encryptCredential({ apiKey: input.apiKey });
    const { error: connectionError } = await admin
      .from("provider_connections")
      .upsert({
        id: connectionId,
        workspace_id: input.workspaceId,
        provider_key: "chatgpt_ads",
        status: "connected",
        external_user_id: account.id,
        granted_scopes: ["advertiser_api"],
        health_checked_at: new Date().toISOString(),
        health_error: null,
        connected_by: user.id,
      });
    if (connectionError) throw connectionError;
    const { error: credentialError } = await admin
      .schema("private")
      .from("provider_credentials")
      .upsert({
        connection_id: connectionId,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        key_version: encrypted.keyVersion,
      });
    if (credentialError) throw credentialError;
    const { error: accountError } = await admin
      .from("provider_accounts")
      .upsert(
        {
          workspace_id: input.workspaceId,
          connection_id: connectionId,
          provider_key: "chatgpt_ads",
          external_id: account.id,
          account_type: "ad_account",
          name: String(account.name ?? "ChatGPT Ads account"),
          currency:
            typeof account.currency_code === "string"
              ? account.currency_code
              : null,
          timezone:
            typeof account.timezone === "string" ? account.timezone : null,
          billing_status:
            typeof account.status === "string" ? account.status : null,
          capabilities: {
            campaigns: true,
            adGroups: true,
            files: true,
            ads: true,
            reporting: true,
          },
          selected: true,
        },
        { onConflict: "connection_id,external_id,account_type" },
      );
    if (accountError) throw accountError;
    await admin
      .from("audit_events")
      .insert({
        id: auditEventId,
        workspace_id: input.workspaceId,
        actor_id: user.id,
        action: "provider.authorized",
        resource_type: "provider_connection",
        resource_id: connectionId,
        metadata: {
          operationId,
          provider: "chatgpt_ads",
          adAccountId: account.id,
        },
      });
    return Response.json({
      ok: true,
      data: {
        connectionId,
        account: {
          id: account.id,
          name: account.name,
          status: account.status,
          currency: account.currency_code,
        },
      },
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
