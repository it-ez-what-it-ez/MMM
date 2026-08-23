import { describe, expect, it } from "vitest";
import {
  campaignPlanSchema,
  getAIProvider,
  MockAIProvider,
  RemoteAIProvider,
} from "@/server/providers";
import {
  adapterOutcome,
  applyAudienceConsent,
  canApprove,
  canPublish,
  canTransitionConnection,
  filterIntegrationCatalog,
  inferLearningPreference,
  requiresConfirmation,
  stableExternalId,
} from "@/lib/domain";
import type { IntegrationDefinition } from "@/lib/types";
import type { AppState } from "@/lib/types";
import {
  MockMarketingAgent,
  selectAgentTemplate,
} from "@/server/marketing-agent";
import {
  campaignTemplateSchema,
  instantiateCampaignTemplate,
  renderTemplateString,
  seededCampaignTemplates,
} from "@/lib/campaign-templates";
import {
  campaignTabRoute,
  channelNavigation,
  classifyChannel,
  classifyTemplateCollection,
  manageNavigation,
  primaryNavigation,
  resolveLegacyRoute,
  templateMatchesChannel,
  templateMatchesSearch,
} from "@/lib/product";

const definitions: IntegrationDefinition[] = [
  {
    id: "meta",
    name: "Meta Ads",
    slug: "meta",
    description: "Paid audiences",
    category: "Advertising",
    direction: "DESTINATION",
    authType: "OAUTH",
    capabilities: ["WRITE_AUDIENCE"],
    status: "AVAILABLE",
    iconKey: "meta",
  },
  {
    id: "ga",
    name: "Google Analytics",
    slug: "ga",
    description: "Performance metrics",
    category: "Analytics",
    direction: "SOURCE",
    authType: "OAUTH",
    capabilities: ["READ_METRICS"],
    status: "AVAILABLE",
    iconKey: "ga",
  },
];

describe("GrowthOS domain rules", () => {
  it("filters the integration catalog by category and capability text", () => {
    expect(
      filterIntegrationCatalog(definitions, "audience", "Advertising").map(
        (item) => item.id,
      ),
    ).toEqual(["meta"]);
  });
  it("allows only valid connection state transitions", () => {
    expect(canTransitionConnection("CONNECTED", "DEGRADED")).toBe(true);
    expect(canTransitionConnection("CONNECTED", "NOT_CONNECTED")).toBe(false);
  });
  it("validates structured campaign plans", () => {
    expect(
      campaignPlanSchema.safeParse({
        title: "Launch",
        summary: "A coordinated campaign launch.",
        objective: "Book demos",
        targetAudience: "SaaS leaders",
        startDate: "2026-08-24",
        endDate: "2026-09-14",
        channels: ["LinkedIn"],
        topics: ["Signals", "Decisions"],
        contentItems: [
          {
            channel: "LinkedIn",
            type: "Post",
            title: "Signal",
            body: "Clear campaign body",
          },
        ],
        successMetrics: [],
        assumptions: [],
        risks: [],
      }).success,
    ).toBe(true);
  });
  it("enforces reviewer and publishing permissions", () => {
    expect(canApprove("REVIEWER")).toBe(true);
    expect(canApprove("MARKETER")).toBe(false);
    expect(canPublish("MARKETER", "APPROVED")).toBe(true);
    expect(canPublish("MARKETER", "DRAFT")).toBe(false);
  });
  it("uses idempotency keys to produce stable external IDs", () => {
    expect(stableExternalId("linkedin", "publish:content-1:v2")).toBe(
      stableExternalId("linkedin", "publish:content-1:v2"),
    );
    expect(stableExternalId("linkedin", "a")).not.toBe(
      stableExternalId("linkedin", "b"),
    );
  });
  it("filters audiences using destination consent and suppression rules", () => {
    const result = applyAudienceConsent(
      [
        {
          id: "1",
          emailConsent: true,
          adConsent: true,
          region: "CA",
          suppressed: false,
        },
        {
          id: "2",
          emailConsent: false,
          adConsent: true,
          region: "CA",
          suppressed: false,
        },
        {
          id: "3",
          emailConsent: true,
          adConsent: true,
          region: "FR",
          suppressed: false,
        },
      ],
      "EMAIL",
    );
    expect(result.accepted.map((item) => item.id)).toEqual(["1"]);
    expect(result.rejected).toHaveLength(2);
  });
  it("models recoverable adapter errors deterministically", () => {
    expect(adapterOutcome("recoverable:klaviyo", 1)).toMatchObject({
      ok: false,
      recoverable: true,
    });
    expect(adapterOutcome("recoverable:klaviyo", 2)).toMatchObject({
      ok: true,
    });
  });
  it("infers learning preferences without making them explicit", () => {
    expect(
      inferLearningPreference(
        "This revolutionary platform creates clarity",
        "This platform creates clarity",
      ),
    ).toMatchObject({ explicit: false, value: "revolutionary" });
  });
  it("requires confirmation for consequential actions", () => {
    expect(requiresConfirmation("publish_content")).toBe(true);
    expect(requiresConfirmation("list_connections")).toBe(false);
  });
  it("routes agent objectives to the right marketing skill and template", () => {
    expect(
      selectAgentTemplate(
        "Launch our Black Friday promotion",
        "CROSS_CHANNEL",
        seededCampaignTemplates,
      ).id,
    ).toBe("template-bfcm");
    expect(
      selectAgentTemplate(
        "Refresh paid creative fatigue",
        "PERFORMANCE",
        seededCampaignTemplates,
      ).id,
    ).toBe("template-product-content-showcase");
  });
  it("builds a transparent, confirmation-gated agent proposal", async () => {
    const state = {
      brand: {
        name: "Northstar Analytics",
        valueProposition: "Turn customer signals into clear actions.",
        voice: {
          tone: "Friendly expert",
          avoid: ["revolutionary", "guaranteed"],
        },
      },
      templates: seededCampaignTemplates,
      audiences: [
        {
          id: "aud-trials",
          name: "Engaged trials",
          size: 3842,
          excluded: 219,
          destinations: ["Klaviyo", "Meta Ads"],
        },
      ],
      definitions: [
        { id: "int-meta", name: "Meta Ads" },
        { id: "int-klaviyo", name: "Klaviyo" },
      ],
      connections: [
        {
          definitionId: "int-meta",
          state: "CONNECTED",
          lastError: undefined,
        },
        {
          definitionId: "int-klaviyo",
          state: "DEGRADED",
          lastError: "Rate limit",
        },
      ],
      insights: [
        {
          id: "insight-fatigue",
          title: "Refresh paid creative",
          evidence: "CTR declined 19% in seven days.",
          confidence: 88,
          kind: "WARNING",
        },
      ],
      metrics: Array.from({ length: 14 }, (_, index) => ({
        id: `metric-${index}`,
        date: `2026-08-${String(index + 1).padStart(2, "0")}`,
        impressions: 1000,
        engagement: 100,
        clicks: 50,
        leads: 10,
        spend: 100,
        revenue: 500,
      })),
      sources: [{ id: "source-1" }],
      media: [],
    } as unknown as AppState;
    const result = await new MockMarketingAgent().propose({
      objective: "Refresh paid creative that is losing performance",
      mode: "PERFORMANCE",
      state,
      now: new Date("2026-08-22T12:00:00.000Z"),
    });
    expect(result.proposal).toMatchObject({
      startDate: "2026-08-24",
      requiresConfirmation: true,
      execution: {
        createCampaign: true,
        createPaidAd: true,
        publish: false,
        submitApproval: false,
      },
    });
    expect(result.steps.map((step) => step.tool)).toEqual([
      "read_marketing_context",
      "analyze_opportunities",
      "select_audience",
      "assemble_campaign",
      "validate_destinations",
      "forecast_outcome",
    ]);
    expect(
      result.proposal.destinations.find(
        (destination) => destination.provider === "Klaviyo",
      )?.state,
    ).toBe("ATTENTION");
    expect(result.proposal.guardrails.join(" ")).toContain("human approval");
  });
  it("enables the remote AI provider only with complete server configuration", () => {
    expect(getAIProvider({ AI_PROVIDER: "remote" })).toBeInstanceOf(
      MockAIProvider,
    );
    expect(
      getAIProvider({
        AI_PROVIDER: "remote",
        AI_PROVIDER_API_KEY: "test-key",
        AI_PROVIDER_MODEL: "test-model",
        AI_PROVIDER_BASE_URL: "https://ai.example.test/generate",
      }),
    ).toBeInstanceOf(RemoteAIProvider);
  });
  it("ships valid campaign templates with unique slugs and complete bundles", () => {
    expect(
      seededCampaignTemplates.every(
        (item) => campaignTemplateSchema.safeParse(item).success,
      ),
    ).toBe(true);
    expect(new Set(seededCampaignTemplates.map((item) => item.slug)).size).toBe(
      seededCampaignTemplates.length,
    );
    expect(
      seededCampaignTemplates.every((item) => item.assets.length >= 7),
    ).toBe(true);
  });
  it("includes a product-first bundle with real social, video, email, and SMS formats", () => {
    const template = seededCampaignTemplates.find(
      (item) => item.id === "template-product-content-showcase",
    )!;
    expect(template.channels).toEqual(
      expect.arrayContaining([
        "Instagram",
        "Facebook",
        "TikTok",
        "Email",
        "SMS",
      ]),
    );
    expect(template.assets.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        "Carousel · 4 slides",
        "Reel · 15 seconds",
        "Short-form video · 18 seconds",
        "Product launch email",
        "Product reminder",
      ]),
    );
    expect(JSON.stringify(template.assets)).toContain("{{productName}}");
  });
  it("renders template variables without changing unknown placeholders", () => {
    expect(
      renderTemplateString(
        "Save {{discount}} with {{brandName}} and {{unknown}}",
        { discount: "30%", brandName: "Northstar" },
      ),
    ).toBe("Save 30% with Northstar and {{unknown}}");
  });
  it("instantiates a scheduled multi-channel BFCM campaign", () => {
    const template = seededCampaignTemplates.find(
      (item) => item.id === "template-bfcm",
    )!;
    const instance = instantiateCampaignTemplate(template, {
      brandName: "Northstar Analytics",
      startDate: "2026-11-02",
      variables: {
        discount: "35% off",
        offerName: "Northstar Annual",
        deadline: "Cyber Monday at midnight",
        primaryCta: "Unlock annual access",
      },
    });
    expect(instance.assets).toHaveLength(11);
    expect(instance.assets[0]).toMatchObject({
      channel: "Email",
      scheduledAt: "2026-11-02T09:00:00.000Z",
    });
    expect(instance.assets.some((item) => item.channel === "Google Ads")).toBe(
      true,
    );
    expect(JSON.stringify(instance)).not.toContain("{{discount}}");
  });
  it("classifies provider and content labels into the four workspaces", () => {
    expect(classifyChannel("LinkedIn organic post")).toBe("social");
    expect(classifyChannel("Klaviyo Email")).toBe("messaging");
    expect(classifyChannel("Google Ads")).toBe("paid");
    expect(classifyChannel("LinkedIn Ads")).toBe("paid");
    expect(classifyChannel("SEO landing page")).toBe("web");
  });
  it("filters templates using the same channel mapping as workspaces", () => {
    const bfcm = seededCampaignTemplates.find(
      (item) => item.id === "template-bfcm",
    )!;
    expect(templateMatchesChannel(bfcm, "social")).toBe(true);
    expect(templateMatchesChannel(bfcm, "messaging")).toBe(true);
    expect(templateMatchesChannel(bfcm, "paid")).toBe(true);
    expect(templateMatchesChannel(bfcm, "web")).toBe(false);
  });
  it("organizes templates into plain-language collections and searches formats", () => {
    const bfcm = seededCampaignTemplates.find(
      (item) => item.id === "template-bfcm",
    )!;
    const winback = seededCampaignTemplates.find(
      (item) => item.id === "template-winback",
    )!;
    const product = seededCampaignTemplates.find(
      (item) => item.id === "template-product-content-showcase",
    )!;
    expect(classifyTemplateCollection(bfcm)).toBe("seasonal");
    expect(classifyTemplateCollection(winback)).toBe("lifecycle");
    expect(classifyTemplateCollection(product)).toBe("product");
    expect(templateMatchesSearch(product, "carousel")).toBe(true);
    expect(templateMatchesSearch(product, "sms")).toBe(true);
    expect(templateMatchesSearch(product, "webinar")).toBe(false);
  });
  it("keeps the V1 navigation focused on six product workflows", () => {
    expect(primaryNavigation.map(([label]) => label)).toEqual([
      "Home",
      "Campaigns",
      "Products & Brand",
      "Approvals",
      "Calendar",
      "Results",
    ]);
    expect(channelNavigation).toEqual([]);
    expect(manageNavigation).toEqual([]);
  });
  it("includes a reviewable ChatGPT chat card in core product campaigns", () => {
    const product = seededCampaignTemplates.find(
      (item) => item.id === "template-product-content-showcase",
    )!;
    const chatCard = product.assets.find(
      (asset) => asset.channel === "ChatGPT Ads",
    );
    expect(product.channels).toContain("ChatGPT Ads");
    expect(chatCard?.type).toBe("Chat card ad");
    expect(chatCard?.title).toContain("{{productName}}");
  });
  it("preserves legacy paid-ad URLs and stable campaign tab routes", () => {
    expect(resolveLegacyRoute("/app/paid-ads")).toBe("/app/channels/paid");
    expect(resolveLegacyRoute("/app/calendar")).toBe("/app/calendar");
    expect(campaignTabRoute("campaign-1", "content")).toBe(
      "/app/campaigns/campaign-1/content",
    );
  });
});
