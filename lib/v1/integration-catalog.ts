import type { ProviderKey } from "@/lib/v1/domain";

export const INTEGRATION_CATEGORY_KEYS = [
  "data",
  "advertising",
  "messaging",
  "social",
] as const;

export type IntegrationCategoryKey =
  (typeof INTEGRATION_CATEGORY_KEYS)[number];

export type IntegrationCatalogEntry = {
  id: string;
  label: string;
  category: IntegrationCategoryKey;
  description: string;
  capabilities: string[];
  provider?: ProviderKey;
  nativeHref?: string;
  availability: "provider" | "native" | "planned";
  note?: string;
};

export const integrationCategories: Array<{
  key: IntegrationCategoryKey;
  label: string;
  noun: string;
  description: string;
}> = [
  {
    key: "data",
    label: "Data",
    noun: "sources",
    description:
      "Bring in customer, commerce, CRM, warehouse, and measurement context.",
  },
  {
    key: "advertising",
    label: "Advertising",
    noun: "ad platforms",
    description:
      "Create paid resources paused, verify delivery, and launch with confirmation.",
  },
  {
    key: "messaging",
    label: "Messaging",
    noun: "email & SMS tools",
    description:
      "Connect verified senders while preserving consent, suppressions, and delivery state.",
  },
  {
    key: "social",
    label: "Social",
    noun: "publishing channels",
    description:
      "Publish approved organic content through business-owned profiles and Pages.",
  },
];

export const providerPrimaryCategory: Record<
  ProviderKey,
  IntegrationCategoryKey
> = {
  meta_business: "advertising",
  google_ads: "advertising",
  ga4: "data",
  tiktok_ads: "advertising",
  tiktok_organic: "social",
  reddit_ads: "advertising",
  linkedin_pages: "social",
  chatgpt_ads: "advertising",
  twilio_messaging: "messaging",
  sendgrid_email: "messaging",
};

export const integrationCatalog: IntegrationCatalogEntry[] = [
  {
    id: "ga4",
    label: "Google Analytics 4",
    category: "data",
    description:
      "Read sessions and key events from a selected GA4 property without blending attribution models.",
    capabilities: ["Web analytics", "Key events", "Read-only"],
    provider: "ga4",
    availability: "provider",
  },
  {
    id: "csv_contacts",
    label: "CSV customer import",
    category: "data",
    description:
      "Import customer records and explicit email or SMS consent into a real GrowthOS audience.",
    capabilities: ["Customer data", "Consent proof", "Audience lists"],
    nativeHref: "/app/manage/contacts",
    availability: "native",
    note: "Available now",
  },
  {
    id: "google_sheets",
    label: "Google Sheets",
    category: "data",
    description:
      "Map a sheet of consented customers, products, or campaign inputs into GrowthOS.",
    capabilities: ["Customer data", "Products", "Scheduled import"],
    availability: "planned",
    note: "OAuth and incremental sync planned",
  },
  {
    id: "shopify",
    label: "Shopify",
    category: "data",
    description:
      "Import products, customers, orders, and consent from a customer-owned Shopify store.",
    capabilities: ["Products", "Customers", "Orders"],
    availability: "planned",
    note: "Admin API review required",
  },
  {
    id: "hubspot",
    label: "HubSpot",
    category: "data",
    description:
      "Use CRM contacts, lifecycle stages, lists, and campaign outcomes as marketing context.",
    capabilities: ["CRM", "Lists", "Lifecycle stages"],
    availability: "planned",
    note: "OAuth connector planned",
  },
  {
    id: "snowflake",
    label: "Snowflake",
    category: "data",
    description:
      "Read approved models from a customer warehouse with scoped, read-only credentials.",
    capabilities: ["Warehouse", "Audiences", "Read-only models"],
    availability: "planned",
    note: "Enterprise data source planned",
  },
  {
    id: "bigquery",
    label: "BigQuery",
    category: "data",
    description:
      "Read selected datasets for audience building, product context, and measurement.",
    capabilities: ["Warehouse", "Audiences", "Measurement"],
    availability: "planned",
    note: "Service-account model under review",
  },
  {
    id: "segment",
    label: "Segment",
    category: "data",
    description:
      "Use consented customer traits and events without duplicating the source of truth.",
    capabilities: ["CDP", "Traits", "Events"],
    availability: "planned",
    note: "Source connector planned",
  },
  {
    id: "meta_ads",
    label: "Meta Ads",
    category: "advertising",
    description:
      "Create and manage paused image and carousel campaigns for Facebook and Instagram.",
    capabilities: ["Facebook Ads", "Instagram Ads", "Reporting"],
    provider: "meta_business",
    availability: "provider",
  },
  {
    id: "google_ads",
    label: "Google Ads",
    category: "advertising",
    description:
      "Create paused responsive Search and Display campaigns in eligible client accounts.",
    capabilities: ["Search", "Display", "Reporting"],
    provider: "google_ads",
    availability: "provider",
  },
  {
    id: "tiktok_ads",
    label: "TikTok Ads",
    category: "advertising",
    description:
      "Create supported static carousel campaigns after advertiser-specific eligibility checks.",
    capabilities: ["Static carousel", "Paid delivery", "Reporting"],
    provider: "tiktok_ads",
    availability: "provider",
  },
  {
    id: "reddit_ads",
    label: "Reddit Ads",
    category: "advertising",
    description:
      "Create paused campaigns, ad groups, posts, and ads with real Reddit previews.",
    capabilities: ["Image ads", "Carousel", "Reporting"],
    provider: "reddit_ads",
    availability: "provider",
  },
  {
    id: "chatgpt_ads",
    label: "ChatGPT Ads",
    category: "advertising",
    description:
      "Connect an approved advertiser account with an account-scoped Advertiser API key.",
    capabilities: ["Early access", "Paid delivery", "Insights"],
    provider: "chatgpt_ads",
    availability: "provider",
  },
  {
    id: "linkedin_ads",
    label: "LinkedIn Ads",
    category: "advertising",
    description:
      "Reach professional audiences through customer-owned LinkedIn ad accounts.",
    capabilities: ["B2B audiences", "Lead generation", "Reporting"],
    availability: "planned",
    note: "Paid LinkedIn is outside the current V1",
  },
  {
    id: "microsoft_ads",
    label: "Microsoft Advertising",
    category: "advertising",
    description:
      "Extend Search campaigns to eligible Microsoft Advertising accounts.",
    capabilities: ["Search", "Audience ads", "Reporting"],
    availability: "planned",
    note: "Roadmap candidate",
  },
  {
    id: "sendgrid_email",
    label: "Twilio SendGrid",
    category: "messaging",
    description:
      "Send campaign email through a domain-authenticated sender and signed delivery webhook.",
    capabilities: ["Email", "Unsubscribe", "Delivery events"],
    provider: "sendgrid_email",
    availability: "provider",
  },
  {
    id: "twilio_sms",
    label: "Twilio Messaging",
    category: "messaging",
    description:
      "Send compliant SMS through a customer-owned Messaging Service with signed STOP handling.",
    capabilities: ["SMS", "A2P readiness", "Delivery events"],
    provider: "twilio_messaging",
    availability: "provider",
  },
  {
    id: "klaviyo",
    label: "Klaviyo",
    category: "messaging",
    description:
      "Deliver email and SMS through existing Klaviyo lists, consent profiles, and sending identities.",
    capabilities: ["Email", "SMS", "Profiles & lists"],
    availability: "planned",
    note: "API and consent mapping planned",
  },
  {
    id: "mailchimp",
    label: "Mailchimp",
    category: "messaging",
    description:
      "Send email through an existing audience while preserving unsubscribe state.",
    capabilities: ["Email", "Audiences", "Reporting"],
    availability: "planned",
    note: "Roadmap candidate",
  },
  {
    id: "customer_io",
    label: "Customer.io",
    category: "messaging",
    description:
      "Trigger messages through an existing workspace using consented profiles and events.",
    capabilities: ["Email", "SMS", "Journeys"],
    availability: "planned",
    note: "Roadmap candidate",
  },
  {
    id: "facebook_instagram",
    label: "Facebook & Instagram",
    category: "social",
    description:
      "Publish approved static posts and carousels to Pages and professional Instagram accounts.",
    capabilities: ["Facebook Pages", "Instagram", "Organic insights"],
    provider: "meta_business",
    availability: "provider",
  },
  {
    id: "tiktok_organic",
    label: "TikTok",
    category: "social",
    description:
      "Publish approved photo posts and carousels with current creator privacy options.",
    capabilities: ["Photo posts", "Carousels", "Engagement"],
    provider: "tiktok_organic",
    availability: "provider",
  },
  {
    id: "linkedin_pages",
    label: "LinkedIn Pages",
    category: "social",
    description:
      "Publish text, image, and document posts to organizations the user administers.",
    capabilities: ["Organization Pages", "Documents", "Page statistics"],
    provider: "linkedin_pages",
    availability: "provider",
  },
];

export function isIntegrationCategory(
  value: string | undefined,
): value is IntegrationCategoryKey {
  return INTEGRATION_CATEGORY_KEYS.includes(value as IntegrationCategoryKey);
}

