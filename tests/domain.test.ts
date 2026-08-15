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
});
