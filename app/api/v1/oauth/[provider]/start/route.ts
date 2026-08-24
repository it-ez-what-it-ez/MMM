import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PROVIDER_KEYS } from "@/lib/v1/domain";
import {
  encryptCredential,
  randomUrlSafe,
  sha256,
} from "@/server/v1/credentials";
import {
  ApiAuthorizationError,
  requireRouteUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";
import {
  getProviderReadiness,
  oauthConfiguration,
} from "@/server/v1/provider-platform";

const oauthProvider = z.enum(PROVIDER_KEYS).exclude(["chatgpt_ads"]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const user = await requireRouteUser();
    const provider = oauthProvider.parse((await params).provider);
    const workspaceId = z
      .string()
      .uuid()
      .parse(request.nextUrl.searchParams.get("workspaceId"));
    await requireWorkspaceRole(user.id, workspaceId, ["owner", "admin"]);
    const readiness = await getProviderReadiness(provider);
    if (!readiness.ready)
      return NextResponse.json(
        {
          ok: false,
          provider,
          status: "unavailable",
          message: readiness.reason,
        },
        { status: 503 },
      );
    const config = oauthConfiguration(provider);
    const state = randomUrlSafe(32);
    const verifier = config.pkce ? randomUrlSafe(48) : null;
    const challenge = verifier
      ? randomUrlSafeFromBytes(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(verifier),
            ),
          ),
        )
      : null;
    const encryptedVerifier = verifier
      ? await encryptCredential({ verifier })
      : null;
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("oauth_states")
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        provider_key: provider,
        state_hash: await sha256(state),
        pkce_verifier_ciphertext: encryptedVerifier
          ? JSON.stringify(encryptedVerifier)
          : null,
        redirect_path: "/app/manage/connections",
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
    if (error) throw error;
    const target = new URL(config.authorizeUrl);
    if (provider === "tiktok_ads") {
      target.searchParams.set("app_id", config.clientId);
      target.searchParams.set("redirect_uri", config.callback);
      target.searchParams.set("state", state);
    } else {
      target.searchParams.set(
        provider === "tiktok_organic" ? "client_key" : "client_id",
        config.clientId,
      );
      target.searchParams.set("redirect_uri", config.callback);
      target.searchParams.set("response_type", "code");
      target.searchParams.set(
        "scope",
        config.scopes.join(provider === "reddit_ads" ? " " : ","),
      );
      target.searchParams.set("state", state);
    }
    if (provider === "google_ads" || provider === "ga4") {
      target.searchParams.set("access_type", "offline");
      target.searchParams.set("prompt", "consent");
      target.searchParams.set("include_granted_scopes", "true");
      target.searchParams.set("scope", config.scopes.join(" "));
    }
    if (provider === "reddit_ads") {
      target.searchParams.set("duration", "permanent");
    }
    if (challenge) {
      target.searchParams.set("code_challenge", challenge);
      target.searchParams.set("code_challenge_method", "S256");
    }
    return NextResponse.redirect(target);
  } catch (error) {
    const status = error instanceof ApiAuthorizationError ? error.status : 400;
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "OAuth could not start.",
      },
      { status },
    );
  }
}

function randomUrlSafeFromBytes(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
