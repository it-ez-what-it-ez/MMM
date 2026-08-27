import { describe, expect, it } from "vitest";
import { deriveProviderSetup, providerOnboarding } from "@/lib/v1/connection-onboarding";
import { PROVIDER_KEYS } from "@/lib/v1/domain";

describe("real provider onboarding", () => {
  it("defines a complete customer setup contract for every provider", () => {
    expect(Object.keys(providerOnboarding)).toEqual(expect.arrayContaining([...PROVIDER_KEYS]));
    for (const provider of PROVIDER_KEYS) {
      const definition = providerOnboarding[provider];
      expect(definition.requirements.length).toBeGreaterThanOrEqual(2);
      expect(definition.permissions.length).toBeGreaterThanOrEqual(2);
      expect(definition.verificationChecks.length).toBeGreaterThanOrEqual(2);
      expect(definition.helpUrl).toMatch(/^https:\/\//);
    }
  });

  it("does not expose customer authorization while the platform gate is closed", () => {
    const setup = deriveProviderSetup({
      provider: "google_ads",
      platformReady: false,
      platformReason: "Production developer token approval is pending.",
      accounts: [],
    });
    expect(setup.status).toBe("unavailable");
    expect(setup.detail).toContain("developer token");
    expect(setup.stages.filter((stage) => stage.state === "blocked")).toHaveLength(3);
  });

  it("continues from OAuth into destination selection", () => {
    const setup = deriveProviderSetup({
      provider: "google_ads",
      platformReady: true,
      connection: { status: "connected", healthError: null },
      accounts: [
        {
          accountType: "ad_account",
          selected: false,
          billingStatus: "active",
          capabilities: { manager: false },
        },
      ],
    });
    expect(setup.status).toBe("destinations_required");
    expect(setup.nextStage).toBe("destinations");
  });

  it("requires an explicit Facebook Page identity for selected Meta ad accounts", () => {
    const setup = deriveProviderSetup({
      provider: "meta_business",
      platformReady: true,
      connection: { status: "connected", healthError: null },
      accounts: [
        {
          accountType: "ad_account",
          selected: true,
          billingStatus: "active",
          capabilities: {},
        },
      ],
    });
    expect(setup.status).toBe("needs_attention");
    expect(setup.blockers.join(" ")).toContain("Facebook Page identity");
  });

  it("keeps US SMS blocked until A2P and sender identity are ready", () => {
    const setup = deriveProviderSetup({
      provider: "twilio_messaging",
      platformReady: true,
      connection: { status: "connected", healthError: null },
      messagingIdentityComplete: false,
      smsRequiresUsA2p: true,
      accounts: [
        {
          accountType: "messaging_service",
          selected: true,
          billingStatus: "active",
          capabilities: { usa2pCampaignStatus: "IN_PROGRESS" },
        },
      ],
    });
    expect(setup.status).toBe("needs_attention");
    expect(setup.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining("US 10DLC"),
        expect.stringContaining("legal sender"),
      ]),
    );
  });

  it("allows a Canada-default SMS setup without pretending US 10DLC is ready", () => {
    const setup = deriveProviderSetup({
      provider: "twilio_messaging",
      platformReady: true,
      connection: { status: "connected", healthError: null },
      messagingIdentityComplete: true,
      smsRequiresUsA2p: false,
      accounts: [
        {
          accountType: "messaging_service",
          selected: true,
          billingStatus: "active",
          capabilities: {
            usa2pCampaignStatus: "NOT_REGISTERED",
            inboundWebhookConfigured: true,
          },
        },
      ],
    });
    expect(setup.status).toBe("ready");
  });

  it("marks a fully verified email sender ready", () => {
    const setup = deriveProviderSetup({
      provider: "sendgrid_email",
      platformReady: true,
      connection: { status: "connected", healthError: null },
      messagingIdentityComplete: true,
      accounts: [
        {
          accountType: "email_sender",
          selected: true,
          billingStatus: "active",
          capabilities: {
            domainAuthenticated: true,
            signedEventWebhook: true,
            unsubscribeGroupId: 42,
          },
        },
      ],
    });
    expect(setup.status).toBe("ready");
    expect(setup.stages.every((stage) => stage.state === "complete")).toBe(true);
  });
});
