import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAppOrigin } from "@/lib/supabase/config";
import { encryptCredential } from "@/server/v1/credentials";
import { authorizationErrorResponse, requireApiUser, requireWorkspaceRole } from "@/server/v1/auth";
import { getProviderReadiness } from "@/server/v1/provider-platform";

const schema = z.object({
  workspaceId: z.string().uuid(),
  apiKey: z.string().min(20).max(500),
  fromName: z.string().min(1).max(100),
  fromAddress: z.string().email(),
  replyToAddress: z.string().email().nullable().optional(),
  unsubscribeGroupId: z.number().int().positive(),
});

async function sendGridJson(path: string, apiKey: string, init?: RequestInit) {
  const response = await fetch(`https://api.sendgrid.com/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(Array.isArray(body.errors) ? JSON.stringify(body.errors) : `SendGrid returned ${response.status}.`);
  return body;
}

export async function POST(request: Request) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    const input = schema.parse(await request.json());
    await requireWorkspaceRole(user.id, input.workspaceId, ["owner", "admin"]);
    const readiness = await getProviderReadiness("sendgrid_email");
    if (!readiness.ready)
      return Response.json({ ok: false, errors: [{ code: "provider_unavailable", message: readiness.reason ?? "SendGrid is not ready.", recoverable: true }], operationId, auditEventId }, { status: 503 });

    const [profile, domains, senders, groups] = await Promise.all([
      sendGridJson("/user/profile", input.apiKey),
      sendGridJson("/whitelabel/domains", input.apiKey),
      sendGridJson("/verified_senders", input.apiKey),
      sendGridJson("/asm/groups", input.apiKey),
    ]);
    const emailDomain = input.fromAddress.split("@")[1]!.toLowerCase();
    const domainList = Array.isArray(domains) ? domains as Array<Record<string, unknown>> : [];
    const senderList = Array.isArray(senders.results) ? senders.results as Array<Record<string, unknown>> : [];
    const domainAuthenticated = domainList.some((domain) => domain.valid === true && (String(domain.domain ?? "").toLowerCase() === emailDomain || emailDomain.endsWith(`.${String(domain.domain ?? "").toLowerCase()}`)));
    const senderVerified = senderList.some((sender) => String((sender.from as Record<string, unknown> | undefined)?.email ?? sender.email ?? "").toLowerCase() === input.fromAddress.toLowerCase() && sender.verified === true);
    if (!domainAuthenticated || !senderVerified)
      return Response.json({ ok: false, errors: [{ code: "sender_not_ready", message: "Authenticate the sending domain and verify this exact From address in SendGrid before connecting it.", recoverable: true }], operationId, auditEventId }, { status: 409 });
    const groupList = Array.isArray(groups) ? groups as Array<Record<string, unknown>> : [];
    if (!groupList.some((group) => Number(group.id) === input.unsubscribeGroupId))
      return Response.json({ ok: false, errors: [{ code: "unsubscribe_group_missing", field: "unsubscribeGroupId", message: "This SendGrid unsubscribe group was not found.", recoverable: true }], operationId, auditEventId }, { status: 409 });

    const admin = getSupabaseAdmin();
    const externalUserId = String(profile.username ?? profile.user_id ?? input.fromAddress);
    const existing = await admin.from("provider_connections").select("id").eq("workspace_id", input.workspaceId).eq("provider_key", "sendgrid_email").eq("external_user_id", externalUserId).maybeSingle();
    const connectionId = existing.data?.id ?? crypto.randomUUID();
    const eventUrl = `${getAppOrigin()}/api/v1/webhooks/sendgrid/${connectionId}`;
    const settings = await sendGridJson("/user/webhooks/event/settings/all", input.apiKey);
    const webhooks = Array.isArray(settings.webhooks) ? settings.webhooks as Array<Record<string, unknown>> : [];
    const existingWebhook = webhooks.find((entry) => entry.url === eventUrl);
    const webhookBody = { enabled: true, url: eventUrl, friendly_name: `GrowthOS ${connectionId}`, processed: true, delivered: true, bounce: true, dropped: true, deferred: true, spam_report: true, unsubscribe: true, group_unsubscribe: true, open: true, click: true };
    const webhook: Record<string, unknown> = existingWebhook
      ? await sendGridJson(`/user/webhooks/event/settings/${existingWebhook.id}`, input.apiKey, { method: "PATCH", body: JSON.stringify(webhookBody) })
      : await sendGridJson("/user/webhooks/event/settings", input.apiKey, { method: "POST", body: JSON.stringify(webhookBody) });
    const webhookId = String(webhook.id ?? existingWebhook?.id ?? "");
    if (!webhookId) throw new Error("SendGrid did not return an Event Webhook ID.");
    const signed = await sendGridJson(`/user/webhooks/event/settings/signed/${webhookId}`, input.apiKey, { method: "PATCH", body: JSON.stringify({ enabled: true }) });
    if (typeof signed.public_key !== "string") throw new Error("SendGrid did not enable signed Event Webhooks.");

    const encrypted = await encryptCredential({ apiKey: input.apiKey, fromName: input.fromName, fromAddress: input.fromAddress, replyToAddress: input.replyToAddress ?? null, unsubscribeGroupId: input.unsubscribeGroupId, eventWebhookPublicKey: signed.public_key });
    const { error: connectionError } = await admin.from("provider_connections").upsert({ id: connectionId, workspace_id: input.workspaceId, provider_key: "sendgrid_email", status: "connected", external_user_id: externalUserId, granted_scopes: ["mail.send", "sender.verify", "event.webhook"], health_checked_at: new Date().toISOString(), connected_by: user.id });
    if (connectionError) throw connectionError;
    const { error: credentialError } = await admin.schema("private").from("provider_credentials").upsert({ connection_id: connectionId, ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag, key_version: encrypted.keyVersion });
    if (credentialError) throw credentialError;
    const { data: providerAccount, error: accountError } = await admin.from("provider_accounts").upsert({ workspace_id: input.workspaceId, connection_id: connectionId, provider_key: "sendgrid_email", external_id: input.fromAddress.toLowerCase(), account_type: "email_sender", name: `${input.fromName} <${input.fromAddress}>`, billing_status: "active", capabilities: { htmlEmail: true, signedEventWebhook: true, domainAuthenticated: true, unsubscribeGroupId: input.unsubscribeGroupId, fromName: input.fromName, fromAddress: input.fromAddress, replyToAddress: input.replyToAddress ?? null }, selected: true }, { onConflict: "connection_id,external_id,account_type" }).select("id").single();
    if (accountError) throw accountError;
    await admin.from("audit_events").insert({ id: auditEventId, workspace_id: input.workspaceId, actor_id: user.id, action: "provider.authorized", resource_type: "provider_connection", resource_id: connectionId, metadata: { operationId, provider: "sendgrid_email", fromAddress: input.fromAddress, eventWebhookId: webhookId } });
    return Response.json({ ok: true, data: { connectionId, providerAccountId: providerAccount.id, fromAddress: input.fromAddress, domainAuthenticated: true, signedEventWebhook: true }, operationId, auditEventId });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ ok: false, errors: error.issues.map((issue) => ({ code: "validation", field: issue.path.join("."), message: issue.message, recoverable: true })), operationId, auditEventId }, { status: 400 });
    return authorizationErrorResponse(error);
  }
}
