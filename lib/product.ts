import type { CampaignTemplate } from "@/lib/campaign-templates";

export const product = {
  name: "GrowthOS",
  tagline: "Marketing, orchestrated.",
  description:
    "The AI marketing control plane for planning, creating, approving, activating, and learning across every channel.",
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

export const primaryNavigation = [
  ["Home", "/app", "home"],
  ["Campaigns", "/app/campaigns", "campaign"],
] as const;

export const channelNavigation = channelKeys.map((key) => {
  const item = channelWorkspaces[key];
  return [item.label, item.route, item.icon] as const;
});

export const operationsNavigation = [
  ["Calendar", "/app/calendar", "calendar"],
  ["Approvals", "/app/approvals", "approval"],
  ["Insights", "/app/insights", "insights"],
] as const;

export const manageNavigation = [
  ["Brand & Assets", "/app/brand-kit", "brand"],
  ["Audiences", "/app/audiences", "audience"],
  ["Connections & Syncs", "/app/integrations", "integration"],
  ["Team", "/app/team", "team"],
  ["Audit", "/app/audit-log", "audit"],
  ["Settings", "/app/settings", "settings"],
] as const;

export const legacyRouteAliases = {
  "/app/paid-ads": "/app/channels/paid",
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
