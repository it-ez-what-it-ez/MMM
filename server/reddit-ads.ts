import "server-only";

import { env } from "cloudflare:workers";

const REDDIT_ADS_BASE = "https://ads-api.reddit.com/api/v3";
const REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token";

type RedditAdsEnvironment = {
  REDDIT_ADS_CLIENT_ID?: string;
  REDDIT_ADS_CLIENT_SECRET?: string;
  REDDIT_ADS_REFRESH_TOKEN?: string;
  REDDIT_AD_ACCOUNT_ID?: string;
  REDDIT_ADS_PROFILE_ID?: string;
  REDDIT_ADS_FUNDING_INSTRUMENT_ID?: string;
  REDDIT_ADS_USER_AGENT?: string;
};

type RedditConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  adAccountId: string;
  profileId: string;
  fundingInstrumentId: string;
  userAgent: string;
};

function config(): RedditConfig {
  const values = env as unknown as RedditAdsEnvironment;
  const result = {
    clientId: values.REDDIT_ADS_CLIENT_ID?.trim() ?? "",
    clientSecret: values.REDDIT_ADS_CLIENT_SECRET?.trim() ?? "",
    refreshToken: values.REDDIT_ADS_REFRESH_TOKEN?.trim() ?? "",
    adAccountId: values.REDDIT_AD_ACCOUNT_ID?.trim() ?? "",
    profileId: values.REDDIT_ADS_PROFILE_ID?.trim() ?? "",
    fundingInstrumentId:
      values.REDDIT_ADS_FUNDING_INSTRUMENT_ID?.trim() ?? "",
    userAgent: values.REDDIT_ADS_USER_AGENT?.trim() ?? "",
  };
  if (Object.values(result).some((value) => !value)) {
    throw new Error(
      "Reddit Ads is not connected. Add the Reddit OAuth, ad account, profile, funding instrument, and user-agent server settings.",
    );
  }
  return result;
}

export function isRedditAdsConfigured() {
  try {
    config();
    return true;
  } catch {
    return false;
  }
}

async function accessToken(settings: RedditConfig) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: settings.refreshToken,
  });
  const response = await fetch(REDDIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${settings.clientId}:${settings.clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": settings.userAgent,
    },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok || typeof payload.access_token !== "string") {
    const message =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.error === "string"
          ? payload.error
          : "Reddit OAuth could not refresh the access token.";
    throw new Error(message);
  }
  return payload.access_token;
}

async function redditRequest(
  token: string,
  settings: RedditConfig,
  path: string,
  init: RequestInit,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${REDDIT_ADS_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": settings.userAgent,
        ...init.headers,
      },
    });
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      const error = payload.error as Record<string, unknown> | undefined;
      const message =
        typeof error?.message === "string"
          ? error.message
          : typeof payload.message === "string"
            ? payload.message
            : `Reddit Ads API returned ${response.status}.`;
      throw new Error(message);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function data(payload: Record<string, unknown>) {
  return (payload.data as Record<string, unknown> | undefined) ?? payload;
}

function idFrom(payload: Record<string, unknown>, label: string) {
  const value = data(payload).id;
  if (typeof value !== "string" || !value)
    throw new Error(`Reddit Ads did not return a ${label} ID.`);
  return value;
}

const jsonRequest = (value: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ data: value }),
});

const asRedditTime = (date: string, end = false) =>
  new Date(`${date}T${end ? "23:59:59" : "00:00:00"}.000Z`).toISOString();

export async function verifyRedditAdsAccount() {
  const settings = config();
  const token = await accessToken(settings);
  return redditRequest(
    token,
    settings,
    `/ad_accounts/${encodeURIComponent(settings.adAccountId)}`,
    { method: "GET" },
  );
}

export type RedditAdProgress = {
  campaignId?: string;
  adGroupId?: string;
  jobId?: string;
  postId?: string;
  adId?: string;
};

export async function createPausedRedditAdCampaign(input: {
  campaignName: string;
  budget: number;
  startDate: string;
  endDate: string;
  creative: { headline: string; body: string; targetUrl: string };
  resume?: RedditAdProgress;
  onProgress?: (progress: RedditAdProgress) => Promise<void>;
}) {
  const settings = config();
  const token = await accessToken(settings);
  const headline = input.creative.headline.trim().slice(0, 300);
  const body = input.creative.body.trim().slice(0, 40_000);
  if (headline.length < 3 || !body)
    throw new Error("Reddit ad headline and body copy are required.");
  new URL(input.creative.targetUrl);
  const startTime = asRedditTime(input.startDate);
  const endTime = asRedditTime(input.endDate, true);
  const progress: RedditAdProgress = { ...input.resume };
  const recordProgress = async () => input.onProgress?.({ ...progress });

  if (!progress.campaignId) {
    const campaignPayload = await redditRequest(
      token,
      settings,
      `/ad_accounts/${encodeURIComponent(settings.adAccountId)}/campaigns`,
      jsonRequest({
        name: input.campaignName,
        configured_status: "PAUSED",
        objective: "CLICKS",
        start_time: startTime,
        end_time: endTime,
        bid_strategy: "BIDLESS",
        bid_type: "CPC",
        goal_type: "LIFETIME_SPEND",
        goal_value: Math.round(input.budget * 1_000_000),
        is_campaign_budget_optimization: true,
        funding_instrument_id: settings.fundingInstrumentId,
      }),
    );
    progress.campaignId = idFrom(campaignPayload, "campaign");
    await recordProgress();
  }
  const campaignId = progress.campaignId;

  if (!progress.adGroupId) {
    const adGroupPayload = await redditRequest(
      token,
      settings,
      `/ad_accounts/${encodeURIComponent(settings.adAccountId)}/ad_groups`,
      jsonRequest({
        campaign_id: campaignId,
        configured_status: "PAUSED",
        name: `${input.campaignName} · Product conversation`,
        bid_type: "CPC",
        start_time: startTime,
        end_time: endTime,
        bid_strategy: null,
        bid_value: null,
      }),
    );
    progress.adGroupId = idFrom(adGroupPayload, "ad group");
    await recordProgress();
  }
  const adGroupId = progress.adGroupId;

  if (!progress.postId) {
    if (!progress.jobId) {
      const jobPayload = await redditRequest(
        token,
        settings,
        `/profiles/${encodeURIComponent(settings.profileId)}/structured_posts/jobs`,
        jsonRequest({
          allow_comments: true,
          creative: {
            type: "TEXT",
            headline,
            body,
            text_format: "PLAIN_TEXT",
          },
        }),
      );
      const jobData = data(jobPayload);
      const returnedJobId =
        jobData.id ?? jobData.post_creation_job_id ?? jobData.job_id;
      if (typeof returnedJobId !== "string" || !returnedJobId)
        throw new Error("Reddit Ads did not return a structured post job ID.");
      progress.jobId = returnedJobId;
      await recordProgress();
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 1_500));
      const job = data(
        await redditRequest(
          token,
          settings,
          `/structured_posts/jobs/${encodeURIComponent(progress.jobId)}`,
          { method: "GET" },
        ),
      );
      const status = String(job.status ?? "").toUpperCase();
      const result = job.result as Record<string, unknown> | undefined;
      const post = job.post as Record<string, unknown> | undefined;
      const candidate =
        job.post_id ??
        job.structured_post_id ??
        result?.post_id ??
        result?.structured_post_id ??
        post?.id;
      if (status === "SUCCESS" && typeof candidate === "string") {
        progress.postId = candidate;
        await recordProgress();
        break;
      }
      if (status === "CLIENT_ERROR" || status === "SERVER_ERROR") {
        progress.jobId = undefined;
        await recordProgress();
        throw new Error(
          typeof job.message === "string"
            ? job.message
            : `Reddit structured post creation ended with ${status}.`,
        );
      }
    }
  }
  if (!progress.postId)
    throw new Error(
      "Reddit is still processing the sponsored post. Try again in a moment.",
    );
  const postId = progress.postId;

  let ad: Record<string, unknown> = {};
  if (!progress.adId) {
    const adPayload = await redditRequest(
      token,
      settings,
      `/ad_accounts/${encodeURIComponent(settings.adAccountId)}/ads`,
      jsonRequest({
        ad_group_id: adGroupId,
        name: headline,
        post_id: postId,
        click_url: input.creative.targetUrl,
        configured_status: "PAUSED",
      }),
    );
    ad = data(adPayload);
    progress.adId = idFrom(adPayload, "ad");
    await recordProgress();
  }
  const adId = progress.adId;

  return {
    campaignId,
    adGroupId,
    postId,
    adId,
    status: "paused" as const,
    reviewStatus:
      typeof ad.effective_status === "string"
        ? ad.effective_status
        : "PENDING_REVIEW",
    previewUrl:
      typeof ad.preview_url === "string" ? ad.preview_url : undefined,
  };
}
