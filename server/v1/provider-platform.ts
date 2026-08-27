import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAppOrigin } from "@/lib/supabase/config";
import type { OAuthProviderKey, ProviderKey } from "@/lib/v1/domain";

export type ProviderReadiness = {
  provider: ProviderKey;
  configured: boolean;
  reviewStatus: string;
  redirectVerified: boolean;
  smokeTestPassed: boolean;
  killSwitch: boolean;
  ready: boolean;
  implementationReady: boolean;
  reason: string | null;
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
        process.env.META_CLIENT_ID && process.env.META_CLIENT_SECRET,
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
      "configured,review_status,redirect_verified,webhook_verified,last_smoke_test_status,kill_switch",
    )
    .eq("provider_key", provider)
    .eq("environment", environment())
    .maybeSingle();
  const configured = hasEnvironment(provider) && Boolean(data?.configured);
  const reviewStatus = data?.review_status ?? "not_started";
  const reviewReady =
    environment() === "production"
      ? reviewStatus === "approved"
      : ["sandbox", "approved"].includes(reviewStatus);
  const redirectVerified = Boolean(data?.redirect_verified);
  const webhookVerified = Boolean(data?.webhook_verified);
  const smokeTestPassed = data?.last_smoke_test_status === "passed";
  const killSwitch = data?.kill_switch ?? true;
  const adapterReady = implementationReady(provider);
  const redirectReady = ["chatgpt_ads", "twilio_messaging", "sendgrid_email"].includes(
    provider,
  )
    ? true
    : redirectVerified;
  const webhookReady = ["twilio_messaging", "sendgrid_email"].includes(provider)
    ? webhookVerified
    : true;
  const ready =
    adapterReady &&
    configured &&
    reviewReady &&
    redirectReady &&
    webhookReady &&
    smokeTestPassed &&
    !killSwitch;
  const reason = ready
    ? null
    : !adapterReady
      ? "The full provider resource hierarchy has not passed GrowthOS production acceptance."
      : !configured
      ? "GrowthOS has not configured this provider application."
      : !reviewReady
        ? "Provider review or sandbox access is not approved."
        : !redirectReady
          ? "The provider callback has not been verified."
          : !webhookReady
            ? "The provider delivery webhook has not been verified."
          : !smokeTestPassed
            ? "The latest platform smoke test has not passed."
            : "The provider kill switch is enabled.";
  return {
    provider,
    configured,
    reviewStatus,
    redirectVerified,
    smokeTestPassed,
    killSwitch,
    ready,
    implementationReady: adapterReady,
    reason,
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
        scopes: [
          "ads_management",
          "ads_read",
          "business_management",
          "pages_show_list",
          "pages_read_engagement",
          "pages_manage_posts",
          "read_insights",
          "instagram_basic",
          "instagram_content_publish",
          "instagram_manage_insights",
        ],
        pkce: false,
      };
    case "google_ads":
      return {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        callback,
        scopes: [
          "https://www.googleapis.com/auth/adwords",
          "openid",
          "email",
          "profile",
        ],
        pkce: true,
      };
    case "ga4":
      return {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        callback,
        scopes: [
          "https://www.googleapis.com/auth/analytics.readonly",
          "openid",
          "email",
          "profile",
        ],
        pkce: true,
      };
    case "reddit_ads":
      return {
        clientId: process.env.REDDIT_CLIENT_ID!,
        clientSecret: process.env.REDDIT_CLIENT_SECRET!,
        authorizeUrl: "https://www.reddit.com/api/v1/authorize",
        tokenUrl: "https://www.reddit.com/api/v1/access_token",
        callback,
        scopes: ["identity", "adsread", "adsedit"],
        pkce: false,
      };
    case "linkedin_pages":
      return {
        clientId: process.env.LINKEDIN_CLIENT_ID!,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
        authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
        tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
        callback,
        scopes: [
          "openid",
          "profile",
          "email",
          "w_organization_social",
          "r_organization_social",
          "rw_organization_admin",
        ],
        pkce: false,
      };
    case "tiktok_organic":
      return {
        clientId: process.env.TIKTOK_CLIENT_KEY!,
        clientSecret: process.env.TIKTOK_CLIENT_SECRET!,
        authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
        tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
        callback,
        scopes: ["user.info.basic", "video.publish", "video.list"],
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
        scopes: ["advertiser_management", "ads_management", "reporting"],
        pkce: false,
      };
  }
}
