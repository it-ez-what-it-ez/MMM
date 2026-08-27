import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ProviderKey } from "@/lib/v1/domain";
import { decryptCredential } from "@/server/v1/credentials";
import {
  authorizationErrorResponse,
  requireApiUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";

const schema = z.object({ workspaceId: z.string().uuid() });

async function revokeRemote(provider: ProviderKey, accessToken: string) {
  if (["chatgpt_ads", "tiktok_ads", "twilio_messaging", "sendgrid_email"].includes(provider)) return false;
  let response: Response;
  if (provider === "meta_business") {
    response = await fetch(
      `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v24.0"}/me/permissions?access_token=${encodeURIComponent(accessToken)}`,
      { method: "DELETE" },
    );
  } else if (provider === "google_ads" || provider === "ga4") {
    response = await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );
  } else if (provider === "reddit_ads") {
    const client = `${process.env.REDDIT_CLIENT_ID ?? ""}:${process.env.REDDIT_CLIENT_SECRET ?? ""}`;
    response = await fetch("https://www.reddit.com/api/v1/revoke_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(client)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token: accessToken, token_type_hint: "access_token" }),
    });
  } else if (provider === "tiktok_organic") {
    response = await fetch("https://open.tiktokapis.com/v2/oauth/revoke/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
        client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "",
        token: accessToken,
      }),
    });
  } else {
    response = await fetch("https://www.linkedin.com/oauth/v2/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
        client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
        token: accessToken,
      }),
    });
  }
  if (!response.ok)
    throw new Error(`Provider revocation returned ${response.status}.`);
  return true;
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    const input = schema.parse(await request.json());
    const { id } = await params;
    await requireWorkspaceRole(user.id, input.workspaceId, ["owner", "admin"]);
    const admin = getSupabaseAdmin();
    const { data: connection } = await admin
      .from("provider_connections")
      .select("id,provider_key")
      .eq("id", id)
      .eq("workspace_id", input.workspaceId)
      .single();
    if (!connection)
      return Response.json(
        { ok: false, errors: [{ code: "not_found", message: "Connection not found.", recoverable: false }], operationId, auditEventId },
        { status: 404 },
      );
    const { data: encrypted } = await admin
      .schema("private")
      .from("provider_credentials")
      .select("ciphertext,iv,auth_tag,key_version")
      .eq("connection_id", id)
      .maybeSingle();
    let remoteRevoked = false;
    let remoteWarning: string | null = null;
    if (encrypted) {
      const credential = await decryptCredential<{ accessToken?: string; apiKey?: string }>({
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.auth_tag,
        keyVersion: encrypted.key_version,
      });
      const token = credential.accessToken ?? credential.apiKey;
      if (token) {
        try {
          remoteRevoked = await revokeRemote(connection.provider_key as ProviderKey, token);
        } catch (cause) {
          remoteWarning = cause instanceof Error ? cause.message : "Remote revocation failed.";
        }
      }
    }
    await admin
      .from("provider_accounts")
      .update({ selected: false })
      .eq("connection_id", id);
    await admin
      .schema("private")
      .from("provider_credentials")
      .delete()
      .eq("connection_id", id);
    await admin
      .from("provider_connections")
      .update({
        status: "revoked",
        token_expires_at: null,
        health_error: remoteWarning
          ? { code: "remote_revocation_unconfirmed", message: remoteWarning }
          : null,
      })
      .eq("id", id);
    await admin.from("audit_events").insert({
      id: auditEventId,
      workspace_id: input.workspaceId,
      actor_id: user.id,
      action: "provider.connection_revoked",
      resource_type: "provider_connection",
      resource_id: id,
      metadata: { operationId, provider: connection.provider_key, remoteRevoked, remoteWarning },
    });
    return Response.json({
      ok: true,
      data: { connectionId: id, remoteRevoked, remoteWarning },
      operationId,
      auditEventId,
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { ok: false, errors: error.issues.map((issue) => ({ code: "validation", field: issue.path.join("."), message: issue.message, recoverable: true })), operationId, auditEventId },
        { status: 400 },
      );
    return authorizationErrorResponse(error);
  }
}
