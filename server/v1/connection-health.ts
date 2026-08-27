import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { OAuthProviderKey, ProviderKey } from "@/lib/v1/domain";
import { decryptCredential } from "@/server/v1/credentials";
import { discoverProviderAccounts, type TokenSet } from "@/server/v1/provider-oauth";
import { getAppOrigin } from "@/lib/supabase/config";

type StoredCredential = {
  accessToken?: string;
  refreshToken?: string;
  scopes?: string[];
  expiresAt?: string;
  apiKey?: string;
  accountSid?: string;
  apiKeySid?: string;
  apiKeySecret?: string;
  authToken?: string;
  messagingServiceSid?: string;
  fromAddress?: string;
  unsubscribeGroupId?: number;
  eventWebhookPublicKey?: string;
};

function basic(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function json(url: string, init: RequestInit, provider: string) {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const nested = body.error as Record<string, unknown> | undefined;
    throw new Error(
      typeof nested?.message === "string"
        ? nested.message
        : typeof body.message === "string"
          ? body.message
          : `${provider} returned ${response.status}.`,
    );
  }
  return body;
}

async function checkOAuth(
  provider: OAuthProviderKey,
  credential: StoredCredential,
  expectedExternalIds: string[],
) {
  if (!credential.accessToken)
    throw new Error("The provider access token is missing. Reconnect the account.");
  const discovery = await discoverProviderAccounts(provider, {
    accessToken: credential.accessToken,
    refreshToken: credential.refreshToken,
    expiresAt: credential.expiresAt,
    scopes: credential.scopes ?? [],
    raw: {},
  } satisfies TokenSet);
  if (!discovery.externalUserId)
    throw new Error("The provider identity could not be verified.");
  const visible = new Set(discovery.accounts.map((account) => account.externalId));
  const missing = expectedExternalIds.filter((externalId) => !visible.has(externalId));
  if (missing.length)
    throw new Error(
      "A selected destination is no longer accessible with this provider login. Reconnect and choose destinations again.",
    );
  return {
    healthy: true,
    detail: `${discovery.accounts.length} eligible destination${discovery.accounts.length === 1 ? "" : "s"} visible.`,
  };
}

async function checkChatGPT(credential: StoredCredential) {
  if (!credential.apiKey) throw new Error("The Advertiser API key is missing.");
  const account = await json(
    "https://api.ads.openai.com/v1/ad_account",
    { headers: { Authorization: `Bearer ${credential.apiKey}`, Accept: "application/json" } },
    "ChatGPT Ads",
  );
  const review = account.review as Record<string, unknown> | undefined;
  if (account.status !== "active" || review?.status !== "approved")
    throw new Error("The ChatGPT advertiser account is not active and approved.");
  return { healthy: true, detail: "The advertiser account is active and approved." };
}

async function checkTwilio(
  credential: StoredCredential,
  accountId: string | null,
  connectionId: string,
  requiresUsA2p: boolean,
) {
  if (
    !credential.accountSid ||
    !credential.apiKeySid ||
    !credential.apiKeySecret ||
    !credential.messagingServiceSid
  )
    throw new Error("The Twilio connection is missing required credentials.");
  const authorization = basic(credential.apiKeySid, credential.apiKeySecret);
  const [account, service, a2p] = await Promise.all([
    json(
      `https://api.twilio.com/2010-04-01/Accounts/${credential.accountSid}.json`,
      { headers: { Authorization: authorization, Accept: "application/json" } },
      "Twilio",
    ),
    json(
      `https://messaging.twilio.com/v1/Services/${credential.messagingServiceSid}`,
      { headers: { Authorization: authorization, Accept: "application/json" } },
      "Twilio",
    ),
    json(
      `https://messaging.twilio.com/v1/Services/${credential.messagingServiceSid}/Compliance/Usa2p`,
      { headers: { Authorization: authorization, Accept: "application/json" } },
      "Twilio",
    ).catch(() => ({ compliance: [] })),
  ]);
  if (String(account.status ?? "").toLowerCase() !== "active")
    throw new Error("The Twilio account is not active.");
  const campaigns = Array.isArray(a2p.compliance)
    ? (a2p.compliance as Array<Record<string, unknown>>)
    : [];
  const usa2pCampaignStatus = campaigns.some(
    (campaign) => campaign.campaign_status === "VERIFIED",
  )
    ? "VERIFIED"
    : String(campaigns[0]?.campaign_status ?? "NOT_REGISTERED");
  const expectedInboundWebhook = `${getAppOrigin()}/api/v1/webhooks/twilio/${connectionId}`;
  const inboundWebhookConfigured =
    service.inbound_request_url === expectedInboundWebhook &&
    String(service.inbound_method ?? "POST").toUpperCase() === "POST";
  if (accountId) {
    const admin = getSupabaseAdmin();
    const { data: row } = await admin
      .from("provider_accounts")
      .select("capabilities")
      .eq("id", accountId)
      .single();
    await admin
      .from("provider_accounts")
      .update({
        name: String(service.friendly_name ?? "Twilio Messaging Service"),
        billing_status: String(account.status),
        capabilities: {
          ...((row?.capabilities ?? {}) as Record<string, unknown>),
          usa2pCampaignStatus,
          inboundWebhookConfigured,
          inboundWebhookUrl: inboundWebhookConfigured ? expectedInboundWebhook : null,
        },
      })
      .eq("id", accountId);
  }
  return {
    healthy:
      (!requiresUsA2p || usa2pCampaignStatus === "VERIFIED") &&
      inboundWebhookConfigured,
    warning:
      !inboundWebhookConfigured
        ? "The Messaging Service inbound URL is not the signed GrowthOS STOP webhook. Reconnect and allow automatic webhook configuration."
        : requiresUsA2p && usa2pCampaignStatus !== "VERIFIED"
          ? `US 10DLC registration is ${usa2pCampaignStatus}. Canadian delivery can still be evaluated separately, but US 10DLC delivery remains blocked.`
          : null,
    detail:
      (!requiresUsA2p || usa2pCampaignStatus === "VERIFIED") && inboundWebhookConfigured
        ? requiresUsA2p
          ? "The Messaging Service is active and its US A2P campaign is verified."
          : `The Messaging Service is active and the signed inbound webhook is configured. US 10DLC remains ${usa2pCampaignStatus} and will still be blocked during preflight if US recipients are added.`
        : `The Messaging Service is active; US A2P status is ${usa2pCampaignStatus} and the signed inbound webhook is ${inboundWebhookConfigured ? "configured" : "missing"}.`,
  };
}

async function checkSendGrid(
  credential: StoredCredential,
  accountId: string | null,
) {
  if (!credential.apiKey || !credential.fromAddress || !credential.unsubscribeGroupId)
    throw new Error("The SendGrid connection is missing sender configuration.");
  const headers = {
    Authorization: `Bearer ${credential.apiKey}`,
    Accept: "application/json",
  };
  const [domains, senders, groups] = await Promise.all([
    json("https://api.sendgrid.com/v3/whitelabel/domains", { headers }, "SendGrid"),
    json("https://api.sendgrid.com/v3/verified_senders", { headers }, "SendGrid"),
    json("https://api.sendgrid.com/v3/asm/groups", { headers }, "SendGrid"),
  ]);
  const emailDomain = credential.fromAddress.split("@")[1]?.toLowerCase() ?? "";
  const domainRows = Array.isArray(domains)
    ? (domains as unknown as Array<Record<string, unknown>>)
    : [];
  const senderRows = Array.isArray(senders.results)
    ? (senders.results as Array<Record<string, unknown>>)
    : [];
  const groupRows = Array.isArray(groups)
    ? (groups as unknown as Array<Record<string, unknown>>)
    : [];
  const domainAuthenticated = domainRows.some(
    (domain) =>
      domain.valid === true &&
      (String(domain.domain ?? "").toLowerCase() === emailDomain ||
        emailDomain.endsWith(`.${String(domain.domain ?? "").toLowerCase()}`)),
  );
  const senderVerified = senderRows.some(
    (sender) =>
      String(
        (sender.from as Record<string, unknown> | undefined)?.email ??
          sender.email ??
          "",
      ).toLowerCase() === credential.fromAddress!.toLowerCase() &&
      sender.verified === true,
  );
  const unsubscribeGroup = groupRows.some(
    (group) => Number(group.id) === credential.unsubscribeGroupId,
  );
  const signedEventWebhook = Boolean(credential.eventWebhookPublicKey);
  if (accountId) {
    const admin = getSupabaseAdmin();
    const { data: row } = await admin
      .from("provider_accounts")
      .select("capabilities")
      .eq("id", accountId)
      .single();
    await admin
      .from("provider_accounts")
      .update({
        capabilities: {
          ...((row?.capabilities ?? {}) as Record<string, unknown>),
          domainAuthenticated,
          senderVerified,
          signedEventWebhook,
          unsubscribeGroupId: credential.unsubscribeGroupId,
        },
      })
      .eq("id", accountId);
  }
  const healthy =
    domainAuthenticated && senderVerified && unsubscribeGroup && signedEventWebhook;
  return {
    healthy,
    warning: healthy
      ? null
      : "The verified sender, authenticated domain, unsubscribe group, or signed Event Webhook needs attention.",
    detail: healthy
      ? "The sender, domain, unsubscribe group, and signed Event Webhook are ready."
      : "One or more SendGrid production-delivery checks failed.",
  };
}

export async function runConnectionHealth(input: {
  workspaceId: string;
  connectionId: string;
}) {
  const admin = getSupabaseAdmin();
  const [{ data: connection, error: connectionError }, { data: encrypted, error: credentialError }] =
    await Promise.all([
      admin
        .from("provider_connections")
        .select("id,provider_key,status")
        .eq("id", input.connectionId)
        .eq("workspace_id", input.workspaceId)
        .single(),
      admin
        .schema("private")
        .from("provider_credentials")
        .select("ciphertext,iv,auth_tag,key_version")
        .eq("connection_id", input.connectionId)
        .single(),
    ]);
  if (connectionError || credentialError || !connection || !encrypted)
    throw new Error("The provider connection or its encrypted credential was not found.");
  const credential = await decryptCredential<StoredCredential>({
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.auth_tag,
    keyVersion: encrypted.key_version,
  });
  const { data: selectedAccounts } = await admin
    .from("provider_accounts")
    .select("id,external_id,capabilities")
    .eq("connection_id", connection.id)
    .eq("selected", true)
    .limit(1);
  const accountId = selectedAccounts?.[0]?.id ?? null;
  const expectedExternalIds = Array.from(
    new Set(
      (selectedAccounts ?? []).flatMap((account) => {
        const pageId = (account.capabilities as Record<string, unknown> | null)
          ?.pageExternalId;
        return [
          account.external_id,
          ...(typeof pageId === "string" ? [pageId] : []),
        ];
      }),
    ),
  );
  const provider = connection.provider_key as ProviderKey;
  const [{ data: messagingSettings }, { data: workspace }] = await Promise.all([
    admin
      .from("messaging_settings")
      .select("default_country")
      .eq("workspace_id", input.workspaceId)
      .maybeSingle(),
    admin
      .from("workspaces")
      .select("currency")
      .eq("id", input.workspaceId)
      .single(),
  ]);
  const requiresUsA2p =
    (messagingSettings?.default_country ??
      (workspace?.currency === "CAD" ? "CA" : "US")) === "US";
  try {
    const result: {
      healthy: boolean;
      detail: string;
      warning?: string | null;
    } =
      provider === "chatgpt_ads"
        ? await checkChatGPT(credential)
        : provider === "twilio_messaging"
          ? await checkTwilio(
              credential,
              accountId,
              connection.id,
              requiresUsA2p,
            )
          : provider === "sendgrid_email"
            ? await checkSendGrid(credential, accountId)
            : await checkOAuth(
                provider as OAuthProviderKey,
                credential,
                expectedExternalIds,
              );
    const healthError = result.healthy
      ? null
      : { code: "provider_setup_incomplete", message: result.warning };
    await admin
      .from("provider_connections")
      .update({
        status: result.healthy ? "connected" : "degraded",
        health_checked_at: new Date().toISOString(),
        health_error: healthError,
      })
      .eq("id", connection.id);
    return { provider, ...result };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Provider health check failed.";
    await admin
      .from("provider_connections")
      .update({
        status: "degraded",
        health_checked_at: new Date().toISOString(),
        health_error: { code: "provider_health_failed", message },
      })
      .eq("id", connection.id);
    throw new Error(message);
  }
}
