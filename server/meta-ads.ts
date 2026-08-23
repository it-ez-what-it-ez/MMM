import "server-only";

import { providerEnvironment } from "@/server/provider-credentials";

export type MetaAdsAuth = {
  accessToken: string;
  adAccountId: string;
  pageId: string;
};

async function appSecretProof(token: string) {
  const secret = providerEnvironment().META_ADS_APP_SECRET ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)),
  );
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function metaRequest(
  auth: MetaAdsAuth,
  path: string,
  values: Record<string, string>,
  method: "GET" | "POST" = "POST",
) {
  const version = providerEnvironment().META_GRAPH_API_VERSION?.trim() || "v24.0";
  const body = new URLSearchParams({
    ...values,
    access_token: auth.accessToken,
    appsecret_proof: await appSecretProof(auth.accessToken),
  });
  const response = await fetch(
    `https://graph.facebook.com/${version}${path}${method === "GET" ? `?${body}` : ""}`,
    method === "GET"
      ? { method }
      : {
          method,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        },
  );
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const error = payload.error as Record<string, unknown> | undefined;
    throw new Error(
      typeof error?.message === "string"
        ? error.message
        : `Meta Marketing API returned ${response.status}.`,
    );
  }
  return payload;
}

function id(payload: Record<string, unknown>, label: string) {
  if (typeof payload.id !== "string")
    throw new Error(`Meta did not return a ${label} ID.`);
  return payload.id;
}

export async function verifyMetaAdsAccount(auth: MetaAdsAuth) {
  return metaRequest(
    auth,
    `/act_${auth.adAccountId}`,
    { fields: "id,name,account_id,currency,timezone_name,account_status" },
    "GET",
  );
}

export async function createPausedMetaAdsCampaign(input: {
  auth: MetaAdsAuth;
  campaignName: string;
  budget: number;
  startDate: string;
  endDate: string;
  creative: { headline: string; body: string; targetUrl: string };
}) {
  const { auth } = input;
  new URL(input.creative.targetUrl);
  const accountPath = `/act_${auth.adAccountId}`;
  const campaignId = id(
    await metaRequest(auth, `${accountPath}/campaigns`, {
      name: input.campaignName.slice(0, 400),
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: "[]",
    }),
    "campaign",
  );
  const adSetId = id(
    await metaRequest(auth, `${accountPath}/adsets`, {
      name: `${input.campaignName} · Website visits`.slice(0, 400),
      campaign_id: campaignId,
      lifetime_budget: String(Math.max(100, Math.round(input.budget * 100))),
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: JSON.stringify({ geo_locations: { countries: ["CA", "US"] } }),
      start_time: new Date(`${input.startDate}T12:00:00Z`).toISOString(),
      end_time: new Date(`${input.endDate}T12:00:00Z`).toISOString(),
      status: "PAUSED",
    }),
    "ad set",
  );
  const creativeId = id(
    await metaRequest(auth, `${accountPath}/adcreatives`, {
      name: `${input.campaignName} · Creative`.slice(0, 400),
      object_story_spec: JSON.stringify({
        page_id: auth.pageId,
        link_data: {
          link: input.creative.targetUrl,
          name: input.creative.headline.slice(0, 255),
          message: input.creative.body.slice(0, 5000),
          call_to_action: {
            type: "LEARN_MORE",
            value: { link: input.creative.targetUrl },
          },
        },
      }),
    }),
    "creative",
  );
  const adId = id(
    await metaRequest(auth, `${accountPath}/ads`, {
      name: `${input.campaignName} · Ad`.slice(0, 400),
      adset_id: adSetId,
      creative: JSON.stringify({ creative_id: creativeId }),
      status: "PAUSED",
    }),
    "ad",
  );
  return {
    campaignId,
    adSetId,
    creativeId,
    adId,
    status: "PAUSED" as const,
  };
}

export async function activateMetaAdsCampaign(
  auth: MetaAdsAuth,
  campaignId: string,
) {
  return metaRequest(auth, `/${campaignId}`, { status: "ACTIVE" });
}
