import type { CampaignTemplate } from "@/lib/campaign-templates";

export const product = {
  name: "GrowthOS",
  tagline: "Campaigns, ready to launch.",
  description:
    "Turn a product and an occasion into a complete, ready-to-review ecommerce campaign.",
  workspace: "Northstar Analytics",
  accent: "#0f766e",
  aiAccent: "#7357d8",
} as const;

export type ChannelKey = "social" | "messaging" | "paid" | "web";

export type ChannelWorkspaceConfig = {
  key: ChannelKey;
  label: string;
  route: string;
  noun: string;
  singular: string;
  description: string;
  icon: string;
  matches: readonly string[];
};

export const channelWorkspaces: Record<ChannelKey, ChannelWorkspaceConfig> = {
  social: {
    key: "social",
    label: "Social",
    route: "/app/channels/social",
    noun: "Posts",
    singular: "Post",
    description: "Plan and publish organic social content.",
    icon: "social",
    matches: [
      "linkedin",
      "instagram",
      "facebook",
      "tiktok",
      "organic social",
      "organic post",
      "social",
    ],
  },
  messaging: {
    key: "messaging",
    label: "Email & Messaging",
    route: "/app/channels/messaging",
    noun: "Messages",
    singular: "Message",
    description: "Create email, SMS, WhatsApp, and push messages.",
    icon: "messaging",
    matches: ["email", "klaviyo", "sms", "whatsapp", "push", "message"],
  },
  paid: {
    key: "paid",
    label: "Paid Ads",
    route: "/app/channels/paid",
    noun: "Ad Campaigns",
    singular: "Ad Campaign",
    description: "Build and monitor paid campaigns across ad platforms.",
    icon: "ads",
    matches: [
      "meta ads",
      "google ads",
      "chatgpt ads",
      "linkedin ads",
      "tiktok ads",
      "paid ad",
      "paid",
    ],
  },
  web: {
    key: "web",
    label: "Web & Content",
    route: "/app/channels/web",
    noun: "Pages",
    singular: "Page",
    description: "Create blog, landing page, website, and SEO content.",
    icon: "web",
    matches: ["blog", "landing page", "website", "web", "seo", "form"],
  },
};

export const channelKeys = Object.keys(channelWorkspaces) as ChannelKey[];

export function classifyChannel(value: string): ChannelKey | "other" {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "other";

  const orderedKeys: ChannelKey[] =
    normalized.includes("ads") || normalized.includes("paid")
      ? ["paid", "social", "messaging", "web"]
      : channelKeys;
  for (const key of orderedKeys) {
    if (
      channelWorkspaces[key].matches.some(
        (match) =>
          normalized === match ||
          normalized.includes(match) ||
          match.includes(normalized),
      )
    ) {
      return key;
    }
  }
  return "other";
}

export function templateMatchesChannel(
  template: Pick<CampaignTemplate, "channels">,
  channel: ChannelKey,
) {
  return template.channels.some((item) => classifyChannel(item) === channel);
}

export type TemplateCollectionKey =
  | "recommended"
  | "product"
  | "seasonal"
  | "lifecycle"
  | "events"
  | "all";

export const templateCollections: Array<{
  key: TemplateCollectionKey;
  label: string;
}> = [
  { key: "recommended", label: "Recommended" },
  { key: "product", label: "Product" },
  { key: "seasonal", label: "Seasonal" },
  { key: "lifecycle", label: "Lifecycle" },
  { key: "events", label: "Events" },
  { key: "all", label: "All" },
];

export function classifyTemplateCollection(
  template: Pick<CampaignTemplate, "category" | "occasion" | "slug">,
): Exclude<TemplateCollectionKey, "recommended" | "all"> {
  const value = `${template.category} ${template.occasion} ${template.slug}`.toLowerCase();
  if (
    value.includes("seasonal") ||
    value.includes("halloween") ||
    value.includes("black friday") ||
    value.includes("bfcm") ||
    value.includes("cyber monday") ||
    value.includes("holiday")
  )
    return "seasonal";
  if (
    value.includes("lifecycle") ||
    value.includes("win-back") ||
    value.includes("winback") ||
    value.includes("welcome") ||
    value.includes("retention")
  )
    return "lifecycle";
  if (value.includes("event") || value.includes("webinar")) return "events";
  return "product";
}

export function templateMatchesSearch(
  template: Pick<
    CampaignTemplate,
    "name" | "description" | "occasion" | "channels" | "assets"
  >,
  query: string,
) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    template.name,
    template.description,
    template.occasion,
    ...template.channels,
    ...template.assets.flatMap((asset) => [
      asset.channel,
      asset.type,
      asset.title,
    ]),
  ].some((value) => value.toLowerCase().includes(normalized));
}

export const primaryNavigation = [
  ["Home", "/app", "home"],
  ["Campaigns", "/app/campaigns", "campaign"],
  ["Products & Brand", "/app/products", "product"],
  ["Approvals", "/app/approvals", "approval"],
  ["Calendar", "/app/calendar", "calendar"],
  ["Results", "/app/results", "insights"],
] as const;

export const channelNavigation: Array<readonly [string, string, string]> = [];

export const operationsNavigation: Array<
  readonly [string, string, string]
> = [];

export const manageNavigation: Array<readonly [string, string, string]> = [];

export const legacyRouteAliases = {
  "/app/paid-ads": "/app/channels/paid",
  "/app/brand-kit": "/app/products",
  "/app/insights": "/app/results",
} as const;

export function resolveLegacyRoute(path: string) {
  return Object.hasOwn(legacyRouteAliases, path)
    ? legacyRouteAliases[path as keyof typeof legacyRouteAliases]
    : path;
}

export const campaignTabKeys = [
  "overview",
  "content",
  "schedule",
  "results",
] as const;
export type CampaignTabKey = (typeof campaignTabKeys)[number];

export function campaignTabRoute(campaignId: string, tab: CampaignTabKey) {
  return `/app/campaigns/${campaignId}/${tab}`;
}

export const navigation = [
  { group: "", items: primaryNavigation },
  { group: "Channels", items: channelNavigation },
  { group: "", items: operationsNavigation },
] as const;
