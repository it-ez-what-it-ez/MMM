import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAppOrigin } from "@/lib/supabase/config";
import { PROVIDER_KEYS } from "@/lib/v1/domain";
import { decryptCredential, sha256 } from "@/server/v1/credentials";
import {
  discoverProviderAccounts,
  exchangeAuthorizationCode,
  persistProviderConnection,
} from "@/server/v1/provider-oauth";

const oauthProvider = z.enum(PROVIDER_KEYS).exclude(["chatgpt_ads", "twilio_messaging", "sendgrid_email"]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const provider = oauthProvider.safeParse((await params).provider);
  const fallback = new URL("/app/manage/connections", getAppOrigin());
  try {
    if (!provider.success) throw new Error("Unsupported provider.");
    const code =
      request.nextUrl.searchParams.get("code") ??
      request.nextUrl.searchParams.get("auth_code");
    const state = request.nextUrl.searchParams.get("state");
    const denied =
      request.nextUrl.searchParams.get("error") ??
      request.nextUrl.searchParams.get("error_description");
    if (denied) throw new Error(denied);
    if (!code || !state)
      throw new Error(
        "The provider callback did not contain a valid code and state.",
      );
    const admin = getSupabaseAdmin();
    const { data: stateRow, error: stateError } = await admin
      .from("oauth_states")
      .select(
        "id,workspace_id,user_id,provider_key,pkce_verifier_ciphertext,redirect_path,expires_at,consumed_at",
      )
      .eq("state_hash", await sha256(state))
      .eq("provider_key", provider.data)
      .maybeSingle();
    if (stateError || !stateRow)
      throw new Error("This authorization state is invalid.");
    if (stateRow.consumed_at)
      throw new Error("This authorization callback has already been used.");
    if (new Date(stateRow.expires_at).getTime() < Date.now())
      throw new Error("This authorization attempt expired. Start again.");
    const consumedAt = new Date().toISOString();
    const consumed = await admin
      .from("oauth_states")
      .update({ consumed_at: consumedAt })
      .eq("id", stateRow.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (consumed.error || !consumed.data)
      throw new Error("This authorization callback was already consumed.");
    let verifier: string | null = null;
    if (stateRow.pkce_verifier_ciphertext) {
      const encrypted = JSON.parse(stateRow.pkce_verifier_ciphertext) as {
        ciphertext: string;
        iv: string;
        authTag: string;
        keyVersion: number;
      };
      verifier = (await decryptCredential<{ verifier: string }>(encrypted))
        .verifier;
    }
    const tokens = await exchangeAuthorizationCode(
      provider.data,
      code,
      verifier,
    );
    const discovery = await discoverProviderAccounts(provider.data, tokens);
    const connectionId = await persistProviderConnection({
      provider: provider.data,
      workspaceId: stateRow.workspace_id,
      userId: stateRow.user_id,
      tokens,
      externalUserId: discovery.externalUserId,
      accounts: discovery.accounts,
    });
    await admin
      .from("audit_events")
      .insert({
        workspace_id: stateRow.workspace_id,
        actor_id: stateRow.user_id,
        action: "provider.authorized",
        resource_type: "provider_connection",
        resource_id: connectionId,
        metadata: {
          provider: provider.data,
          discoveredAccounts: discovery.accounts.length,
        },
      });
    const redirect = new URL(stateRow.redirect_path, getAppOrigin());
    redirect.searchParams.set("connected", provider.data);
    return NextResponse.redirect(redirect);
  } catch (error) {
    fallback.searchParams.set(
      "connection_error",
      error instanceof Error ? error.message : "Provider authorization failed.",
    );
    return NextResponse.redirect(fallback);
  }
}
