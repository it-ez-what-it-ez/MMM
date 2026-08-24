import "server-only";

import type {
  ChannelKey,
  MetricSnapshot,
  ProviderCapability,
  ProviderKey,
} from "@/lib/v1/domain";

export type ProviderAccountContext = {
  provider: ProviderKey;
  accessToken: string;
  refreshToken?: string;
  account: {
    id: string;
    externalId: string;
    accountType: string;
    name: string;
    currency?: string;
    timezone?: string;
    capabilities: Record<string, unknown>;
  };
  secrets: Record<string, unknown>;
};

export type ConnectionHealth = {
  healthy: boolean;
  externalUserId?: string;
  expiresAt?: string;
  grantedScopes: string[];
  warning?: string;
};
export interface ConnectionAdapter {
  readonly provider: ProviderKey;
  authorizationUrl(input: {
    state: string;
    callbackUrl: string;
    codeChallenge?: string;
  }): URL;
  exchangeCallback(input: {
    code: string;
    callbackUrl: string;
    codeVerifier?: string;
  }): Promise<Record<string, unknown>>;
  refresh(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  discoverAccounts(
    tokens: Record<string, unknown>,
  ): Promise<Array<Record<string, unknown>>>;
  healthCheck(tokens: Record<string, unknown>): Promise<ConnectionHealth>;
  revoke(tokens: Record<string, unknown>): Promise<void>;
}

export type PaidDeploymentInput = {
  campaignName: string;
  channel: ChannelKey;
  objective: string;
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
  currency: "USD" | "CAD";
  startsAt: string;
  endsAt: string | null;
  targeting: Record<string, unknown>;
  creative: {
    headline: string;
    body: string;
    cta: string;
    destinationUrl: string;
    mediaUrls: string[];
    carousel: Array<{ headline: string; body: string; mediaUrl: string }>;
    searchHeadlines?: string[];
      searchDescriptions?: string[];
      searchKeywords?: string[];
  };
  idempotencyKey: string;
};

export type ProviderValidation = {
  valid: boolean;
  errors: Array<{ code: string; message: string; field?: string }>;
  normalized?: Record<string, unknown>;
};
export type PausedResources = {
  campaignId: string;
  resourceIds: Record<string, string | string[]>;
  status: "paused";
  providerRequestId?: string;
};

export interface PaidAdsAdapter {
  readonly provider: ProviderKey;
  capabilities(context: ProviderAccountContext): Promise<ProviderCapability>;
  validate(
    context: ProviderAccountContext,
    input: PaidDeploymentInput,
  ): Promise<ProviderValidation>;
  createPaused(
    context: ProviderAccountContext,
    input: PaidDeploymentInput,
  ): Promise<PausedResources>;
  activate(
    context: ProviderAccountContext,
    resources: PausedResources,
  ): Promise<void>;
  pause(
    context: ProviderAccountContext,
    resources: PausedResources,
  ): Promise<void>;
  status(
    context: ProviderAccountContext,
    resources: PausedResources,
  ): Promise<Record<string, unknown>>;
  metrics(
    context: ProviderAccountContext,
    resources: PausedResources,
    range: { start: string; end: string },
  ): Promise<MetricSnapshot[]>;
}

export type OrganicPublishInput = {
  channel: ChannelKey;
  text: string;
  title?: string;
  destinationUrl?: string;
  mediaUrls: string[];
  carousel: Array<{ text: string; mediaUrl: string }>;
  privacy?: string;
  commentsEnabled?: boolean;
  idempotencyKey: string;
};

export interface OrganicPublisherAdapter {
  readonly provider: ProviderKey;
  validate(
    context: ProviderAccountContext,
    input: OrganicPublishInput,
  ): Promise<ProviderValidation>;
  publish(
    context: ProviderAccountContext,
    input: OrganicPublishInput,
  ): Promise<{
    externalPostId: string;
    status: string;
    providerRequestId?: string;
  }>;
  status(
    context: ProviderAccountContext,
    externalPostId: string,
  ): Promise<Record<string, unknown>>;
  metrics(
    context: ProviderAccountContext,
    externalPostId: string,
  ): Promise<MetricSnapshot[]>;
}

export interface MeasurementAdapter {
  readonly provider: ProviderKey;
  discover(
    context: ProviderAccountContext,
  ): Promise<Array<Record<string, unknown>>>;
  sync(
    context: ProviderAccountContext,
    range: { start: string; end: string },
  ): Promise<MetricSnapshot[]>;
}
