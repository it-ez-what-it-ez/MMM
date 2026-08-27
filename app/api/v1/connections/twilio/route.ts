import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encryptCredential } from "@/server/v1/credentials";
import { authorizationErrorResponse, requireApiUser, requireWorkspaceRole } from "@/server/v1/auth";
import { getProviderReadiness } from "@/server/v1/provider-platform";

const schema = z.object({
  workspaceId: z.string().uuid(),
  accountSid: z.string().regex(/^AC[0-9a-f]{32}$/i),
  apiKeySid: z.string().regex(/^SK[0-9a-f]{32}$/i),
  apiKeySecret: z.string().min(20).max(200),
  authToken: z.string().min(20).max(200),
  messagingServiceSid: z.string().regex(/^MG[0-9a-f]{32}$/i),
});

function basic(sid: string, secret: string) {
  return `Basic ${Buffer.from(`${sid}:${secret}`).toString("base64")}`;
}

async function twilioJson(url: string, authorization: string) {
  const response = await fetch(url, { headers: { Authorization: authorization, Accept: "application/json" } });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(typeof body.message === "string" ? body.message : `Twilio returned ${response.status}.`);
  return body;
}

export async function POST(request: Request) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    const input = schema.parse(await request.json());
    await requireWorkspaceRole(user.id, input.workspaceId, ["owner", "admin"]);
    const readiness = await getProviderReadiness("twilio_messaging");
    if (!readiness.ready)
      return Response.json({ ok: false, errors: [{ code: "provider_unavailable", message: readiness.reason ?? "Twilio Messaging is not ready.", recoverable: true }], operationId, auditEventId }, { status: 503 });

    const authorization = basic(input.apiKeySid, input.apiKeySecret);
    const [account, webhookAccount, service, a2p] = await Promise.all([
      twilioJson(`https://api.twilio.com/2010-04-01/Accounts/${input.accountSid}.json`, authorization),
      twilioJson(`https://api.twilio.com/2010-04-01/Accounts/${input.accountSid}.json`, basic(input.accountSid, input.authToken)),
      twilioJson(`https://messaging.twilio.com/v1/Services/${input.messagingServiceSid}`, authorization),
      twilioJson(`https://messaging.twilio.com/v1/Services/${input.messagingServiceSid}/Compliance/Usa2p`, authorization).catch(() => ({ compliance: [] })),
    ]);
    if (String(account.sid ?? "") !== input.accountSid || String(webhookAccount.sid ?? "") !== input.accountSid)
      throw new Error("The API key or webhook-validation Auth Token does not belong to the supplied Twilio account.");
    const campaigns = Array.isArray(a2p.compliance) ? a2p.compliance as Array<Record<string, unknown>> : [];
    const a2pStatus = campaigns.some((campaign) => campaign.campaign_status === "VERIFIED")
      ? "VERIFIED"
      : String(campaigns[0]?.campaign_status ?? "NOT_REGISTERED");

    const admin = getSupabaseAdmin();
    const existing = await admin.from("provider_connections").select("id").eq("workspace_id", input.workspaceId).eq("provider_key", "twilio_messaging").eq("external_user_id", input.accountSid).maybeSingle();
    const connectionId = existing.data?.id ?? crypto.randomUUID();
    const encrypted = await encryptCredential({
      accountSid: input.accountSid,
      apiKeySid: input.apiKeySid,
      apiKeySecret: input.apiKeySecret,
      authToken: input.authToken,
      messagingServiceSid: input.messagingServiceSid,
    });
    const { error: connectionError } = await admin.from("provider_connections").upsert({
      id: connectionId,
      workspace_id: input.workspaceId,
      provider_key: "twilio_messaging",
      status: "connected",
      external_user_id: input.accountSid,
      granted_scopes: ["messages:create", "messages:read"],
      health_checked_at: new Date().toISOString(),
      health_error: a2pStatus === "VERIFIED" ? null : { code: "usa2p_not_verified", status: a2pStatus },
      connected_by: user.id,
    });
    if (connectionError) throw connectionError;
    const { error: credentialError } = await admin.schema("private").from("provider_credentials").upsert({
      connection_id: connectionId,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      key_version: encrypted.keyVersion,
    });
    if (credentialError) throw credentialError;
    const { data: providerAccount, error: accountError } = await admin.from("provider_accounts").upsert({
      workspace_id: input.workspaceId,
      connection_id: connectionId,
      provider_key: "twilio_messaging",
      external_id: input.messagingServiceSid,
      account_type: "messaging_service",
      name: String(service.friendly_name ?? "Twilio Messaging Service"),
      billing_status: String(account.status ?? "unknown"),
      capabilities: { sms: true, statusCallbacks: true, inboundOptOut: true, usa2pCampaignStatus: a2pStatus },
      selected: true,
    }, { onConflict: "connection_id,external_id,account_type" }).select("id").single();
    if (accountError) throw accountError;
    await admin.from("audit_events").insert({ id: auditEventId, workspace_id: input.workspaceId, actor_id: user.id, action: "provider.authorized", resource_type: "provider_connection", resource_id: connectionId, metadata: { operationId, provider: "twilio_messaging", messagingServiceSid: input.messagingServiceSid, usa2pCampaignStatus: a2pStatus } });
    return Response.json({ ok: true, data: { connectionId, providerAccountId: providerAccount.id, accountName: account.friendly_name, messagingServiceName: service.friendly_name, usa2pCampaignStatus: a2pStatus }, operationId, auditEventId });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ ok: false, errors: error.issues.map((issue) => ({ code: "validation", field: issue.path.join("."), message: issue.message, recoverable: true })), operationId, auditEventId }, { status: 400 });
    return authorizationErrorResponse(error);
  }
}
