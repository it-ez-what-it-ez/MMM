import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { OAuthProviderKey } from "@/lib/v1/domain";
import { decryptCredential, encryptCredential } from "@/server/v1/credentials";
import {
  refreshAuthorizationTokens,
  type TokenSet,
} from "@/server/v1/provider-oauth";

type CredentialPayload = {
  accessToken: string;
  refreshToken?: string;
  scopes?: string[];
  expiresAt?: string;
  accountSecrets?: Record<string, unknown>;
};

function authorized(request: Request) {
  const configured = process.env.GROWTHOS_WORKER_SECRET?.trim();
  const provided = request.headers.get("x-growthos-worker-secret");
  return Boolean(configured && provided && configured.length >= 32 && configured === provided);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ ok: false }, { status: 401 });
  const admin = getSupabaseAdmin();
  const threshold = new Date(Date.now() + 30 * 60_000).toISOString();
  const { data: connections, error } = await admin
    .from("provider_connections")
    .select("id,workspace_id,provider_key,token_expires_at,status")
    .in("status", ["connected", "degraded"])
    .neq("provider_key", "chatgpt_ads")
    .not("token_expires_at", "is", null)
    .lte("token_expires_at", threshold)
    .limit(50);
  if (error) throw error;
  const results: Array<{ connectionId: string; status: string; error?: string }> = [];
  for (const connection of connections ?? []) {
    try {
      const { data: row, error: credentialError } = await admin
        .schema("private")
        .from("provider_credentials")
        .select("ciphertext,iv,auth_tag,key_version")
        .eq("connection_id", connection.id)
        .single();
      if (credentialError || !row) throw new Error("Encrypted credentials are missing.");
      const current = await decryptCredential<CredentialPayload>({
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.auth_tag,
        keyVersion: row.key_version,
      });
      const refreshed = await refreshAuthorizationTokens(
        connection.provider_key as OAuthProviderKey,
        {
          accessToken: current.accessToken,
          refreshToken: current.refreshToken,
          expiresAt: current.expiresAt ?? connection.token_expires_at ?? undefined,
          scopes: current.scopes ?? [],
          raw: {},
        } satisfies TokenSet,
      );
      const encrypted = await encryptCredential({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        scopes: refreshed.scopes,
        expiresAt: refreshed.expiresAt,
        accountSecrets: current.accountSecrets ?? {},
      });
      const { error: saveError } = await admin
        .schema("private")
        .from("provider_credentials")
        .update({
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          key_version: encrypted.keyVersion,
          updated_at: new Date().toISOString(),
        })
        .eq("connection_id", connection.id);
      if (saveError) throw saveError;
      await admin
        .from("provider_connections")
        .update({
          status: "connected",
          token_expires_at: refreshed.expiresAt ?? null,
          granted_scopes: refreshed.scopes,
          health_checked_at: new Date().toISOString(),
          health_error: null,
        })
        .eq("id", connection.id);
      results.push({ connectionId: connection.id, status: "refreshed" });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Token refresh failed.";
      await admin
        .from("provider_connections")
        .update({
          status: "degraded",
          health_checked_at: new Date().toISOString(),
          health_error: { code: "token_refresh_failed", message },
        })
        .eq("id", connection.id);
      await admin.from("audit_events").insert({
        workspace_id: connection.workspace_id,
        action: "provider.token_refresh_failed",
        resource_type: "provider_connection",
        resource_id: connection.id,
        metadata: { provider: connection.provider_key, message },
      });
      results.push({ connectionId: connection.id, status: "degraded", error: message });
    }
  }
  return Response.json({ ok: true, processed: results.length, results });
}
