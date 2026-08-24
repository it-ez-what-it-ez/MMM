import "server-only";

import { z } from "zod";
import {
  type CampaignPlan,
  type ChannelKey,
  CHANNEL_KEYS,
} from "@/lib/v1/domain";

const generatedBundleSchema = z.object({
  name: z.string().min(1).max(160),
  content: z.array(
    z.object({
      channel: z.enum(CHANNEL_KEYS),
      headline: z.string().min(1),
      body: z.string().min(1),
      cta: z.string().min(1),
      carouselSlides: z
        .array(
          z.object({ headline: z.string().min(1), body: z.string().min(1) }),
        )
        .max(10),
    }),
  ),
});

export type CampaignPlanningInput = {
  objective: string;
  businessName: string;
  brandSummary: string;
  brandVoice: Record<string, unknown>;
  product: {
    id: string;
    name: string;
    description: string;
    mediaIds: string[];
  };
  channels: ChannelKey[];
  landingUrl: string;
  startsAt: string;
  endsAt: string | null;
  currency: "USD" | "CAD";
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
  accountIds: Partial<Record<ChannelKey, string>>;
  targetCountries: Array<"US" | "CA">;
  tiktokPublishingOptions: {
    privacy: string | null;
    commentsEnabled: boolean;
  };
};

export interface AIProvider {
  planCampaign(
    input: CampaignPlanningInput,
  ): Promise<{
    plan: CampaignPlan;
    model: string;
    responseId: string;
    usage: Record<string, unknown>;
  }>;
  refineCopy(input: {
    instruction: string;
    channel: ChannelKey;
    current: { headline: string; body: string; cta: string };
    brandSummary: string;
  }): Promise<{
    headline: string;
    body: string;
    cta: string;
    model: string;
    responseId: string;
    usage: Record<string, unknown>;
  }>;
  generateBackground(input: {
    prompt: string;
    referenceImageUrl?: string;
  }): Promise<{ base64: string; model: string }>;
}

type OpenAIResponse = {
  id?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: Record<string, unknown>;
  error?: { message?: string };
};

function apiKey() {
  const value = process.env.OPENAI_API_KEY?.trim();
  if (!value)
    throw new Error(
      "AI is not configured. Add OPENAI_API_KEY; GrowthOS does not substitute mock content.",
    );
  return value;
}

async function openAI(path: string, init: RequestInit) {
  const response = await fetch(`https://api.openai.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey()}`, ...init.headers },
  });
  const payload = (await response.json().catch(() => ({}))) as OpenAIResponse;
  if (!response.ok)
    throw new Error(
      payload.error?.message ?? `OpenAI returned ${response.status}.`,
    );
  return payload;
}

function outputText(response: OpenAIResponse) {
  const text = response.output
    ?.flatMap((item) => item.content ?? [])
    .find(
      (item) => item.type === "output_text" || typeof item.text === "string",
    )?.text;
  if (!text) throw new Error("OpenAI returned no structured campaign output.");
  return text;
}

const paidChannels = new Set<ChannelKey>([
  "meta_ads",
  "google_search",
  "google_display",
  "tiktok_ads",
  "reddit_ads",
  "chatgpt_ads",
]);
const carouselChannels = new Set<ChannelKey>([
  "facebook",
  "instagram",
  "tiktok",
  "meta_ads",
  "tiktok_ads",
  "reddit_ads",
]);

function formatFor(channel: ChannelKey, hasCarousel: boolean) {
  if (channel === "google_search") return "responsive_search";
  if (channel === "google_display") return "responsive_display";
  if (channel === "linkedin") return "static_image";
  if (channel === "tiktok") return hasCarousel ? "photo_carousel" : "photo";
  return hasCarousel ? "carousel" : "static_image";
}

function jsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["name", "content"],
    properties: {
      name: { type: "string", maxLength: 160 },
      content: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["channel", "headline", "body", "cta", "carouselSlides"],
          properties: {
            channel: { type: "string", enum: [...CHANNEL_KEYS] },
            headline: { type: "string" },
            body: { type: "string" },
            cta: { type: "string" },
            carouselSlides: {
              type: "array",
              maxItems: 10,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["headline", "body"],
                properties: {
                  headline: { type: "string" },
                  body: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  };
}

export class OpenAICampaignProvider implements AIProvider {
  async planCampaign(input: CampaignPlanningInput) {
    const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-5.4";
    const response = await openAI("/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: [
          "You are GrowthOS's production campaign planner.",
          "Create one publication-ready draft for every requested channel and only those channels.",
          "Be specific, credible, concise, and faithful to the supplied brand and product facts.",
          "Never invent discounts, proof, guarantees, scarcity, customer quotes, or product capabilities.",
          "For carousel-friendly channels, provide 3-5 coherent slides. For Google Search, provide no slides.",
          "Return only the requested JSON schema.",
        ].join(" "),
        input: JSON.stringify(input),
        text: {
          format: {
            type: "json_schema",
            name: "growthos_campaign_bundle",
            strict: true,
            schema: jsonSchema(),
          },
        },
      }),
    });
    const generated = generatedBundleSchema.parse(
      JSON.parse(outputText(response)),
    );
    const byChannel = new Map(
      generated.content.map((item) => [item.channel, item]),
    );
    const missing = input.channels.filter((channel) => !byChannel.has(channel));
    if (missing.length)
      throw new Error(
        `AI output omitted requested channels: ${missing.join(", ")}. No campaign was created.`,
      );

    const plan: CampaignPlan = {
      name: generated.name,
      objective: input.objective,
      productServiceId: input.product.id,
      landingUrl: input.landingUrl,
      currency: input.currency,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      dailyBudgetCents: input.dailyBudgetCents,
      lifetimeBudgetCents: input.lifetimeBudgetCents,
      channels: input.channels,
      template: null,
      content: input.channels.map((channel) => {
        const generatedItem = byChannel.get(channel)!;
        const generatedSlides = carouselChannels.has(channel)
          ? generatedItem.carouselSlides
          : [];
        const mediaId = input.product.mediaIds[0] ?? null;
        const unresolvedFields: string[] = [];
        if (channel !== "google_search" && !mediaId)
          unresolvedFields.push(
            "Upload and select a real product or service image",
          );
        if (paidChannels.has(channel) && !input.accountIds[channel])
          unresolvedFields.push("Select a real ad account");
        if (channel === "tiktok" && !input.tiktokPublishingOptions.privacy)
          unresolvedFields.push("Choose a current creator privacy option");
        return {
          id: crypto.randomUUID(),
          channel,
          format: formatFor(channel, generatedSlides.length > 1),
          headline: generatedItem.headline,
          body: generatedItem.body,
          cta: generatedItem.cta,
          destinationUrl: input.landingUrl,
          carouselSlides: generatedSlides.map((slide) => ({
            ...slide,
            mediaId,
          })),
          searchHeadlines:
            channel === "google_search"
              ? [
                  generatedItem.headline.slice(0, 30),
                  `${input.product.name} Official`.slice(0, 30),
                  `${generatedItem.cta} Today`.slice(0, 30),
                ]
              : undefined,
          searchDescriptions:
            channel === "google_search"
              ? [
                  generatedItem.body.slice(0, 90),
                  `${input.product.description || input.product.name}. ${generatedItem.cta}.`.slice(0, 90),
                ]
              : undefined,
          searchKeywords:
            channel === "google_search"
              ? [input.product.name, `${input.product.name} ${input.objective}`.slice(0, 80)]
              : undefined,
          mediaIds: mediaId ? [mediaId] : [],
          accountId: input.accountIds[channel] ?? null,
          targeting: paidChannels.has(channel)
            ? { countries: input.targetCountries }
            : {},
          publishingOptions:
            channel === "tiktok" ? input.tiktokPublishingOptions : null,
          scheduledFor: null,
          unresolvedFields,
          scene: mediaId
            ? {
                width: channel === "google_display" ? 1200 : 1080,
                height: channel === "google_display" ? 628 : 1080,
                layers: [
                  { kind: "background", color: "#F3F1E8" },
                  {
                    kind: "subject",
                    mediaId,
                    x: 80,
                    y: 170,
                    width: 920,
                    height: 760,
                    preserveOriginal: true,
                  },
                  {
                    kind: "text",
                    text: generatedItem.headline,
                    role: "headline",
                    x: 80,
                    y: 70,
                    width: 920,
                    color: "#102822",
                    align: "left",
                  },
                ],
              }
            : null,
        };
      }),
    };
    return {
      plan,
      model,
      responseId: response.id ?? "unknown",
      usage: response.usage ?? {},
    };
  }

  async refineCopy(input: {
    instruction: string;
    channel: ChannelKey;
    current: { headline: string; body: string; cta: string };
    brandSummary: string;
  }) {
    const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-5.4";
    const response = await openAI("/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions:
          "Refine this marketing copy without inventing product facts, offers, proof, urgency, or guarantees. Return JSON only.",
        input: JSON.stringify(input),
        text: {
          format: {
            type: "json_schema",
            name: "growthos_refined_copy",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["headline", "body", "cta"],
              properties: {
                headline: { type: "string" },
                body: { type: "string" },
                cta: { type: "string" },
              },
            },
          },
        },
      }),
    });
    const value = z
      .object({
        headline: z.string().min(1),
        body: z.string().min(1),
        cta: z.string().min(1),
      })
      .parse(JSON.parse(outputText(response)));
    return {
      ...value,
      model,
      responseId: response.id ?? "unknown",
      usage: response.usage ?? {},
    };
  }

  async generateBackground(input: {
    prompt: string;
    referenceImageUrl?: string;
  }) {
    const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";
    const response = (await openAI("/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: `${input.prompt}. Background only: do not include, redraw, or alter the product or service subject.`,
        size: "1536x1024",
        quality: "medium",
        output_format: "png",
      }),
    })) as OpenAIResponse & { data?: Array<{ b64_json?: string }> };
    const base64 = response.data?.[0]?.b64_json;
    if (!base64) throw new Error("OpenAI returned no image data.");
    return { base64, model };
  }
}

export async function moderateText(text: string) {
  const response = (await openAI("/moderations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "omni-moderation-latest", input: text }),
  })) as OpenAIResponse & {
    results?: Array<{
      flagged?: boolean;
      categories?: Record<string, boolean>;
    }>;
  };
  return response.results?.[0] ?? { flagged: false, categories: {} };
}

export async function moderateImage(dataUrl: string) {
  const response = (await openAI("/moderations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: [{ type: "image_url", image_url: { url: dataUrl } }],
    }),
  })) as OpenAIResponse & {
    results?: Array<{
      flagged?: boolean;
      categories?: Record<string, boolean>;
    }>;
  };
  return response.results?.[0] ?? { flagged: false, categories: {} };
}
