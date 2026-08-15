import { z } from "zod";
import type { BrandProfile, ContentItem } from "@/lib/types";

export const campaignPlanSchema = z.object({
  title: z.string().min(3),
  summary: z.string().min(10),
  objective: z.string().min(3),
  targetAudience: z.string().min(3),
  offer: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  channels: z.array(z.string()).min(1),
  topics: z.array(z.string()).min(2),
  contentItems: z
    .array(
      z.object({
        channel: z.string(),
        type: z.string(),
        title: z.string(),
        body: z.string(),
      }),
    )
    .min(1),
  successMetrics: z.array(z.string()),
  assumptions: z.array(z.string()),
  risks: z.array(z.string()),
});

export type CampaignPlan = z.infer<typeof campaignPlanSchema>;
export type CampaignGenerationInput = {
  prompt: string;
  channels: string[];
  brand: BrandProfile;
};
export type BrandProfileInput = {
  websiteText: string;
  existing?: BrandProfile;
};
export type BrandProfileDraft = Pick<
  BrandProfile,
  "description" | "valueProposition" | "audiences"
>;
export type ContentRegenerationInput = {
  content: ContentItem;
  instruction?: string;
  brand: BrandProfile;
};
export type PerformanceSummaryInput = {
  impressions: number;
  clicks: number;
  leads: number;
  spend: number;
};
export type PerformanceInsightDraft = {
  title: string;
  evidence: string;
  confidence: number;
  expectedEffect: string;
  action: string;
};

export interface AIProvider {
  generateBrandProfile(input: BrandProfileInput): Promise<BrandProfileDraft>;
  generateCampaign(input: CampaignGenerationInput): Promise<CampaignPlan>;
  regenerateContent(input: ContentRegenerationInput): Promise<ContentItem>;
  summarizePerformance(
    input: PerformanceSummaryInput,
  ): Promise<PerformanceInsightDraft[]>;
}

function campaignTitle(prompt: string) {
  const clean = prompt
    .replace(/^(create|build|launch|generate)\s+(a\s+)?/i, "")
    .replace(/[.?!]+$/, "")
    .trim();
  const concise = clean.split(/\s+/).slice(0, 7).join(" ");
  return concise
    ? concise.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Growth Campaign";
}

function channelContent(channel: string, title: string, brand: BrandProfile) {
  const lower = channel.toLowerCase();
  if (lower.includes("email") || lower.includes("klaviyo"))
    return {
      channel,
      type: "Campaign email",
      title: `A clearer path to ${title.toLowerCase()}`,
      body: `Your next growth move should not be buried in another dashboard. ${brand.name} turns customer signals into a focused plan your team can act on. See the opportunity and decide what comes next.`,
    };
  if (
    lower.includes("ads") ||
    lower.includes("meta") ||
    lower.includes("google")
  )
    return {
      channel,
      type: "Paid ad",
      title: "Turn signals into action",
      body: `Find the growth opportunities already visible in your customer data. Build a clearer next move with ${brand.name}.`,
    };
  if (lower.includes("linkedin"))
    return {
      channel,
      type: "Organic post",
      title: `${title}: the signal behind the strategy`,
      body: `Most growth teams do not need more data. They need a clearer decision. ${brand.name} connects the signal, the audience, and the next action—so good opportunities do not sit unnoticed.`,
    };
  return {
    channel,
    type: "Organic content",
    title,
    body: `Build clarity and momentum with a campaign grounded in real customer signals and the voice your audience already trusts.`,
  };
}

export class MockAIProvider implements AIProvider {
  async generateBrandProfile(input: BrandProfileInput) {
    return {
      description:
        input.existing?.description ?? input.websiteText.slice(0, 320),
      valueProposition:
        input.existing?.valueProposition ??
        "Turn customer signals into focused marketing action.",
      audiences: input.existing?.audiences ?? [
        "Growth leaders",
        "Marketing operators",
      ],
    };
  }
  async generateCampaign(
    input: CampaignGenerationInput,
  ): Promise<CampaignPlan> {
    const title = campaignTitle(input.prompt);
    const plan = {
      title,
      summary: `A coordinated campaign for ${input.prompt.toLowerCase()}, grounded in Northstar's brand and customer context.`,
      objective: input.prompt,
      targetAudience: "Growth leaders at small and mid-sized SaaS teams",
      offer: "A practical growth signal review",
      startDate: "2026-08-24",
      endDate: "2026-09-14",
      channels: input.channels,
      topics: [
        "Signal to action",
        "Faster growth decisions",
        "Customer journey clarity",
      ],
      contentItems: input.channels.map((channel) =>
        channelContent(channel, title, input.brand),
      ),
      successMetrics: [
        "75 qualified demo bookings",
        "3.5% campaign click-through rate",
      ],
      assumptions: [
        "The selected channels remain connected",
        "Brand Kit guidance is current",
      ],
      risks: [
        "Cross-channel repetition",
        "Technical messaging may reduce clarity",
      ],
    };
    return campaignPlanSchema.parse(plan);
  }
  async regenerateContent(
    input: ContentRegenerationInput,
  ): Promise<ContentItem> {
    return {
      ...input.content,
      body: `${input.content.body.split(".")[0]}. Make the next move obvious: use ${input.brand.name} to turn a real customer signal into a focused action your team can take today.`,
      version: input.content.version + 1,
    };
  }
  async summarizePerformance(input: PerformanceSummaryInput) {
    const ctr = input.impressions
      ? (input.clicks / input.impressions) * 100
      : 0;
    return [
      {
        title: "Reuse your clearest growth narrative",
        evidence: `Your current click-through rate is ${ctr.toFixed(1)}%.`,
        confidence: 86,
        expectedEffect: "+10–15% qualified traffic",
        action: "Create a follow-up campaign around the strongest topic",
      },
    ];
  }
}

const brandProfileDraftSchema = z.object({
  description: z.string().min(10),
  valueProposition: z.string().min(5),
  audiences: z.array(z.string().min(2)).min(1),
});

const regeneratedContentSchema = z.object({
  title: z.string().min(3).optional(),
  body: z.string().min(10),
});

const performanceInsightSchema = z.array(
  z.object({
    title: z.string().min(3),
    evidence: z.string().min(3),
    confidence: z.number().min(0).max(100),
    expectedEffect: z.string().min(3),
    action: z.string().min(3),
  }),
);

type RemoteAIProviderOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
};

/**
 * Vendor-neutral JSON provider boundary. The configured endpoint receives
 * `{ model, operation, input }` and may return either the structured value
 * directly or wrapped in `{ data }` / `{ output }`.
 */
export class RemoteAIProvider implements AIProvider {
  private readonly fallback = new MockAIProvider();

  constructor(private readonly options: RemoteAIProviderOptions) {}

  private async request(operation: string, input: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 20_000,
    );
    try {
      const response = await fetch(this.options.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.options.model,
          operation,
          input,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Remote AI provider returned ${response.status}`);
      }
      const payload = (await response.json()) as {
        data?: unknown;
        output?: unknown;
      };
      return payload.data ?? payload.output ?? payload;
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateBrandProfile(
    input: BrandProfileInput,
  ): Promise<BrandProfileDraft> {
    try {
      return brandProfileDraftSchema.parse(
        await this.request("generate_brand_profile", input),
      );
    } catch {
      return this.fallback.generateBrandProfile(input);
    }
  }

  async generateCampaign(
    input: CampaignGenerationInput,
  ): Promise<CampaignPlan> {
    try {
      return campaignPlanSchema.parse(
        await this.request("generate_campaign", input),
      );
    } catch {
      return this.fallback.generateCampaign(input);
    }
  }

  async regenerateContent(
    input: ContentRegenerationInput,
  ): Promise<ContentItem> {
    try {
      const draft = regeneratedContentSchema.parse(
        await this.request("regenerate_content", input),
      );
      return {
        ...input.content,
        ...draft,
        version: input.content.version + 1,
      };
    } catch {
      return this.fallback.regenerateContent(input);
    }
  }

  async summarizePerformance(
    input: PerformanceSummaryInput,
  ): Promise<PerformanceInsightDraft[]> {
    try {
      return performanceInsightSchema.parse(
        await this.request("summarize_performance", input),
      );
    } catch {
      return this.fallback.summarizePerformance(input);
    }
  }
}

type ProviderEnvironment = Partial<
  Record<
    | "AI_PROVIDER"
    | "AI_PROVIDER_API_KEY"
    | "AI_PROVIDER_MODEL"
    | "AI_PROVIDER_BASE_URL",
    string
  >
>;

export function getAIProvider(
  environment: ProviderEnvironment = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_PROVIDER_API_KEY: process.env.AI_PROVIDER_API_KEY,
    AI_PROVIDER_MODEL: process.env.AI_PROVIDER_MODEL,
    AI_PROVIDER_BASE_URL: process.env.AI_PROVIDER_BASE_URL,
  },
): AIProvider {
  if (
    environment.AI_PROVIDER === "remote" &&
    environment.AI_PROVIDER_API_KEY &&
    environment.AI_PROVIDER_MODEL &&
    environment.AI_PROVIDER_BASE_URL
  ) {
    return new RemoteAIProvider({
      apiKey: environment.AI_PROVIDER_API_KEY,
      model: environment.AI_PROVIDER_MODEL,
      baseUrl: environment.AI_PROVIDER_BASE_URL,
    });
  }
  return new MockAIProvider();
}

export type IntegrationCapability =
  | "READ_CONTENT"
  | "READ_METRICS"
  | "READ_CUSTOMERS"
  | "WRITE_AUDIENCE"
  | "PUBLISH_ORGANIC_CONTENT"
  | "CREATE_EMAIL_CAMPAIGN"
  | "CREATE_AD_CAMPAIGN"
  | "UPLOAD_CONVERSION"
  | "SEND_NOTIFICATION";
export type ConnectionTestResult = {
  ok: boolean;
  latencyMs: number;
  account?: string;
  message: string;
};
export type PublishResult = {
  externalId: string;
  status: "PAUSED" | "SCHEDULED" | "PUBLISHED";
};

export interface IntegrationAdapter {
  definitionId: string;
  testConnection(accountName: string): Promise<ConnectionTestResult>;
  getCapabilities(): Promise<IntegrationCapability[]>;
  publishContent?(
    content: ContentItem,
    idempotencyKey: string,
  ): Promise<PublishResult>;
  createAdCampaign?(
    name: string,
    idempotencyKey: string,
  ): Promise<PublishResult>;
  syncAudience?(
    audienceId: string,
    idempotencyKey: string,
  ): Promise<PublishResult>;
}

function stableId(prefix: string, key: string) {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export class MockIntegrationAdapter implements IntegrationAdapter {
  constructor(
    public definitionId: string,
    private capabilities: IntegrationCapability[],
  ) {}
  async testConnection(accountName: string) {
    return {
      ok: true,
      latencyMs: 184,
      account: accountName,
      message: "Connection healthy and permissions confirmed",
    };
  }
  async getCapabilities() {
    return this.capabilities;
  }
  async publishContent(content: ContentItem, idempotencyKey: string) {
    return {
      externalId: stableId(
        this.definitionId.replace("int-", ""),
        idempotencyKey,
      ),
      status: content.scheduledAt
        ? ("SCHEDULED" as const)
        : ("PUBLISHED" as const),
    };
  }
  async createAdCampaign(name: string, idempotencyKey: string) {
    return {
      externalId: stableId(
        `${this.definitionId.replace("int-", "")}_campaign`,
        `${name}:${idempotencyKey}`,
      ),
      status: "PAUSED" as const,
    };
  }
  async syncAudience(audienceId: string, idempotencyKey: string) {
    return {
      externalId: stableId("audience", `${audienceId}:${idempotencyKey}`),
      status: "PUBLISHED" as const,
    };
  }
}

export type AITool =
  | "get_workspace_summary"
  | "list_connections"
  | "get_brand_profile"
  | "create_campaign_draft"
  | "update_campaign_plan"
  | "regenerate_content"
  | "list_pending_approvals"
  | "get_campaign_performance"
  | "draft_audience"
  | "explain_sync_failure";
export type AIProposal = {
  tool: AITool;
  title: string;
  consequence: string;
  requiresConfirmation: boolean;
  payload: Record<string, unknown>;
};
