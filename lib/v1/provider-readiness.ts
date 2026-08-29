import type { OAuthProviderKey, ProviderKey } from "./domain";

export const providerRequiredScopes: Record<OAuthProviderKey, string[]> = {
  meta_business: [
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
  google_ads: [
    "https://www.googleapis.com/auth/adwords",
    "openid",
    "email",
    "profile",
  ],
  ga4: [
    "https://www.googleapis.com/auth/analytics.readonly",
    "openid",
    "email",
    "profile",
  ],
  tiktok_ads: ["advertiser_management", "ads_management", "reporting"],
  tiktok_organic: ["user.info.basic", "video.publish", "video.list"],
  reddit_ads: ["identity", "adsread", "adsedit"],
  linkedin_pages: [
    "openid",
    "profile",
    "email",
    "w_organization_social",
    "r_organization_social",
    "rw_organization_admin",
  ],
};

const oauthProviders = new Set<ProviderKey>(
  Object.keys(providerRequiredScopes) as OAuthProviderKey[],
);
const webhookRequiredProviders = new Set<ProviderKey>([
  "twilio_messaging",
  "sendgrid_email",
]);

export type ProviderReadinessEvidence = {
  provider: ProviderKey;
  environment: string;
  implementationReady: boolean;
  environmentConfigured: boolean;
  credentialEncryptionReady: boolean;
  recordConfigured: boolean;
  reviewStatus: string;
  redirectVerified: boolean;
  webhookVerified: boolean;
  requiredScopes: string[];
  grantedScopes: string[];
  lastSmokeTestStatus: string | null;
  lastSmokeTestAt: string | null;
  tokenRefreshHealthy: boolean;
  webhookHealthy: boolean;
  killSwitch: boolean;
};

export type EvaluatedProviderReadiness = {
  configured: boolean;
  credentialEncryptionReady: boolean;
  reviewReady: boolean;
  redirectReady: boolean;
  webhookReady: boolean;
  scopesReady: boolean;
  missingScopes: string[];
  smokeTestPassed: boolean;
  smokeTestFresh: boolean;
  refreshReady: boolean;
  ready: boolean;
  reason: string | null;
};

export function smokeTestIsFresh(
  lastSmokeTestAt: string | null,
  now = new Date(),
  maximumAgeDays = 30,
): boolean {
  if (!lastSmokeTestAt) return false;
  const testedAt = new Date(lastSmokeTestAt).getTime();
  if (!Number.isFinite(testedAt)) return false;
  const age = now.getTime() - testedAt;
  return age >= -5 * 60_000 && age <= maximumAgeDays * 86_400_000;
}

export function evaluateProviderReadiness(
  evidence: ProviderReadinessEvidence,
  now = new Date(),
): EvaluatedProviderReadiness {
  const isOAuth = oauthProviders.has(evidence.provider);
  const needsWebhook = webhookRequiredProviders.has(evidence.provider);
  const configured =
    evidence.environmentConfigured &&
    evidence.credentialEncryptionReady &&
    evidence.recordConfigured;
  const reviewReady =
    evidence.environment === "production"
      ? evidence.reviewStatus === "approved"
      : ["sandbox", "approved"].includes(evidence.reviewStatus);
  const redirectReady = isOAuth ? evidence.redirectVerified : true;
  const webhookReady = needsWebhook
    ? evidence.webhookVerified && evidence.webhookHealthy
    : true;
  const missingScopes = isOAuth
    ? evidence.requiredScopes.filter(
        (scope) => !evidence.grantedScopes.includes(scope),
      )
    : [];
  const scopesReady = isOAuth
    ? evidence.requiredScopes.length > 0 && missingScopes.length === 0
    : true;
  const smokeTestPassed = evidence.lastSmokeTestStatus === "passed";
  const smokeTestFresh = smokeTestIsFresh(evidence.lastSmokeTestAt, now);
  const refreshReady = isOAuth ? evidence.tokenRefreshHealthy : true;
  const ready =
    evidence.implementationReady &&
    configured &&
    reviewReady &&
    redirectReady &&
    webhookReady &&
    scopesReady &&
    smokeTestPassed &&
    smokeTestFresh &&
    refreshReady &&
    !evidence.killSwitch;
  const reason = ready
    ? null
    : !evidence.implementationReady
      ? "The full provider resource hierarchy has not passed GrowthOS production acceptance."
      : !evidence.environmentConfigured
        ? "GrowthOS has not configured the provider application credentials in this environment."
        : !evidence.credentialEncryptionReady
          ? "Provider credential encryption is not configured correctly."
          : !evidence.recordConfigured
            ? "Platform setup evidence has not been completed."
            : !reviewReady
              ? "Provider review or sandbox access is not approved."
              : !redirectReady
                ? "The provider callback has not been verified."
                : !webhookReady
                  ? "The provider delivery webhook has not been verified and proven healthy."
                  : !scopesReady
                    ? `Required provider permissions are missing${missingScopes.length ? `: ${missingScopes.join(", ")}` : "."}`
                    : !smokeTestPassed
                      ? "The latest platform smoke test has not passed."
                      : !smokeTestFresh
                        ? "The latest platform smoke test is missing or older than 30 days."
                        : !refreshReady
                          ? "OAuth token refresh has not been proven healthy."
                          : "The provider kill switch is enabled.";
  return {
    configured,
    credentialEncryptionReady: evidence.credentialEncryptionReady,
    reviewReady,
    redirectReady,
    webhookReady,
    scopesReady,
    missingScopes,
    smokeTestPassed,
    smokeTestFresh,
    refreshReady,
    ready,
    reason,
  };
}
