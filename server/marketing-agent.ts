import type { CampaignTemplate } from "@/lib/campaign-templates";
import type {
  AppState,
  MarketingAgentMode,
  MarketingAgentProposal,
  MarketingAgentStep,
} from "@/lib/types";

export type MarketingAgentTool =
  | "read_marketing_context"
  | "analyze_opportunities"
  | "select_audience"
  | "assemble_campaign"
  | "validate_destinations"
  | "forecast_outcome";

export type MarketingAgentInput = {
  objective: string;
  mode: MarketingAgentMode;
  state: AppState;
  now?: Date;
};

export type MarketingAgentOutput = {
  proposal: MarketingAgentProposal;
  steps: Array<Omit<MarketingAgentStep, "id" | "createdAt">>;
};

export interface MarketingAgent {
  propose(input: MarketingAgentInput): Promise<MarketingAgentOutput>;
}

const keywordTemplates: Array<[RegExp, string]> = [
  [/black friday|bfcm/i, "template-bfcm"],
  [/cyber monday/i, "template-cyber-monday"],
  [/halloween/i, "template-halloween"],
  [/holiday|gift guide/i, "template-holiday-guide"],
  [/webinar|event|registration/i, "template-webinar"],
  [/win.?back|re-?engage|lapsed|dormant|retention/i, "template-winback"],
  [/launch|release|announce/i, "template-product-launch"],
];

export function selectAgentTemplate(
  objective: string,
  mode: MarketingAgentMode,
  templates: CampaignTemplate[],
) {
  const keywordMatch = keywordTemplates.find(([pattern]) =>
    pattern.test(objective),
  )?.[1];
  const fallback =
    mode === "LIFECYCLE"
      ? "template-winback"
      : mode === "PERFORMANCE"
        ? "template-product-content-showcase"
        : "template-product-launch";
  return (
    templates.find((template) => template.id === keywordMatch) ??
    templates.find((template) => template.id === fallback) ??
    templates[0]
  );
}

function providerAliases(channel: string) {
  const normalized = channel.toLowerCase();
  if (normalized.includes("email") || normalized.includes("sms"))
    return ["klaviyo", "mailchimp", "hubspot"];
  if (normalized.includes("instagram") || normalized.includes("facebook"))
    return normalized.includes("ads")
      ? ["meta ads"]
      : ["instagram", "linkedin"];
  if (normalized.includes("linkedin"))
    return normalized.includes("ads") ? ["linkedin ads"] : ["linkedin"];
  if (normalized.includes("google")) return ["google ads"];
  if (normalized.includes("meta")) return ["meta ads"];
  if (normalized.includes("tiktok")) return ["tiktok ads"];
  if (normalized.includes("blog") || normalized.includes("web"))
    return ["wordpress", "website"];
  return [normalized];
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function campaignName(template: CampaignTemplate, objective: string) {
  const clean = objective.replace(/[.!?]+$/, "").trim();
  const concise = clean.split(/\s+/).slice(0, 7).join(" ");
  if (concise.length >= 12)
    return concise.replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `${template.name} campaign`;
}

function audienceFor(input: MarketingAgentInput) {
  const objective = input.objective.toLowerCase();
  return (
    input.state.audiences.find((audience) =>
      /win.?back|re-?engage|trial|dormant|lapsed/.test(objective)
        ? audience.name.toLowerCase().includes("trial")
        : input.mode === "PERFORMANCE"
          ? audience.destinations.some((destination) =>
              destination.toLowerCase().includes("ads"),
            )
          : false,
    ) ?? input.state.audiences[0]
  );
}

export class MockMarketingAgent implements MarketingAgent {
  async propose(input: MarketingAgentInput): Promise<MarketingAgentOutput> {
    const template = selectAgentTemplate(
      input.objective,
      input.mode,
      input.state.templates,
    );
    if (!template) throw new Error("No campaign template is available.");
    const audience = audienceFor(input);
    if (!audience) throw new Error("No eligible audience is available.");

    const start = new Date(input.now ?? new Date());
    start.setUTCDate(start.getUTCDate() + 2);
    const startDate = dateOnly(start);
    const variables = Object.fromEntries(
      template.variables.map((variable) => [variable.key, variable.defaultValue]),
    );
    if ("productName" in variables)
      variables.productName = `${input.state.brand.name} Growth Signals`;
    if ("productBenefit" in variables)
      variables.productBenefit = input.state.brand.valueProposition;

    const destinations = Array.from(new Set(template.channels)).map(
      (channel) => {
        const aliases = providerAliases(channel);
        const definition = input.state.definitions.find((item) =>
          aliases.some((alias) => item.name.toLowerCase().includes(alias)),
        );
        const connection = definition
          ? input.state.connections.find(
              (item) => item.definitionId === definition.id,
            )
          : undefined;
        const ready = connection?.state === "CONNECTED";
        return {
          channel,
          provider: definition?.name ?? "No connected provider",
          state: ready
            ? ("READY" as const)
            : connection
              ? ("ATTENTION" as const)
              : ("UNAVAILABLE" as const),
          detail: ready
            ? "Connected and available after approval"
            : connection?.lastError ??
              "Drafts can be created now; connect a provider before launch",
        };
      },
    );
    const metricWindow = input.state.metrics.slice(-14);
    const leads = metricWindow.reduce((sum, item) => sum + item.leads, 0);
    const revenue = metricWindow.reduce((sum, item) => sum + item.revenue, 0);
    const opportunity =
      input.state.insights.find((insight) =>
        input.mode === "PERFORMANCE"
          ? insight.kind === "WARNING"
          : insight.kind === "OPPORTUNITY",
      ) ?? input.state.insights[0];
    const readyDestinations = destinations.filter(
      (item) => item.state === "READY",
    ).length;
    const proposal: MarketingAgentProposal = {
      name: campaignName(template, input.objective),
      summary: `A ${template.durationDays}-day ${input.mode.toLowerCase().replace("_", "-")} campaign assembled from approved brand context, customer signals, and channel-ready templates.`,
      mode: input.mode,
      templateId: template.id,
      templateName: template.name,
      startDate,
      variables,
      audience: {
        id: audience.id,
        name: audience.name,
        size: audience.size,
        excluded: audience.excluded,
        eligible: Math.max(0, audience.size - audience.excluded),
      },
      channels: template.channels,
      assetCount: template.assets.length,
      budget: template.recommendedBudget,
      forecast: {
        primary: input.mode === "LIFECYCLE" ? "Qualified responses" : "Leads",
        range: `${Math.max(18, Math.round(leads * 0.06))}–${Math.max(29, Math.round(leads * 0.1))}`,
        confidence: opportunity?.confidence ?? 78,
        basis: `${metricWindow.length} days of performance, ${audience.size.toLocaleString("en-CA")} audience records, and ${readyDestinations}/${destinations.length} ready destinations`,
      },
      destinations,
      evidence: [
        {
          label: "Opportunity",
          value: opportunity?.title ?? "Create a coordinated campaign",
          source: "Insights",
          tone: opportunity?.kind === "WARNING" ? "WARNING" : "POSITIVE",
        },
        {
          label: "Customer context",
          value: `${audience.size.toLocaleString("en-CA")} matched records; ${audience.excluded.toLocaleString("en-CA")} consent or suppression exclusions`,
          source: "Audience Builder",
          tone: "NEUTRAL",
        },
        {
          label: "Recent baseline",
          value: `${leads.toLocaleString("en-CA")} leads and $${revenue.toLocaleString("en-CA")} attributed revenue in 14 days`,
          source: "Measurement",
          tone: "POSITIVE",
        },
      ],
      guardrails: [
        `Use ${input.state.brand.voice.tone.toLowerCase()} language and avoid ${input.state.brand.voice.avoid.slice(0, 2).join(" and ")}.`,
        `${audience.excluded.toLocaleString("en-CA")} ineligible records remain excluded from activation.`,
        "Every asset stays editable and requires human approval before publishing.",
        input.mode === "PERFORMANCE"
          ? "Any provider ad campaign is created paused; budget activation requires a separate confirmation."
          : "No message is exported or sent during this run.",
      ],
      requiresConfirmation: true,
      execution: {
        createCampaign: true,
        createPaidAd:
          input.mode !== "LIFECYCLE" &&
          template.channels.some((channel) =>
            channel.toLowerCase().includes("ads"),
          ),
        publish: false,
        submitApproval: false,
      },
    };

    const timestamp = (input.now ?? new Date()).toISOString();
    const step = (
      position: number,
      tool: MarketingAgentTool,
      title: string,
      detail: string,
      output: Record<string, unknown>,
    ): Omit<MarketingAgentStep, "id" | "createdAt"> => ({
      position,
      tool,
      title,
      detail,
      state: "COMPLETED",
      output: { ...output, completedAt: timestamp },
    });
    return {
      proposal,
      steps: [
        step(
          1,
          "read_marketing_context",
          "Loaded marketing context",
          `Read the Brand Kit, ${input.state.sources.length} sources, approved media, and workspace guardrails.`,
          { brand: input.state.brand.name, sources: input.state.sources.length },
        ),
        step(
          2,
          "analyze_opportunities",
          "Found the strongest opportunity",
          opportunity?.evidence ?? "Used current campaign performance and workspace priorities.",
          { insightId: opportunity?.id, confidence: opportunity?.confidence },
        ),
        step(
          3,
          "select_audience",
          "Selected a consent-safe audience",
          `${proposal.audience.eligible.toLocaleString("en-CA")} eligible people remain after exclusions.`,
          { audienceId: audience.id, eligible: proposal.audience.eligible },
        ),
        step(
          4,
          "assemble_campaign",
          "Assembled the campaign bundle",
          `Adapted ${template.name} into ${template.assets.length} channel-specific drafts.`,
          { templateId: template.id, assets: template.assets.length },
        ),
        step(
          5,
          "validate_destinations",
          "Checked destinations and safeguards",
          `${readyDestinations} destinations are ready; attention items are disclosed before execution.`,
          { ready: readyDestinations, total: destinations.length },
        ),
        step(
          6,
          "forecast_outcome",
          "Prepared an evidence-backed forecast",
          `${proposal.forecast.range} ${proposal.forecast.primary.toLowerCase()} with ${proposal.forecast.confidence}% confidence.`,
          { range: proposal.forecast.range, confidence: proposal.forecast.confidence },
        ),
      ],
    };
  }
}

export function getMarketingAgent(): MarketingAgent {
  return new MockMarketingAgent();
}
