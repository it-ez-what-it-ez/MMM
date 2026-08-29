import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAppOrigin } from "@/lib/supabase/config";
import type { OAuthProviderKey, ProviderKey } from "@/lib/v1/domain";
import {
  evaluateProviderReadiness,
  providerRequiredScopes,
  type EvaluatedProviderReadiness,
} from "@/lib/v1/provider-readiness";
import { providerCredentialEncryptionReady } from "./credentials";

export type ProviderReadiness = EvaluatedProviderReadiness & {
  provider: ProviderKey;
  environment: string;
  implementationReady: boolean;
  environmentConfigured: boolean;
  recordConfigured: boolean;
  reviewStatus: string;
  redirectVerified: boolean;
  killSwitch: boolean;
};

// These adapters deliberately cannot be enabled by an admin flag alone yet:
// their current production APIs require per-account resources (Reddit profile
// and pixel selection; TikTok advertiser format/identity discovery) that must
// be selected and proven in the full paused-resource smoke test first.
const implementationReady = (provider: ProviderKey) =>
  provider !== "reddit_ads" && provider !== "tiktok_ads";

const environment = () => process.env.APP_ENV?.trim() || "development";

function hasEnvironment(provider: ProviderKey) {
  switch (provider) {
    case "meta_business":
      return Boolean(
        process.env.META_CLIENT_ID &&
          process.env.META_CLIENT_SECRET &&
          process.env.META_LOGIN_CONFIGURATION_ID,
      );
    case "google_ads":
      return Boolean(
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      );
    case "ga4":
      return Boolean(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
      );
    case "tiktok_ads":
      return Boolean(
        process.env.TIKTOK_ADS_APP_ID && process.env.TIKTOK_ADS_SECRET,
      );
    case "tiktok_organic":
      return Boolean(
        process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET,
      );
    case "reddit_ads":
      return Boolean(
        process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET,
      );
    case "linkedin_pages":
      return Boolean(
        process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET,
      );
    case "chatgpt_ads":
      return process.env.CHATGPT_ADS_ENABLED === "true";
    case "twilio_messaging":
      return process.env.TWILIO_MESSAGING_ENABLED === "true";
    case "sendgrid_email":
      return process.env.SENDGRID_EMAIL_ENABLED === "true";
  }
}

export async function getProviderReadiness(
  provider: ProviderKey,
): Promise<ProviderReadiness> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("platform_provider_readiness")
    .select(
      "configured,review_status,redirect_verified,webhook_verified,granted_scopes,last_smoke_test_status,last_smoke_test_at,token_refresh_healthy,webhook_healthy,kill_switch",
    )
    .eq("provider_key", provider)
    .eq("environment", environment())
    .maybeSingle();
  const currentEnvironment = environment();
  const environmentConfigured = hasEnvironment(provider);
  const recordConfigured = Boolean(data?.configured);
  const reviewStatus = data?.review_status ?? "not_started";
  const redirectVerified = Boolean(data?.redirect_verified);
  const webhookVerified = Boolean(data?.webhook_verified);
  const killSwitch = data?.kill_switch ?? true;
  const adapterReady = implementationReady(provider);
  const requiredScopes =
    provider in providerRequiredScopes
      ? providerRequiredScopes[provider as OAuthProviderKey]
      : [];
  const evaluated = evaluateProviderReadiness({
    provider,
    environment: currentEnvironment,
    implementationReady: adapterReady,
    environmentConfigured,
    credentialEncryptionReady: providerCredentialEncryptionReady(),
    recordConfigured,
    reviewStatus,
    redirectVerified,
    webhookVerified,
    requiredScopes,
    grantedScopes: data?.granted_scopes ?? [],
    lastSmokeTestStatus: data?.last_smoke_test_status ?? null,
    lastSmokeTestAt: data?.last_smoke_test_at ?? null,
    tokenRefreshHealthy: Boolean(data?.token_refresh_healthy),
    webhookHealthy: Boolean(data?.webhook_healthy),
    killSwitch,
  });
  return {
    provider,
    environment: currentEnvironment,
    implementationReady: adapterReady,
    environmentConfigured,
    recordConfigured,
    reviewStatus,
    redirectVerified,
    killSwitch,
    ...evaluated,
  };
}

export function oauthConfiguration(provider: OAuthProviderKey) {
  const callback = `${getAppOrigin()}/api/v1/oauth/${provider}/callback`;
  switch (provider) {
    case "meta_business":
      return {
        clientId: process.env.META_CLIENT_ID!,
        clientSecret: process.env.META_CLIENT_SECRET!,
        authorizeUrl: `https://www.facebook.com/${process.env.META_GRAPH_VERSION || "v24.0"}/dialog/oauth`,
        tokenUrl: `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v24.0"}/oauth/access_token`,
        callback,
        scopes: providerRequiredScopes.meta_business,
        pkce: false,
      };
    case "google_ads":
      return {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        callback,
        scopes: providerRequiredScopes.google_ads,
        pkce: true,
      };
    case "ga4":
      return {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        callback,
        scopes: providerRequiredScopes.ga4,
        pkce: true,
      };
    case "reddit_ads":
      return {
        clientId: process.env.REDDIT_CLIENT_ID!,
        clientSecret: process.env.REDDIT_CLIENT_SECRET!,
        authorizeUrl: "https://www.reddit.com/api/v1/authorize",
        tokenUrl: "https://www.reddit.com/api/v1/access_token",
        callback,
        scopes: providerRequiredScopes.reddit_ads,
        pkce: false,
      };
    case "linkedin_pages":
      return {
        clientId: process.env.LINKEDIN_CLIENT_ID!,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
        authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
        tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
        callback,
        scopes: providerRequiredScopes.linkedin_pages,
        pkce: false,
      };
    case "tiktok_organic":
      return {
        clientId: process.env.TIKTOK_CLIENT_KEY!,
        clientSecret: process.env.TIKTOK_CLIENT_SECRET!,
        authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
        tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
        callback,
        scopes: providerRequiredScopes.tiktok_organic,
        pkce: true,
      };
    case "tiktok_ads":
      return {
        clientId: process.env.TIKTOK_ADS_APP_ID!,
        clientSecret: process.env.TIKTOK_ADS_SECRET!,
        authorizeUrl: "https://business-api.tiktok.com/portal/auth",
        tokenUrl:
          "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/",
        callback,
        scopes: providerRequiredScopes.tiktok_ads,
        pkce: false,
      };
  }
}
