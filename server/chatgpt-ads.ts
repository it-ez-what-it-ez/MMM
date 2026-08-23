import "server-only";

import { env } from "cloudflare:workers";

const ADS_API_BASE = "https://api.ads.openai.com/v1";

type AdsEnvironment = {
  OPENAI_ADS_API_KEY?: string;
};

export type ChatGPTAdCreativeInput = {
  title: string;
  body: string;
  targetUrl: string;
};

export type ChatGPTAdCreative = {
  type: "chat_card";
  title: string;
  body: string;
  target_url: string;
};

export function buildChatGPTAdCreative(
  input: ChatGPTAdCreativeInput,
): ChatGPTAdCreative {
  const title = input.title.trim().slice(0, 50);
  const body = input.body.trim().slice(0, 100);
  if (title.length < 3) throw new Error("ChatGPT ad titles need at least 3 characters.");
  if (!body) throw new Error("ChatGPT ad body copy is required.");
  new URL(input.targetUrl);
  return {
    type: "chat_card",
    title,
    body,
    target_url: input.targetUrl,
  };
}

export function isChatGPTAdsConfigured() {
  return Boolean((env as unknown as AdsEnvironment).OPENAI_ADS_API_KEY?.trim());
}

async function adsRequest<T>(
  path: string,
  init: RequestInit,
  providedApiKey?: string,
): Promise<T> {
  const apiKey =
    providedApiKey?.trim() ??
    (env as unknown as AdsEnvironment).OPENAI_ADS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "ChatGPT Ads is not connected. Add an Ads API key from OpenAI Ads Manager.",
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${ADS_API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...init.headers,
      },
    });
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      const message =
        typeof payload.message === "string"
          ? payload.message
          : typeof payload.error === "string"
            ? payload.error
            : `ChatGPT Ads API returned ${response.status}.`;
      throw new Error(message);
    }
    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

function resourceId(payload: Record<string, unknown>, label: string) {
  const nested = payload.data as Record<string, unknown> | undefined;
  const named = (payload[label.replace(" ", "_")] ??
    nested?.[label.replace(" ", "_")]) as Record<string, unknown> | undefined;
  const value = payload.id ?? nested?.id ?? named?.id;
  if (typeof value !== "string" || !value) {
    throw new Error(`ChatGPT Ads did not return a ${label} ID.`);
  }
  return value;
}

export async function verifyChatGPTAdsAccount(apiKey?: string) {
  return adsRequest<Record<string, unknown>>(
    "/ad_account",
    { method: "GET" },
    apiKey,
  );
}

export async function createPausedChatGPTAdCampaign(input: {
  campaignName: string;
  budget: number;
  creative: ChatGPTAdCreativeInput;
  image: { bytes: ArrayBuffer; name: string; contentType: string };
  apiKey?: string;
}) {
  const creative = buildChatGPTAdCreative(input.creative);

  const upload = new FormData();
  upload.set(
    "file",
    new File([input.image.bytes], input.image.name, {
      type: input.image.contentType,
    }),
  );
  const uploaded = await adsRequest<Record<string, unknown>>(
    "/upload",
    { method: "POST", body: upload },
    input.apiKey,
  );
  const fileId = resourceId(uploaded, "file");

  const campaignPayload = await adsRequest<Record<string, unknown>>(
    "/campaigns",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.campaignName,
        status: "paused",
        budget: {
          lifetime_spend_limit_micros: Math.round(input.budget * 1_000_000),
        },
      }),
    },
    input.apiKey,
  );
  const campaignId = resourceId(campaignPayload, "campaign");

  const adGroupPayload = await adsRequest<Record<string, unknown>>(
    "/ad_groups",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id: campaignId,
        name: `${input.campaignName} · Product intent`,
        status: "paused",
        context_hints: [
          "People discussing a problem the advertised product can solve",
        ],
        bidding_config: {
          billing_event_type: "impression",
          max_bid_micros: 60_000,
        },
      }),
    },
    input.apiKey,
  );
  const adGroupId = resourceId(adGroupPayload, "ad group");

  const adPayload = await adsRequest<Record<string, unknown>>(
    "/ads",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ad_group_id: adGroupId,
        name: creative.title,
        status: "paused",
        creative: { ...creative, file_id: fileId },
      }),
    },
    input.apiKey,
  );
  const adId = resourceId(adPayload, "ad");
  const nested = adPayload.data as Record<string, unknown> | undefined;

  return {
    campaignId,
    adGroupId,
    adId,
    fileId,
    status: "paused" as const,
    reviewStatus:
      typeof adPayload.review_status === "string"
        ? adPayload.review_status
        : typeof nested?.review_status === "string"
          ? nested.review_status
          : "in_review",
  };
}

export async function activateChatGPTAdCampaign(
  campaignId: string,
  apiKey?: string,
) {
  return adsRequest<Record<string, unknown>>(
    `/campaigns/${encodeURIComponent(campaignId)}/activate`,
    {
      method: "POST",
    },
    apiKey,
  );
}
