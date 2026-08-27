import type { ProviderKey } from "@/lib/v1/domain";

export type ConnectionCategory =
  | "advertising"
  | "organic"
  | "measurement"
  | "messaging";

export type ConnectionMethod = "oauth" | "api_key" | "credentials";
export type SetupStageKey = "prepare" | "authorize" | "destinations" | "verify";
export type SetupStageState = "complete" | "current" | "upcoming" | "blocked";

export type ProviderOnboardingDefinition = {
  provider: ProviderKey;
  category: ConnectionCategory;
  connectionMethod: ConnectionMethod;
  setupTitle: string;
  summary: string;
  customerOwns: string;
  requirements: string[];
  permissions: string[];
  destinationLabel: string;
  verificationChecks: string[];
  helpUrl: string;
  helpLabel: string;
};

export type SetupConnection = {
  status: string;
  healthError?: Record<string, unknown> | null;
};

export type SetupAccount = {
  accountType: string;
  selected: boolean;
  billingStatus?: string | null;
  capabilities: Record<string, unknown>;
};

export type DerivedProviderSetup = {
  status:
    | "unavailable"
    | "not_started"
    | "authorization_required"
    | "destinations_required"
    | "needs_attention"
    | "ready";
  label: string;
  detail: string;
  nextStage: SetupStageKey;
  stages: Array<{
    key: SetupStageKey;
    label: string;
    state: SetupStageState;
  }>;
  blockers: string[];
};

export const connectionCategoryLabels: Record<ConnectionCategory, string> = {
  advertising: "Advertising",
  organic: "Organic social",
  measurement: "Measurement",
  messaging: "Email & SMS",
};

export const providerOnboarding: Record<
  ProviderKey,
  ProviderOnboardingDefinition
> = {
  meta_business: {
    provider: "meta_business",
    category: "advertising",
    connectionMethod: "oauth",
    setupTitle: "Connect Facebook, Instagram, and Meta Ads",
    summary:
      "Use one Meta authorization, then choose the exact ad accounts, Facebook Pages, and linked Instagram professional accounts GrowthOS may use.",
    customerOwns: "Meta business portfolio, billing, Pages, Instagram accounts, and ad accounts",
    requirements: [
      "A Facebook profile with full control of the business portfolio and Page",
      "An active ad account with billing configured for paid campaigns",
      "A published Facebook Page and linked Instagram professional account for Instagram",
    ],
    permissions: [
      "Discover business assets and eligible ad accounts",
      "Create and manage paid campaigns",
      "Publish Page and Instagram content",
      "Read paid and organic results",
    ],
    destinationLabel: "Ad accounts, Pages, and Instagram profiles",
    verificationChecks: [
      "Required permissions remain granted",
      "The chosen ad account has a Page identity",
      "Currency, timezone, billing, and publishing capabilities are readable",
    ],
    helpUrl:
      "https://help.shopify.com/en/manual/online-sales-channels/social-commerce/facebook-instagram-by-meta/setup",
    helpLabel: "Review Meta account requirements",
  },
  google_ads: {
    provider: "google_ads",
    category: "advertising",
    connectionMethod: "oauth",
    setupTitle: "Connect Google Ads",
    summary:
      "Sign in with Google and choose eligible client ad accounts. GrowthOS never treats a manager account as a campaign destination.",
    customerOwns: "Google Ads account, billing, conversion actions, and landing pages",
    requirements: [
      "A Google user with access to the client ad account",
      "Billing configured in Google Ads",
      "At least one non-manager client account",
    ],
    permissions: [
      "Discover accessible Google Ads customers",
      "Create paused Search and Display resources",
      "Activate only after your final confirmation",
      "Read provider-reported performance",
    ],
    destinationLabel: "Client Google Ads accounts",
    verificationChecks: [
      "OAuth access and the GrowthOS developer token both work",
      "The selected account is not a manager account",
      "Currency, timezone, billing state, and campaign capabilities are readable",
    ],
    helpUrl: "https://developers.google.com/google-ads/api/docs/get-started/onboarding",
    helpLabel: "Review Google Ads prerequisites",
  },
  ga4: {
    provider: "ga4",
    category: "measurement",
    connectionMethod: "oauth",
    setupTitle: "Connect Google Analytics 4",
    summary:
      "Choose the GA4 property that represents this business. GrowthOS keeps GA4 sessions and key events separate from ad-platform attribution.",
    customerOwns: "GA4 account, web property, data stream, and key-event configuration",
    requirements: [
      "A Google user with access to the GA4 property",
      "A functioning GA4 web data stream",
      "Key events configured if conversions should be displayed",
    ],
    permissions: ["Discover GA4 properties", "Read reporting data only"],
    destinationLabel: "GA4 properties",
    verificationChecks: [
      "The property remains accessible",
      "Reporting data can be queried read-only",
    ],
    helpUrl: "https://developers.google.com/analytics/devguides/reporting/data/v1",
    helpLabel: "Review the GA4 Data API",
  },
  tiktok_ads: {
    provider: "tiktok_ads",
    category: "advertising",
    connectionMethod: "oauth",
    setupTitle: "Connect TikTok Ads",
    summary:
      "Authorize a TikTok for Business account, then choose an advertiser and verify the exact objectives, identities, and static-carousel formats available to it.",
    customerOwns: "TikTok Business Center, advertiser account, billing, identity, and approved assets",
    requirements: [
      "A TikTok for Business user with advertiser access",
      "An advertiser account with billing configured",
      "An eligible identity and static-carousel objective",
    ],
    permissions: [
      "Discover advertiser accounts",
      "Create supported campaigns paused",
      "Activate after confirmation and read reporting",
    ],
    destinationLabel: "TikTok advertiser accounts",
    verificationChecks: [
      "Advertiser-specific format and objective eligibility",
      "Identity, billing, currency, timezone, and reporting access",
    ],
    helpUrl: "https://business-api.tiktok.com/portal/docs",
    helpLabel: "Review TikTok Business API setup",
  },
  tiktok_organic: {
    provider: "tiktok_organic",
    category: "organic",
    connectionMethod: "oauth",
    setupTitle: "Connect TikTok publishing",
    summary:
      "Authorize Content Posting, choose the creator account, and use the current privacy and comment options returned by TikTok for every post.",
    customerOwns: "TikTok account, public-post eligibility, audience settings, and content rights",
    requirements: [
      "A TikTok account eligible for Content Posting",
      "Consent to TikTok's current privacy and interaction choices",
      "Photo or photo-carousel creative; V1 does not publish video",
    ],
    permissions: [
      "Read basic creator identity",
      "Publish approved photo posts and carousels",
      "Check final post status and public engagement",
    ],
    destinationLabel: "TikTok creator accounts",
    verificationChecks: [
      "Creator Info remains accessible",
      "The selected privacy option is currently allowed",
      "Public posting is enabled for the GrowthOS app",
    ],
    helpUrl: "https://developers.tiktok.com/doc/content-posting-api-get-started",
    helpLabel: "Review TikTok Content Posting",
  },
  reddit_ads: {
    provider: "reddit_ads",
    category: "advertising",
    connectionMethod: "oauth",
    setupTitle: "Connect Reddit Ads",
    summary:
      "Authorize Reddit Ads, choose the advertiser, then verify its profile, pixel, billing, targeting, and preview support before GrowthOS creates paused resources.",
    customerOwns: "Reddit Business account, advertiser billing, profile, pixel, and landing pages",
    requirements: [
      "A verified Reddit Business administrator account",
      "An eligible Reddit Ads account with billing configured",
      "A Reddit profile and conversion pixel when the objective requires them",
    ],
    permissions: [
      "Discover advertiser accounts",
      "Create campaigns, ad groups, posts, and ads paused",
      "Activate after confirmation and read reporting",
    ],
    destinationLabel: "Reddit advertiser accounts",
    verificationChecks: [
      "Advertiser, profile, pixel, and billing eligibility",
      "Destination and click URLs match",
      "A real Reddit preview can be produced",
    ],
    helpUrl: "https://ads-api.reddit.com/docs/v3/authenticate-your-developer-application",
    helpLabel: "Review Reddit Ads authorization",
  },
  linkedin_pages: {
    provider: "linkedin_pages",
    category: "organic",
    connectionMethod: "oauth",
    setupTitle: "Connect LinkedIn Pages",
    summary:
      "Sign in with LinkedIn and choose only organizations where the user has an approved administrator role.",
    customerOwns: "LinkedIn organization Page, administrator roles, and publishing rights",
    requirements: [
      "A LinkedIn user who administers the organization Page",
      "An active organization Page",
      "Rights to publish the uploaded text, image, or document",
    ],
    permissions: [
      "Discover organizations the user administers",
      "Publish approved organization posts",
      "Read organization and share statistics",
    ],
    destinationLabel: "LinkedIn organization Pages",
    verificationChecks: [
      "Organization administrator role remains approved",
      "Publishing and reporting permissions are available",
      "The configured monthly API version remains supported",
    ],
    helpUrl:
      "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api",
    helpLabel: "Review LinkedIn organization publishing",
  },
  chatgpt_ads: {
    provider: "chatgpt_ads",
    category: "advertising",
    connectionMethod: "api_key",
    setupTitle: "Connect ChatGPT Ads",
    summary:
      "ChatGPT Ads currently uses an account-scoped Advertiser API key rather than customer OAuth. GrowthOS verifies the key against its one advertiser account before storing it encrypted.",
    customerOwns: "Approved ChatGPT advertiser account, billing, API key, and account eligibility",
    requirements: [
      "Advertiser API access enabled for the customer's account",
      "An active, approved advertiser account",
      "An account-scoped key created in OpenAI Ads Manager",
    ],
    permissions: [
      "Manage campaigns, ad groups, files, and ads in the key's account",
      "Read state and insights",
    ],
    destinationLabel: "The advertiser account bound to the API key",
    verificationChecks: [
      "The key resolves to one active approved advertiser account",
      "Currency, timezone, state, and enabled operations are readable",
    ],
    helpUrl: "https://developers.openai.com/ads/api-reference/authentication",
    helpLabel: "Review Advertiser API authentication",
  },
  twilio_messaging: {
    provider: "twilio_messaging",
    category: "messaging",
    connectionMethod: "credentials",
    setupTitle: "Set up Twilio SMS",
    summary:
      "Connect a customer-owned Messaging Service with least-privilege credentials, verify its sender and registration, then test signed delivery and STOP callbacks.",
    customerOwns: "Twilio billing, Messaging Service, sender, consent, and required carrier registrations",
    requirements: [
      "An upgraded Twilio account and active Messaging Service with a sender",
      "A restricted API key for the required Messaging endpoints",
      "A verified A2P 10DLC Brand and Campaign before sending to US recipients over 10DLC",
      "A legal sender identity and explicit consent records in GrowthOS",
    ],
    permissions: [
      "Send messages through the chosen Messaging Service",
      "Read service, delivery, and compliance state",
      "Verify signed delivery and inbound STOP callbacks",
    ],
    destinationLabel: "Twilio Messaging Service",
    verificationChecks: [
      "API key and webhook Auth Token belong to the same account",
      "The Messaging Service is active and has an eligible sender",
      "US A2P registration is verified when US recipients are used",
      "Legal sender identity, consent, quiet hours, and opt-out handling are configured",
    ],
    helpUrl: "https://www.twilio.com/docs/messaging/compliance/a2p-10dlc",
    helpLabel: "Review Twilio messaging compliance",
  },
  sendgrid_email: {
    provider: "sendgrid_email",
    category: "messaging",
    connectionMethod: "api_key",
    setupTitle: "Set up Twilio SendGrid email",
    summary:
      "Connect a domain-authenticated sender with a restricted key. GrowthOS creates a signed Event Webhook and verifies the unsubscribe group before enabling delivery.",
    customerOwns: "SendGrid billing, sending domain, DNS, sender reputation, and lawful consent",
    requirements: [
      "A SendGrid account with API and Event Webhook access",
      "An authenticated sending domain and verified From address",
      "A marketing unsubscribe group",
      "A legal sender name, physical address, and explicit consent records in GrowthOS",
    ],
    permissions: [
      "Send mail from the verified identity",
      "Inspect sender, domain, and unsubscribe-group readiness",
      "Create and verify a signed Event Webhook",
    ],
    destinationLabel: "Verified SendGrid sender identity",
    verificationChecks: [
      "The exact From address remains verified",
      "The sending domain remains authenticated",
      "The unsubscribe group and signed Event Webhook remain active",
      "Legal sender identity and consent controls are configured",
    ],
    helpUrl:
      "https://www.twilio.com/docs/sendgrid/onboarding/email-api/build-and-test-your-application",
    helpLabel: "Review SendGrid sender setup",
  },
};

export const providerOnboardingOrder: ProviderKey[] = [
  "meta_business",
  "google_ads",
  "tiktok_ads",
  "reddit_ads",
  "chatgpt_ads",
  "tiktok_organic",
  "linkedin_pages",
  "ga4",
  "sendgrid_email",
  "twilio_messaging",
];

const stageLabels: Record<SetupStageKey, string> = {
  prepare: "Prepare",
  authorize: "Authorize",
  destinations: "Choose destinations",
  verify: "Verify",
};

function accountBlockers(
  provider: ProviderKey,
  accounts: SetupAccount[],
  smsRequiresUsA2p: boolean,
) {
  const selected = accounts.filter((account) => account.selected);
  const blockers: string[] = [];
  if (!selected.length) return ["Choose at least one real destination."];
  if (
    selected.some(
      (account) =>
        account.accountType === "ad_account" &&
        account.capabilities.manager === true,
    )
  )
    blockers.push("Manager accounts cannot be campaign destinations.");
  if (
    selected.some((account) =>
      ["disabled", "suspended", "closed", "inactive"].includes(
        String(account.billingStatus ?? "").toLowerCase(),
      ),
    )
  )
    blockers.push("A selected account is not active for delivery.");
  if (
    provider === "meta_business" &&
    selected.some(
      (account) =>
        account.accountType === "ad_account" &&
        typeof account.capabilities.pageExternalId !== "string",
    )
  )
    blockers.push("Choose the Facebook Page identity for every selected Meta ad account.");
  if (
    provider === "twilio_messaging" &&
    smsRequiresUsA2p &&
    selected.some(
      (account) => account.capabilities.usa2pCampaignStatus !== "VERIFIED",
    )
  )
    blockers.push(
      "US 10DLC delivery remains blocked until the Messaging Service reports a VERIFIED A2P campaign.",
    );
  if (
    provider === "twilio_messaging" &&
    selected.some(
      (account) => account.capabilities.inboundWebhookConfigured !== true,
    )
  )
    blockers.push(
      "Configure the signed GrowthOS inbound webhook so STOP requests are recorded immediately.",
    );
  if (
    provider === "sendgrid_email" &&
    selected.some(
      (account) =>
        account.capabilities.domainAuthenticated !== true ||
        account.capabilities.signedEventWebhook !== true ||
        !account.capabilities.unsubscribeGroupId,
    )
  )
    blockers.push(
      "The sending domain, unsubscribe group, and signed Event Webhook must all remain active.",
    );
  return blockers;
}

export function deriveProviderSetup(input: {
  provider: ProviderKey;
  platformReady: boolean;
  platformReason?: string | null;
  connection?: SetupConnection | null;
  accounts: SetupAccount[];
  messagingIdentityComplete?: boolean;
  smsRequiresUsA2p?: boolean;
}): DerivedProviderSetup {
  const connected = Boolean(
    input.connection && ["connected", "degraded"].includes(input.connection.status),
  );
  const selected = input.accounts.some((account) => account.selected);
  const blockers = connected
    ? accountBlockers(
        input.provider,
        input.accounts,
        input.smsRequiresUsA2p ?? true,
      )
    : [];
  if (
    connected &&
    ["twilio_messaging", "sendgrid_email"].includes(input.provider) &&
    !input.messagingIdentityComplete
  )
    blockers.push("Add the legal sender name and physical mailing address.");
  if (input.connection?.status === "degraded" || input.connection?.healthError)
    blockers.push("The latest provider health check needs attention.");

  const nextStage: SetupStageKey = !connected
    ? "authorize"
    : !selected
      ? "destinations"
      : blockers.length
        ? "verify"
        : "verify";
  const stages = (["prepare", "authorize", "destinations", "verify"] as const).map(
    (key) => {
      let state: SetupStageState = "upcoming";
      if (!input.platformReady) state = key === "prepare" ? "current" : "blocked";
      else if (key === "prepare") state = "complete";
      else if (key === "authorize")
        state = connected ? "complete" : "current";
      else if (key === "destinations")
        state = selected ? "complete" : connected ? "current" : "upcoming";
      else
        state = selected ? (blockers.length ? "current" : "complete") : "upcoming";
      return { key, label: stageLabels[key], state };
    },
  );

  if (!input.platformReady)
    return {
      status: "unavailable",
      label: "Platform approval pending",
      detail:
        input.platformReason ??
        "GrowthOS has not completed this provider's production readiness checks.",
      nextStage: "prepare",
      stages,
      blockers: [],
    };
  if (!connected)
    return {
      status: input.connection ? "authorization_required" : "not_started",
      label: input.connection ? "Reconnect required" : "Ready to set up",
      detail: "Review the requirements, then authorize the customer's real account.",
      nextStage,
      stages,
      blockers: [],
    };
  if (!selected)
    return {
      status: "destinations_required",
      label: "Choose destinations",
      detail: "Authorization succeeded. Choose the exact account, Page, profile, property, or sender GrowthOS may use.",
      nextStage,
      stages,
      blockers: [],
    };
  if (blockers.length)
    return {
      status: "needs_attention",
      label: "Needs attention",
      detail: blockers[0],
      nextStage,
      stages,
      blockers,
    };
  return {
    status: "ready",
    label: "Ready to use",
    detail: "The destination is selected and the latest setup checks passed.",
    nextStage,
    stages,
    blockers: [],
  };
}
