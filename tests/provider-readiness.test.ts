import { describe, expect, it } from "vitest";
import {
  evaluateProviderReadiness,
  providerRequiredScopes,
} from "@/lib/v1/provider-readiness";

const now = new Date("2026-08-29T12:00:00.000Z");

function googleEvidence() {
  return {
    provider: "google_ads" as const,
    environment: "production",
    implementationReady: true,
    environmentConfigured: true,
    credentialEncryptionReady: true,
    recordConfigured: true,
    reviewStatus: "approved",
    redirectVerified: true,
    webhookVerified: false,
    requiredScopes: providerRequiredScopes.google_ads,
    grantedScopes: providerRequiredScopes.google_ads,
    lastSmokeTestStatus: "passed",
    lastSmokeTestAt: "2026-08-28T12:00:00.000Z",
    tokenRefreshHealthy: true,
    webhookHealthy: false,
    killSwitch: false,
  };
}

describe("provider readiness policy", () => {
  it("accepts only complete, current production evidence", () => {
    expect(evaluateProviderReadiness(googleEvidence(), now).ready).toBe(true);
  });

  it("blocks missing OAuth permissions", () => {
    const evidence = googleEvidence();
    evidence.grantedScopes = ["openid"];
    const readiness = evaluateProviderReadiness(evidence, now);
    expect(readiness.ready).toBe(false);
    expect(readiness.scopesReady).toBe(false);
    expect(readiness.missingScopes).toContain(
      "https://www.googleapis.com/auth/adwords",
    );
  });

  it("blocks stale smoke tests and unproven token refresh", () => {
    const stale = googleEvidence();
    stale.lastSmokeTestAt = "2026-06-01T12:00:00.000Z";
    expect(evaluateProviderReadiness(stale, now).smokeTestFresh).toBe(false);

    const noRefresh = googleEvidence();
    noRefresh.tokenRefreshHealthy = false;
    expect(evaluateProviderReadiness(noRefresh, now).refreshReady).toBe(false);
  });

  it("requires delivery webhook evidence for email and SMS", () => {
    const result = evaluateProviderReadiness(
      {
        ...googleEvidence(),
        provider: "sendgrid_email",
        requiredScopes: [],
        grantedScopes: [],
        redirectVerified: false,
        tokenRefreshHealthy: false,
      },
      now,
    );
    expect(result.ready).toBe(false);
    expect(result.webhookReady).toBe(false);
  });
});
