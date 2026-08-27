import { describe, expect, it } from "vitest";
import {
  approvalBlockers,
  campaignPlanSchema,
  canApprovePlan,
  CHANNEL_KEYS,
  providerCapabilities,
  type CampaignPlan,
} from "@/lib/v1/domain";
import {
  campaignTemplates,
  getTemplate,
  templatesForChannels,
} from "@/lib/v1/templates";
import { buildCampaignEmailHtml, isSmsOptOut, smsSegmentCount } from "@/lib/v1/messaging";

const mediaId = "00000000-0000-4000-8000-000000000001";
const productId = "00000000-0000-4000-8000-000000000002";
const accountId = "00000000-0000-4000-8000-000000000003";

function validPlan(): CampaignPlan {
  return campaignPlanSchema.parse({
    name: "Real launch",
    objective: "Launch a real product without invented claims.",
    productServiceId: productId,
    landingUrl: "https://example.com/product",
    currency: "CAD",
    startsAt: "2027-01-01T14:00:00.000Z",
    endsAt: "2027-01-08T14:00:00.000Z",
    dailyBudgetCents: 5000,
    lifetimeBudgetCents: null,
    channels: ["instagram", "meta_ads"],
    template: { id: "product-launch", version: 1 },
    content: ["instagram", "meta_ads"].map((channel, index) => ({
      id: `00000000-0000-4000-8000-00000000000${index + 4}`,
      channel,
      format: "static_image",
      headline: "Meet the real product",
      body: "A factual product introduction.",
      cta: "Learn more",
      destinationUrl: "https://example.com/product",
      carouselSlides: [],
      mediaIds: [mediaId],
      accountId,
      targeting: channel === "meta_ads" ? { countries: ["CA"] } : {},
      publishingOptions: null,
      scheduledFor: null,
      unresolvedFields: [],
      scene: {
        width: 1080,
        height: 1080,
        layers: [
          {
            kind: "subject",
            mediaId,
            x: 80,
            y: 180,
            width: 920,
            height: 760,
            preserveOriginal: true,
          },
        ],
      },
    })),
  });
}

describe("production template library", () => {
  it("ships exactly the twelve approved V1 bundles", () => {
    expect(campaignTemplates).toHaveLength(12);
    expect(campaignTemplates.map((template) => template.id)).toEqual([
      "bfcm",
      "halloween",
      "holiday",
      "product-launch",
      "service-launch",
      "limited-offer",
      "consultation",
      "local-awareness",
      "testimonial",
      "event-webinar",
      "educational-carousel",
      "evergreen-traffic",
    ]);
  });

  it("contains only V1 destinations and visible example creative", () => {
    for (const template of campaignTemplates) {
      expect(template.assets.length).toBeGreaterThan(0);
      expect(
        template.variables.some(
          (variable) =>
            variable.type === "product" || variable.type === "service",
        ),
      ).toBe(true);
      for (const asset of template.assets) {
        expect(CHANNEL_KEYS).toContain(asset.channel);
        expect(asset.exampleHeadline.length).toBeGreaterThan(3);
        expect(asset.exampleBody.length).toBeGreaterThan(10);
        expect(asset.aspectRatio).toMatch(/^\d+(\.\d+)?:\d+(\.\d+)?$/);
        expect(["video", "whatsapp"]).not.toContain(
          asset.format,
        );
      }
    }
  });

  it("filters templates by real channel support", () => {
    expect(
      templatesForChannels(["google_search"]).every((template) =>
        template.channels.includes("google_search"),
      ),
    ).toBe(true);
    expect(
      getTemplate("bfcm")?.assets.some(
        (asset) => asset.channel === "instagram",
      ),
    ).toBe(true);
  });
});

describe("approval and creative safety", () => {
  it("allows a fully resolved, account-bound plan", () => {
    const plan = validPlan();
    expect(approvalBlockers(plan)).toEqual([]);
    expect(canApprovePlan(plan)).toBe(true);
  });

  it("blocks placeholders, missing real images, invalid destinations, and missing accounts", () => {
    const plan = validPlan();
    plan.content[0].mediaIds = [];
    plan.content[0].accountId = null;
    plan.content[1].unresolvedFields = ["Set a paid budget"];
    expect(approvalBlockers(plan)).toEqual(
      expect.arrayContaining([
        "Instagram: add a real image",
        "Instagram: select a real destination account",
        "Meta Ads: Set a paid budget",
      ]),
    );
    expect(canApprovePlan(plan)).toBe(false);
  });

  it("blocks a paid campaign whose geography was never chosen", () => {
    const plan = validPlan();
    plan.content[1].targeting = {};
    expect(approvalBlockers(plan)).toContain(
      "Meta Ads: choose at least one target country",
    );
  });

  it("blocks TikTok until the creator privacy choice is explicit", () => {
    const plan = validPlan();
    plan.content[0].channel = "tiktok";
    plan.content[0].publishingOptions = null;
    expect(approvalBlockers(plan)).toContain(
      "TikTok: choose a current creator privacy option",
    );
  });

  it("blocks Google Search until at least one keyword is reviewable", () => {
    const plan = validPlan();
    plan.content[0] = {
      ...plan.content[0],
      channel: "google_search",
      mediaIds: [],
      searchHeadlines: ["One", "Two", "Three"],
      searchDescriptions: ["First description", "Second description"],
      searchKeywords: undefined,
    };
    expect(approvalBlockers(plan)).toContain(
      "Google Search: add at least one reviewed keyword",
    );
  });

  it("requires uploaded subjects to remain unchanged in the scene graph", () => {
    const subjects = validPlan().content.flatMap(
      (item) =>
        item.scene?.layers.filter((layer) => layer.kind === "subject") ?? [],
    );
    expect(subjects).toHaveLength(2);
    expect(
      subjects.every(
        (subject) => subject.kind === "subject" && subject.preserveOriginal,
      ),
    ).toBe(true);
  });
});

describe("provider capability map", () => {
  it("covers every V1 paid, organic, email, and SMS provider", () => {
    expect(Object.keys(providerCapabilities)).toEqual(
      expect.arrayContaining([
        "meta_business",
        "google_ads",
        "ga4",
        "tiktok_ads",
        "tiktok_organic",
        "reddit_ads",
        "linkedin_pages",
        "chatgpt_ads",
        "twilio_messaging",
        "sendgrid_email",
      ]),
    );
    expect(providerCapabilities.google_ads.formats).toEqual(
      expect.arrayContaining(["responsive_search", "responsive_display"]),
    );
    expect(providerCapabilities.tiktok_organic.formats).not.toContain("video");
    expect(providerCapabilities.twilio_messaging.channels).toEqual(["sms"]);
    expect(providerCapabilities.sendgrid_email.channels).toEqual(["email"]);
  });
});

describe("messaging safety", () => {
  it("requires a consented audience and mandatory email footer", () => {
    const plan = validPlan();
    plan.channels = ["email"];
    plan.content = [{
      ...plan.content[0],
      channel: "email",
      format: "email_html",
      messaging: {
        audienceId: "00000000-0000-4000-8000-000000000099",
        estimatedRecipients: 12,
        fromName: "Example Inc.",
        fromAddress: "hello@example.com",
        replyToAddress: "support@example.com",
        subject: "The real offer",
        preheader: "A preview",
        html: buildCampaignEmailHtml({ businessName: "Example Inc.", headline: "The real offer", body: "Factual body.", cta: "Learn more", destinationUrl: "https://example.com/product", physicalAddress: "123 Main Street, Toronto, ON", includeHeroImage: true }),
        physicalAddress: "123 Main Street, Toronto, ON",
        smsOptOutText: null,
      },
    }];
    expect(approvalBlockers(plan)).toEqual([]);
    plan.content[0].messaging!.html = "<p>No opt out</p>";
    expect(approvalBlockers(plan)).toContain("Email: include the required unsubscribe link");
  });

  it("does not require an image for SMS but requires STOP in the exact body", () => {
    const plan = validPlan();
    plan.channels = ["sms"];
    plan.content = [{
      ...plan.content[0], channel: "sms", format: "sms_text", mediaIds: [], body: "Offer details at https://example.com. Reply STOP to unsubscribe.",
      messaging: { audienceId: "00000000-0000-4000-8000-000000000099", estimatedRecipients: 3, fromName: "Example", fromAddress: null, replyToAddress: null, subject: null, preheader: null, html: null, physicalAddress: null, smsOptOutText: "Reply STOP to unsubscribe." },
    }];
    expect(approvalBlockers(plan)).toEqual([]);
    plan.content[0].body = "Offer details at https://example.com.";
    expect(approvalBlockers(plan)).toContain("SMS: include STOP opt-out instructions");
  });

  it("calculates segments and recognizes mandated opt-out keywords", () => {
    expect(smsSegmentCount("A".repeat(161))).toMatchObject({ encoding: "GSM-7", segments: 2 });
    expect(smsSegmentCount("Hello 👋")).toMatchObject({ encoding: "UCS-2", segments: 1 });
    expect(isSmsOptOut("  Opt   Out ")).toBe(true);
    expect(isSmsOptOut("keep sending")).toBe(false);
  });
});
