import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ProviderKey } from "@/lib/v1/domain";
import { decryptCredential } from "@/server/v1/credentials";
import type { ProviderAccountContext } from "./adapters/contracts";

export async function loadProviderAccountContext(
  workspaceId: string,
  providerAccountId: string,
): Promise<ProviderAccountContext> {
  const admin = getSupabaseAdmin();
  const { data: account, error: accountError } = await admin
    .from("provider_accounts")
    .select(
      "id,external_id,account_type,name,currency,timezone,capabilities,provider_key,connection_id,selected",
    )
    .eq("id", providerAccountId)
    .eq("workspace_id", workspaceId)
    .single();
  if (accountError || !account)
    throw new Error("The selected provider account no longer exists.");
  if (!account.selected)
    throw new Error("The provider account is not selected for this workspace.");
  const { data: connection, error: connectionError } = await admin
    .from("provider_connections")
    .select("status")
    .eq("id", account.connection_id)
    .eq("workspace_id", workspaceId)
    .single();
  if (connectionError || connection?.status !== "connected")
    throw new Error("The provider connection is not healthy.");
  const { data: encrypted, error: credentialError } = await admin
    .schema("private")
    .from("provider_credentials")
    .select("ciphertext,iv,auth_tag,key_version")
    .eq("connection_id", account.connection_id)
    .single();
  if (credentialError || !encrypted)
    throw new Error(
      "Provider credentials are unavailable. Reconnect the account.",
    );
  const credential = await decryptCredential<{
    accessToken?: string;
    apiKey?: string;
    refreshToken?: string;
    accountSecrets?: Record<string, Record<string, unknown>>;
  }>({
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.auth_tag,
    keyVersion: encrypted.key_version,
  });
  const accessToken = credential.accessToken ?? credential.apiKey;
  if (!accessToken)
    throw new Error(
      "The provider access token is missing. Reconnect the account.",
    );
  const capabilities = (account.capabilities ?? {}) as Record<string, unknown>;
  const pageExternalId =
    account.provider_key === "meta_business" && account.account_type === "ad_account"
      ? capabilities.pageExternalId
      : null;
  const pageSecrets =
    typeof pageExternalId === "string"
      ? credential.accountSecrets?.[pageExternalId] ?? {}
      : {};
  return {
    provider: account.provider_key as ProviderKey,
    accessToken,
    refreshToken: credential.refreshToken,
    account: {
      id: account.id,
      externalId: account.external_id,
      accountType: account.account_type,
      name: account.name,
      currency: account.currency ?? undefined,
      timezone: account.timezone ?? undefined,
      capabilities,
    },
    secrets: {
      ...(credential.accountSecrets?.[account.external_id] ?? {}),
      ...pageSecrets,
      ...(typeof pageExternalId === "string" ? { pageId: pageExternalId } : {}),
    },
  };
}
