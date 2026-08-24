import { z } from "zod";

export const PROVIDER_KEYS = [
  "meta_business",
  "google_ads",
  "ga4",
  "tiktok_ads",
  "tiktok_organic",
  "reddit_ads",
  "linkedin_pages",
  "chatgpt_ads",
] as const;

export const CHANNEL_KEYS = [
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  "meta_ads",
  "google_search",
  "google_display",
  "tiktok_ads",
  "reddit_ads",
  "chatgpt_ads",
] as const;

export type ProviderKey = (typeof PROVIDER_KEYS)[number];
export type ChannelKey = (typeof CHANNEL_KEYS)[number];

export type ProviderCapability = {
  provider: ProviderKey;
  label: string;
  channels: ChannelKey[];
  formats: string[];
  objectives: string[];
  currencies: Array<"USD" | "CAD">;
  supportsPublishing: boolean;
  supportsReporting: boolean;
  connectionLimitations?: string;
};

export const channelLabels: Record<ChannelKey, string> = {
  facebook: "Facebook Page",
  instagram: "Instagram",
  linkedin: "LinkedIn Page",
  tiktok: "TikTok",
  meta_ads: "Meta Ads",
  google_search: "Google Search",
  google_display: "Google Display",
  tiktok_ads: "TikTok Ads",
  reddit_ads: "Reddit Ads",
  chatgpt_ads: "ChatGPT Ads",
};

export const providerCapabilities: Record<ProviderKey, ProviderCapability> = {
  meta_business: {
    provider: "meta_business",
    label: "Meta Business",
    channels: ["facebook", "instagram", "meta_ads"],
    formats: ["static_image", "carousel"],
    objectives: ["awareness", "traffic", "sales"],
    currencies: ["USD", "CAD"],
    supportsPublishing: true,
    supportsReporting: true,
  },
  google_ads: {
    provider: "google_ads",
    label: "Google Ads",
    channels: ["google_search", "google_display"],
    formats: ["responsive_search", "responsive_display"],
    objectives: ["traffic", "leads", "sales"],
    currencies: ["USD", "CAD"],
    supportsPublishing: true,
    supportsReporting: true,
    connectionLimitations: "Requires a GrowthOS Google Ads developer token in addition to customer OAuth.",
  },
  ga4: {
    provider: "ga4",
    label: "Google Analytics 4",
    channels: [],
    formats: [],
    objectives: [],
    currencies: ["USD", "CAD"],
    supportsPublishing: false,
    supportsReporting: true,
  },
  tiktok_ads: {
    provider: "tiktok_ads",
    label: "TikTok Ads",
    channels: ["tiktok_ads"],
    formats: ["static_carousel"],
    objectives: ["traffic", "conversions"],
    currencies: ["USD", "CAD"],
    supportsPublishing: true,
    supportsReporting: true,
    connectionLimitations: "Carousel availability and objectives are discovered per advertiser account.",
  },
  tiktok_organic: {
    provider: "tiktok_organic",
    label: "TikTok Organic",
    channels: ["tiktok"],
    formats: ["photo", "photo_carousel"],
    objectives: ["awareness", "engagement"],
    currencies: ["USD", "CAD"],
    supportsPublishing: true,
    supportsReporting: true,
    connectionLimitations: "V1 publishes photos only. Public posting requires TikTok audit approval.",
  },
  reddit_ads: {
    provider: "reddit_ads",
    label: "Reddit Ads",
    channels: ["reddit_ads"],
    formats: ["image", "carousel"],
    objectives: ["awareness", "traffic", "conversions"],
    currencies: ["USD", "CAD"],
    supportsPublishing: true,
    supportsReporting: true,
  },
  linkedin_pages: {
    provider: "linkedin_pages",
    label: "LinkedIn Pages",
    channels: ["linkedin"],
    formats: ["text", "image", "document"],
    objectives: ["awareness", "engagement", "traffic"],
    currencies: ["USD", "CAD"],
    supportsPublishing: true,
    supportsReporting: true,
    connectionLimitations: "Organization publishing only; personal profiles and paid LinkedIn are excluded.",
  },
  chatgpt_ads: {
    provider: "chatgpt_ads",
    label: "ChatGPT Ads",
    channels: ["chatgpt_ads"],
    formats: ["text", "image"],
    objectives: ["awareness", "traffic", "conversions"],
    currencies: ["USD", "CAD"],
    supportsPublishing: true,
    supportsReporting: true,
    connectionLimitations: "Early Access. Each customer supplies an account-scoped Advertiser API key; OAuth is not available.",
  },
};

export const templateVariableSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "product", "service", "url", "date", "location", "offer", "promo_code"]),
  required: z.boolean(),
  placeholder: z.string().optional(),
});

export const templateAssetRecipeSchema = z.object({
  id: z.string().min(1),
  channel: z.enum(CHANNEL_KEYS),
  format: z.enum(["static_image", "carousel", "photo", "photo_carousel", "text", "document", "responsive_search", "responsive_display"]),
  aspectRatio: z.string(),
  slideCount: z.number().int().min(1).max(10).default(1),
  copyIntent: z.string(),
  exampleHeadline: z.string(),
  exampleBody: z.string(),
  cta: z.string(),
});

export const templateManifestSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().min(1),
  summary: z.string().min(1),
  outcome: z.string().min(1),
  businessTypes: z.array(z.enum(["ecommerce", "service"])).min(1),
  goals: z.array(z.string()).min(1),
  channels: z.array(z.enum(CHANNEL_KEYS)).min(1),
  durationDays: z.number().int().positive(),
  variables: z.array(templateVariableSchema),
  assets: z.array(templateAssetRecipeSchema).min(1),
  defaultCadence: z.array(z.object({ day: z.number().int().min(0), assetId: z.string() })),
  eligibility: z.array(z.object({ provider: z.enum(PROVIDER_KEYS), requirement: z.string() })),
});

export type TemplateManifest = z.infer<typeof templateManifestSchema>;

export const creativeLayerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("subject"), mediaId: z.string().uuid(), x: z.number(), y: z.number(), width: z.number(), height: z.number(), preserveOriginal: z.literal(true) }),
  z.object({ kind: z.literal("text"), text: z.string(), role: z.enum(["headline", "body", "cta", "legal"]), x: z.number(), y: z.number(), width: z.number(), color: z.string(), align: z.enum(["left", "center", "right"]) }),
  z.object({ kind: z.literal("shape"), shape: z.enum(["rect", "circle", "line"]), x: z.number(), y: z.number(), width: z.number(), height: z.number(), fill: z.string() }),
  z.object({ kind: z.literal("background"), color: z.string(), generatedMediaId: z.string().uuid().optional() }),
]);

export const creativeSceneSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  layers: z.array(creativeLayerSchema),
});
export type CreativeScene = z.infer<typeof creativeSceneSchema>;

export const campaignContentSchema = z.object({
  id: z.string().uuid(),
  channel: z.enum(CHANNEL_KEYS),
  format: z.string(),
  headline: z.string(),
  body: z.string(),
  cta: z.string(),
  destinationUrl: z.string().url(),
  carouselSlides: z.array(z.object({ headline: z.string(), body: z.string(), mediaId: z.string().uuid().nullable() })).default([]),
  searchHeadlines: z.array(z.string().min(1).max(30)).min(3).max(15).optional(),
  searchDescriptions: z.array(z.string().min(1).max(90)).min(2).max(4).optional(),
  searchKeywords: z
    .array(z.string().trim().min(1).max(80))
    .min(1)
    .max(50)
    .optional(),
  mediaIds: z.array(z.string().uuid()),
  accountId: z.string().uuid().nullable(),
  targeting: z.record(z.unknown()),
  publishingOptions: z
    .object({
      privacy: z.string().nullable(),
      commentsEnabled: z.boolean(),
    })
    .nullable()
    .default(null),
  scheduledFor: z.string().datetime().nullable(),
  scene: creativeSceneSchema.nullable(),
  unresolvedFields: z.array(z.string()),
});

export const campaignPlanSchema = z.object({
  name: z.string().min(1).max(160),
  objective: z.string().min(1).max(2000),
  productServiceId: z.string().uuid(),
  landingUrl: z.string().url(),
  currency: z.enum(["USD", "CAD"]),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable(),
  dailyBudgetCents: z.number().int().positive().nullable(),
  lifetimeBudgetCents: z.number().int().positive().nullable(),
  channels: z.array(z.enum(CHANNEL_KEYS)).min(1),
  content: z.array(campaignContentSchema).min(1),
  template: z.object({ id: z.string(), version: z.number().int().positive() }).nullable(),
});
export type CampaignPlan = z.infer<typeof campaignPlanSchema>;

export type CampaignDeployment = {
  id: string;
  campaignId: string;
  channel: ChannelKey;
  providerAccountId: string;
  externalCampaignId: string | null;
  status: "validating" | "paused" | "active" | "paused_after_failure" | "needs_attention" | "failed" | "completed";
};

export type PublishJob = {
  id: string;
  scheduleId: string;
  idempotencyKey: string;
  status: "queued" | "running" | "published" | "retrying" | "dead_letter" | "cancelled";
  attemptCount: number;
  runAfter: string;
};

export type MetricSnapshot = {
  provider: ProviderKey;
  sourceModel: string;
  periodStart: string;
  periodEnd: string;
  currency: "USD" | "CAD" | null;
  metrics: Record<string, number>;
};

export type OperationResult<T> =
  | { ok: true; data: T; operationId: string; auditEventId: string }
  | { ok: false; errors: Array<{ code: string; message: string; field?: string; recoverable: boolean }>; operationId: string; auditEventId: string };

export function approvalBlockers(plan: CampaignPlan): string[] {
  const blockers = new Set<string>();
  const paidChannels = new Set<ChannelKey>([
    "meta_ads",
    "google_search",
    "google_display",
    "tiktok_ads",
    "reddit_ads",
    "chatgpt_ads",
  ]);
  if (!plan.productServiceId) blockers.add("Choose a product or service");
  if (!plan.landingUrl) blockers.add("Add a landing URL");
  for (const item of plan.content) {
    for (const field of item.unresolvedFields) blockers.add(`${channelLabels[item.channel]}: ${field}`);
    if (!item.destinationUrl) blockers.add(`${channelLabels[item.channel]}: add a destination URL`);
    if (item.channel === "google_search" && (item.searchHeadlines?.length ?? 0) < 3)
      blockers.add("Google Search: add at least three final headlines");
    if (item.channel === "google_search" && (item.searchDescriptions?.length ?? 0) < 2)
      blockers.add("Google Search: add at least two final descriptions");
    if (item.channel === "google_search" && (item.searchKeywords?.length ?? 0) < 1)
      blockers.add("Google Search: add at least one reviewed keyword");
    if (item.channel !== "google_search" && item.mediaIds.length === 0) blockers.add(`${channelLabels[item.channel]}: add a real image`);
    if (
      paidChannels.has(item.channel) &&
      (!Array.isArray(item.targeting.countries) ||
        item.targeting.countries.length === 0)
    )
      blockers.add(
        `${channelLabels[item.channel]}: choose at least one target country`,
      );
    if (item.channel === "tiktok" && !item.publishingOptions?.privacy)
      blockers.add("TikTok: choose a current creator privacy option");
    if (!item.accountId) {
      blockers.add(`${channelLabels[item.channel]}: select a real destination account`);
    }
  }
  return [...blockers];
}

export function canApprovePlan(plan: CampaignPlan): boolean {
  return approvalBlockers(plan).length === 0;
}
