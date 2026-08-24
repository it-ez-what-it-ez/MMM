import "server-only";

import {
  providerCapabilities,
  type MetricSnapshot,
  type ProviderKey,
} from "@/lib/v1/domain";
import type {
  PaidAdsAdapter,
  PaidDeploymentInput,
  PausedResources,
  ProviderAccountContext,
  ProviderValidation,
} from "./contracts";

type Json = Record<string, unknown>;

async function requestJson(url: string, init: RequestInit, provider: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = (await response.json().catch(() => ({}))) as Json;
    if (!response.ok) {
      const nested = payload.error as Json | string | undefined;
      const message =
        typeof nested === "string"
          ? nested
          : typeof nested?.message === "string"
            ? nested.message
            : typeof payload.message === "string"
              ? payload.message
              : `${provider} returned ${response.status}.`;
      const error = new Error(message) as Error & { requestId?: string };
      error.requestId =
        response.headers.get("x-request-id") ??
        response.headers.get("x-fb-trace-id") ??
        undefined;
      throw error;
    }
    return {
      payload,
      requestId:
        response.headers.get("x-request-id") ??
        response.headers.get("x-fb-trace-id") ??
        undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function baseValidation(
  context: ProviderAccountContext,
  input: PaidDeploymentInput,
): ProviderValidation {
  const errors: ProviderValidation["errors"] = [];
  try {
    new URL(input.creative.destinationUrl);
  } catch {
    errors.push({
      code: "invalid_url",
      field: "destinationUrl",
      message: "Destination URL must be a valid public HTTPS URL.",
    });
  }
  if (!input.creative.headline.trim())
    errors.push({
      code: "headline_required",
      field: "headline",
      message: "A headline is required.",
    });
  if (!input.creative.body.trim())
    errors.push({
      code: "body_required",
      field: "body",
      message: "Body copy is required.",
    });
  if (!input.dailyBudgetCents && !input.lifetimeBudgetCents)
    errors.push({
      code: "budget_required",
      field: "budget",
      message: "A paid budget is required.",
    });
  const countries = Array.isArray(input.targeting.countries)
    ? input.targeting.countries.filter(
        (country): country is string => typeof country === "string",
      )
    : [];
  if (!countries.length)
    errors.push({
      code: "targeting_required",
      field: "targeting",
      message: "Choose at least one target country.",
    });
  if (countries.some((country) => !["US", "CA"].includes(country)))
    errors.push({
      code: "unsupported_country",
      field: "targeting",
      message: "GrowthOS V1 supports United States and Canada targeting only.",
    });
  if (context.account.currency && context.account.currency !== input.currency)
    errors.push({
      code: "currency_mismatch",
      field: "currency",
      message: `The account bills in ${context.account.currency}, not ${input.currency}.`,
    });
  if (new Date(input.startsAt).getTime() < Date.now() - 300_000)
    errors.push({
      code: "start_in_past",
      field: "startsAt",
      message: "The campaign start cannot be in the past.",
    });
  return { valid: errors.length === 0, errors };
}

async function assetBytes(url: string) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Creative image could not be read (${response.status}).`);
  if (!response.headers.get("content-type")?.startsWith("image/"))
    throw new Error("Creative media is not an image.");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > 20 * 1024 * 1024)
    throw new Error("Creative image exceeds 20 MB.");
  return { bytes: buffer, contentType: response.headers.get("content-type")! };
}

function arrayBufferBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}

function statusMetrics(
  provider: ProviderKey,
  payload: Json,
  range: { start: string; end: string },
): MetricSnapshot[] {
  return [
    {
      provider,
      sourceModel: `${provider}:provider_reported`,
      periodStart: range.start,
      periodEnd: range.end,
      currency: null,
      metrics: Object.fromEntries(
        Object.entries(payload).filter(
          ([, value]) => typeof value === "number",
        ),
      ) as Record<string, number>,
    },
  ];
}

export class MetaPaidAdsAdapter implements PaidAdsAdapter {
  readonly provider = "meta_business" as const;
  async capabilities() {
    return providerCapabilities.meta_business;
  }
  async validate(context: ProviderAccountContext, input: PaidDeploymentInput) {
    const result = baseValidation(context, input);
    if (!input.creative.mediaUrls.length)
      result.errors.push({
        code: "image_required",
        field: "media",
        message: "Meta image and carousel ads require real media.",
      });
    if (!context.secrets.pageId || !context.secrets.pageAccessToken)
      result.errors.push({
        code: "meta_page_required",
        field: "account",
        message:
          "Assign the exact Facebook Page identity to this Meta ad account before preflight.",
      });
    result.valid = result.errors.length === 0;
    if (result.valid)
      await this.call(
        context,
        `/act_${context.account.externalId}`,
        { fields: "id,name,currency,account_status" },
        "GET",
      );
    return result;
  }
  private async proof(token: string) {
    const secret = process.env.META_CLIENT_SECRET!;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    return [
      ...new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)),
      ),
    ]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }
  private async call(
    context: ProviderAccountContext,
    path: string,
    values: Record<string, string>,
    method: "GET" | "POST" = "POST",
  ) {
    const params = new URLSearchParams({
      ...values,
      access_token: context.accessToken,
      appsecret_proof: await this.proof(context.accessToken),
    });
    const url = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v24.0"}${path}${method === "GET" ? `?${params}` : ""}`;
    return requestJson(
      url,
      method === "GET"
        ? { method }
        : {
            method,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params,
          },
      "Meta",
    );
  }
  async createPaused(
    context: ProviderAccountContext,
    input: PaidDeploymentInput,
  ): Promise<PausedResources> {
    const account = `/act_${context.account.externalId}`;
    const campaign = await this.call(context, `${account}/campaigns`, {
      name: input.campaignName.slice(0, 400),
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: "[]",
    });
    const campaignId = String(campaign.payload.id);
    if (!campaignId) throw new Error("Meta did not return a campaign ID.");
    const budget =
      input.lifetimeBudgetCents ??
      input.dailyBudgetCents! *
        Math.max(
          1,
          Math.ceil(
            ((input.endsAt
              ? new Date(input.endsAt).getTime()
              : Date.now() + 7 * 86400000) -
              new Date(input.startsAt).getTime()) /
              86400000,
          ),
        );
    const adSet = await this.call(context, `${account}/adsets`, {
      name: `${input.campaignName} · Delivery`,
      campaign_id: campaignId,
      lifetime_budget: String(budget),
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: JSON.stringify({
        geo_locations: { countries: input.targeting.countries },
      }),
      start_time: input.startsAt,
      end_time:
        input.endsAt ??
        new Date(
          new Date(input.startsAt).getTime() + 7 * 86400000,
        ).toISOString(),
      status: "PAUSED",
    });
    const adSetId = String(adSet.payload.id);
    const pageId = String(context.secrets.pageId ?? "");
    if (!pageId)
      throw new Error(
        "Choose a Meta ad account linked to an authorized Facebook Page.",
      );
    const imageHashes: string[] = [];
    for (const [index, url] of input.creative.mediaUrls.entries()) {
      const image = await assetBytes(url);
      const form = new FormData();
      form.set(
        "bytes",
        new Blob([image.bytes], { type: image.contentType }),
        `creative-${index + 1}.jpg`,
      );
      form.set("access_token", context.accessToken);
      form.set("appsecret_proof", await this.proof(context.accessToken));
      const uploaded = await requestJson(
        `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v24.0"}${account}/adimages`,
        { method: "POST", body: form },
        "Meta",
      );
      const images = uploaded.payload.images as Record<string, Json> | undefined;
      const hash = images ? String(Object.values(images)[0]?.hash ?? "") : "";
      if (!hash) throw new Error(`Meta did not return an image hash for frame ${index + 1}.`);
      imageHashes.push(hash);
    }
    const isCarousel = input.creative.carousel.length > 1;
    const linkData: Json = isCarousel
      ? {
          link: input.creative.destinationUrl,
          message: input.creative.body.slice(0, 5000),
          child_attachments: input.creative.carousel.map((slide, index) => ({
            link: input.creative.destinationUrl,
            image_hash: imageHashes[index],
            name: slide.headline.slice(0, 255),
            description: slide.body.slice(0, 255),
            call_to_action: {
              type: "LEARN_MORE",
              value: { link: input.creative.destinationUrl },
            },
          })),
          multi_share_end_card: false,
          multi_share_optimized: false,
        }
      : {
          link: input.creative.destinationUrl,
          image_hash: imageHashes[0],
          name: input.creative.headline.slice(0, 255),
          message: input.creative.body.slice(0, 5000),
          call_to_action: {
            type: "LEARN_MORE",
            value: { link: input.creative.destinationUrl },
          },
        };
    const creative = await this.call(context, `${account}/adcreatives`, {
      name: `${input.campaignName} · Creative`,
      object_story_spec: JSON.stringify({
        page_id: pageId,
        link_data: linkData,
      }),
    });
    const creativeId = String(creative.payload.id);
    const ad = await this.call(context, `${account}/ads`, {
      name: `${input.campaignName} · Ad`,
      adset_id: adSetId,
      creative: JSON.stringify({ creative_id: creativeId }),
      status: "PAUSED",
    });
    return {
      campaignId,
      resourceIds: {
        adSetId,
        creativeId,
        adId: String(ad.payload.id),
        imageHashes,
      },
      status: "paused",
      providerRequestId: ad.requestId,
    };
  }
  async activate(context: ProviderAccountContext, resources: PausedResources) {
    await this.call(context, `/${resources.campaignId}`, { status: "ACTIVE" });
  }
  async pause(context: ProviderAccountContext, resources: PausedResources) {
    await this.call(context, `/${resources.campaignId}`, { status: "PAUSED" });
  }
  async status(context: ProviderAccountContext, resources: PausedResources) {
    return (
      await this.call(
        context,
        `/${resources.campaignId}`,
        { fields: "id,status,effective_status,configured_status" },
        "GET",
      )
    ).payload;
  }
  async metrics(
    context: ProviderAccountContext,
    resources: PausedResources,
    range: { start: string; end: string },
  ) {
    const report = await this.call(
      context,
      `/${resources.campaignId}/insights`,
      {
        fields: "impressions,clicks,spend,actions,action_values",
        time_range: JSON.stringify({
          since: range.start.slice(0, 10),
          until: range.end.slice(0, 10),
        }),
      },
      "GET",
    );
    const row = ((report.payload.data as Json[] | undefined) ?? [])[0] ?? {};
    return statusMetrics(
      "meta_business",
      {
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
        spend: Number(row.spend ?? 0),
      },
      range,
    );
  }
}

export class GooglePaidAdsAdapter implements PaidAdsAdapter {
  readonly provider = "google_ads" as const;
  async capabilities() {
    return providerCapabilities.google_ads;
  }
  private async call(
    context: ProviderAccountContext,
    resource: string,
    body: Json,
  ) {
    return requestJson(
      `https://googleads.googleapis.com/v25/customers/${context.account.externalId}/${resource}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${context.accessToken}`,
          "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
          ...(process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID
            ? {
                "login-customer-id":
                  process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID.replace(/\D/g, ""),
              }
            : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      "Google Ads",
    );
  }
  async validate(context: ProviderAccountContext, input: PaidDeploymentInput) {
    const result = baseValidation(context, input);
    if (input.channel === "google_display" && !input.creative.mediaUrls.length)
      result.errors.push({
        code: "image_required",
        field: "media",
        message: "Responsive Display requires a real image.",
      });
    if (input.channel === "google_display" && input.creative.mediaUrls.length < 2)
      result.errors.push({
        code: "display_ratios_required",
        field: "media",
        message: "Responsive Display requires separate landscape and square final assets.",
      });
    if (input.channel === "google_search") {
      if ((input.creative.searchHeadlines?.length ?? 0) < 3)
        result.errors.push({
          code: "search_headlines_required",
          field: "searchHeadlines",
          message: "Responsive Search requires at least three reviewed headlines.",
        });
      if ((input.creative.searchDescriptions?.length ?? 0) < 2)
        result.errors.push({
          code: "search_descriptions_required",
          field: "searchDescriptions",
          message: "Responsive Search requires at least two reviewed descriptions.",
        });
      if ((input.creative.searchKeywords?.length ?? 0) < 1)
        result.errors.push({
          code: "search_keywords_required",
          field: "searchKeywords",
          message: "Google Search requires at least one reviewed keyword.",
        });
    }
    result.valid = result.errors.length === 0;
    if (result.valid)
      await this.call(context, "googleAds:search", {
        query:
          "SELECT customer.id, customer.currency_code, customer.time_zone FROM customer LIMIT 1",
      });
    return result;
  }
  private resource(payload: Json) {
    const value = (payload.results as Json[] | undefined)?.[0]?.resourceName;
    if (typeof value !== "string")
      throw new Error("Google Ads did not return a resource name.");
    return value;
  }
  async createPaused(
    context: ProviderAccountContext,
    input: PaidDeploymentInput,
  ): Promise<PausedResources> {
    const daily =
      input.dailyBudgetCents ??
      Math.max(1, Math.round((input.lifetimeBudgetCents ?? 10000) / 30));
    const budget = this.resource(
      (
        await this.call(context, "campaignBudgets:mutate", {
          operations: [
            {
              create: {
                name: `${input.campaignName} · Budget`,
                amountMicros: String(daily * 10000),
                deliveryMethod: "STANDARD",
                explicitlyShared: false,
              },
            },
          ],
        })
      ).payload,
    );
    const channelType =
      input.channel === "google_display" ? "DISPLAY" : "SEARCH";
    const campaign = this.resource(
      (
        await this.call(context, "campaigns:mutate", {
          operations: [
            {
              create: {
                name: input.campaignName.slice(0, 220),
                status: "PAUSED",
                advertisingChannelType: channelType,
                campaignBudget: budget,
                manualCpc: {},
                startDate: input.startsAt.slice(0, 10).replaceAll("-", ""),
                ...(input.endsAt
                  ? { endDate: input.endsAt.slice(0, 10).replaceAll("-", "") }
                  : {}),
              },
            },
          ],
        })
      ).payload,
    );
    const countryGeoTargetIds: Record<string, string> = {
      US: "2840",
      CA: "2124",
    };
    await this.call(context, "campaignCriteria:mutate", {
      operations: (input.targeting.countries as string[]).map((country) => ({
        create: {
          campaign,
          location: {
            geoTargetConstant: `geoTargetConstants/${countryGeoTargetIds[country]}`,
          },
        },
      })),
    });
    const group = this.resource(
      (
        await this.call(context, "adGroups:mutate", {
          operations: [
            {
              create: {
                name: `${input.campaignName} · ${channelType}`,
                campaign,
                status: "PAUSED",
                type:
                  channelType === "SEARCH"
                    ? "SEARCH_STANDARD"
                    : "DISPLAY_STANDARD",
                cpcBidMicros: "1000000",
              },
            },
          ],
        })
      ).payload,
    );
    if (channelType === "SEARCH")
      await this.call(context, "adGroupCriteria:mutate", {
        operations: input.creative.searchKeywords!.map((text) => ({
          create: {
            adGroup: group,
            status: "ENABLED",
            keyword: { text, matchType: "PHRASE" },
          },
        })),
      });
    let ad: string;
    const headline = input.creative.headline.slice(0, 30);
    const description = input.creative.body.slice(0, 90);
    if (channelType === "SEARCH") {
      ad = this.resource(
        (
          await this.call(context, "adGroupAds:mutate", {
            operations: [
              {
                create: {
                  adGroup: group,
                  status: "PAUSED",
                  ad: {
                    finalUrls: [input.creative.destinationUrl],
                    responsiveSearchAd: {
                      headlines: input.creative.searchHeadlines!.map((text) => ({ text })),
                      descriptions: input.creative.searchDescriptions!.map((text) => ({ text })),
                    },
                  },
                },
              },
            ],
          })
        ).payload,
      );
    } else {
      const [landscapeImage, squareImage] = await Promise.all([
        assetBytes(input.creative.mediaUrls[0]),
        assetBytes(input.creative.mediaUrls[1]),
      ]);
      const landscapeAsset = this.resource(
        (
          await this.call(context, "assets:mutate", {
            operations: [
              {
                create: {
                  name: `${input.campaignName} image`,
                  type: "IMAGE",
                  imageAsset: { data: arrayBufferBase64(landscapeImage.bytes) },
                },
              },
            ],
          })
        ).payload,
      );
      const squareAsset = this.resource(
        (
          await this.call(context, "assets:mutate", {
            operations: [
              {
                create: {
                  name: `${input.campaignName} square image`,
                  type: "IMAGE",
                  imageAsset: { data: arrayBufferBase64(squareImage.bytes) },
                },
              },
            ],
          })
        ).payload,
      );
      ad = this.resource(
        (
          await this.call(context, "adGroupAds:mutate", {
            operations: [
              {
                create: {
                  adGroup: group,
                  status: "PAUSED",
                  ad: {
                    finalUrls: [input.creative.destinationUrl],
                    responsiveDisplayAd: {
                      marketingImages: [{ asset: landscapeAsset }],
                      squareMarketingImages: [{ asset: squareAsset }],
                      headlines: [{ text: headline }],
                      longHeadline: {
                        text: input.creative.headline.slice(0, 90),
                      },
                      descriptions: [{ text: description }],
                      businessName: input.campaignName.slice(0, 25),
                    },
                  },
                },
              },
            ],
          })
        ).payload,
      );
    }
    return {
      campaignId: campaign.split("/").pop()!,
      resourceIds: { budget, campaign, adGroup: group, ad },
      status: "paused",
    };
  }
  async activate(context: ProviderAccountContext, resources: PausedResources) {
    await this.setStatus(context, resources, "ENABLED");
  }
  async pause(context: ProviderAccountContext, resources: PausedResources) {
    await this.setStatus(context, resources, "PAUSED");
  }
  private async setStatus(
    context: ProviderAccountContext,
    resources: PausedResources,
    status: string,
  ) {
    await this.call(context, "campaigns:mutate", {
      operations: [
        {
          update: {
            resourceName: `customers/${context.account.externalId}/campaigns/${resources.campaignId}`,
            status,
          },
          updateMask: "status",
        },
      ],
    });
  }
  async status(context: ProviderAccountContext, resources: PausedResources) {
    return (
      await this.call(context, "googleAds:search", {
        query: `SELECT campaign.id, campaign.status, campaign.serving_status FROM campaign WHERE campaign.id = ${resources.campaignId}`,
      })
    ).payload;
  }
  async metrics(
    context: ProviderAccountContext,
    resources: PausedResources,
    range: { start: string; end: string },
  ) {
    const report = (
      await this.call(context, "googleAds:search", {
        query: `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.id = ${resources.campaignId} AND segments.date BETWEEN '${range.start.slice(0, 10)}' AND '${range.end.slice(0, 10)}'`,
      })
    ).payload;
    const row = (report.results as Json[] | undefined)?.[0] ?? {};
    return statusMetrics("google_ads", row, range);
  }
}

class JsonPaidAdapter implements PaidAdsAdapter {
  constructor(readonly provider: "reddit_ads" | "tiktok_ads" | "chatgpt_ads") {}
  async capabilities() {
    return providerCapabilities[this.provider];
  }
  async validate(context: ProviderAccountContext, input: PaidDeploymentInput) {
    const result = baseValidation(context, input);
    if (!input.creative.mediaUrls.length)
      result.errors.push({
        code: "image_required",
        field: "media",
        message: `${providerCapabilities[this.provider].label} requires real creative media.`,
      });
    result.valid = result.errors.length === 0;
    return result;
  }
  private async call(
    context: ProviderAccountContext,
    path: string,
    init: RequestInit,
  ) {
    const base =
      this.provider === "reddit_ads"
        ? "https://ads-api.reddit.com/api/v3"
        : this.provider === "tiktok_ads"
          ? "https://business-api.tiktok.com/open_api/v1.3"
          : "https://api.ads.openai.com/v1";
    return requestJson(
      `${base}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${context.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(this.provider === "reddit_ads"
            ? { "User-Agent": "GrowthOS/1.0" }
            : {}),
          ...init.headers,
        },
      },
      providerCapabilities[this.provider].label,
    );
  }
  async createPaused(
    context: ProviderAccountContext,
    input: PaidDeploymentInput,
  ): Promise<PausedResources> {
    if (this.provider === "chatgpt_ads") {
      const upload = await this.call(context, "/upload", {
        method: "POST",
        body: JSON.stringify({ image_url: input.creative.mediaUrls[0] }),
      });
      const fileId = String(upload.payload.file_id);
      const campaign = await this.call(context, "/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: input.campaignName,
          status: "paused",
          budget: {
            lifetime_spend_limit_micros:
              (input.lifetimeBudgetCents ?? input.dailyBudgetCents! * 7) *
              10000,
          },
        }),
      });
      const campaignId = String(
        campaign.payload.id ?? campaign.payload.campaign_id,
      );
      const group = await this.call(context, "/ad_groups", {
        method: "POST",
        body: JSON.stringify({
          campaign_id: campaignId,
          name: `${input.campaignName} · Intent`,
          status: "paused",
          context_hints: [input.objective],
          bidding_config: {
            billing_event_type: "impression",
            max_bid_micros: 60000,
          },
        }),
      });
      const groupId = String(group.payload.id ?? group.payload.ad_group_id);
      const ad = await this.call(context, "/ads", {
        method: "POST",
        body: JSON.stringify({
          ad_group_id: groupId,
          name: input.creative.headline.slice(0, 50),
          status: "paused",
          creative: {
            type: "chat_card",
            title: input.creative.headline.slice(0, 50),
            body: input.creative.body.slice(0, 100),
            target_url: input.creative.destinationUrl,
            file_id: fileId,
          },
        }),
      });
      return {
        campaignId,
        resourceIds: {
          fileId,
          adGroupId: groupId,
          adId: String(ad.payload.id ?? ad.payload.ad_id),
        },
        status: "paused",
        providerRequestId: ad.requestId,
      };
    }
    if (this.provider === "tiktok_ads") {
      const advertiser_id = context.account.externalId;
      const campaign = await this.call(context, "/campaign/create/", {
        method: "POST",
        body: JSON.stringify({
          advertiser_id,
          campaign_name: input.campaignName,
          objective_type: "TRAFFIC",
          budget_mode: "BUDGET_MODE_DAY",
          budget: (input.dailyBudgetCents ?? 1000) / 100,
          operation_status: "DISABLE",
        }),
      });
      const data =
        (campaign.payload.data as Json | undefined) ?? campaign.payload;
      const campaignId = String(data.campaign_id);
      if (!campaignId) throw new Error("TikTok did not return a campaign ID.");
      return {
        campaignId,
        resourceIds: { campaignId },
        status: "paused",
        providerRequestId: campaign.requestId,
      };
    }
    const account = context.account.externalId;
    const campaign = await this.call(
      context,
      `/ad_accounts/${account}/campaigns`,
      {
        method: "POST",
        body: JSON.stringify({
          data: {
            name: input.campaignName,
            configured_status: "PAUSED",
            objective: "CLICKS",
            start_time: input.startsAt,
            end_time: input.endsAt,
            goal_type: "LIFETIME_SPEND",
            goal_value:
              (input.lifetimeBudgetCents ?? input.dailyBudgetCents! * 7) *
              10000,
            is_campaign_budget_optimization: true,
          },
        }),
      },
    );
    const data =
      (campaign.payload.data as Json | undefined) ?? campaign.payload;
    const campaignId = String(data.id);
    if (!campaignId) throw new Error("Reddit did not return a campaign ID.");
    return {
      campaignId,
      resourceIds: { campaignId },
      status: "paused",
      providerRequestId: campaign.requestId,
    };
  }
  async activate(context: ProviderAccountContext, resources: PausedResources) {
    await this.state(context, resources, true);
  }
  async pause(context: ProviderAccountContext, resources: PausedResources) {
    await this.state(context, resources, false);
  }
  private async state(
    context: ProviderAccountContext,
    resources: PausedResources,
    active: boolean,
  ) {
    if (this.provider === "chatgpt_ads")
      await this.call(
        context,
        `/campaigns/${resources.campaignId}/${active ? "activate" : "pause"}`,
        { method: "POST" },
      );
    else if (this.provider === "tiktok_ads")
      await this.call(context, "/campaign/status/update/", {
        method: "POST",
        body: JSON.stringify({
          advertiser_id: context.account.externalId,
          campaign_ids: [resources.campaignId],
          operation_status: active ? "ENABLE" : "DISABLE",
        }),
      });
    else
      await this.call(context, `/campaigns/${resources.campaignId}`, {
        method: "PATCH",
        body: JSON.stringify({
          data: { configured_status: active ? "ACTIVE" : "PAUSED" },
        }),
      });
  }
  async status(context: ProviderAccountContext, resources: PausedResources) {
    return (
      await this.call(context, `/campaigns/${resources.campaignId}`, {
        method: "GET",
      })
    ).payload;
  }
  async metrics(
    context: ProviderAccountContext,
    resources: PausedResources,
    range: { start: string; end: string },
  ) {
    const payload = (
      await this.call(
        context,
        this.provider === "chatgpt_ads"
          ? `/insights?campaign_id=${resources.campaignId}&start_time=${encodeURIComponent(range.start)}&end_time=${encodeURIComponent(range.end)}`
          : `/campaigns/${resources.campaignId}`,
        { method: "GET" },
      )
    ).payload;
    return statusMetrics(this.provider, payload, range);
  }
}

export const redditPaidAdsAdapter = new JsonPaidAdapter("reddit_ads");
export const tiktokPaidAdsAdapter = new JsonPaidAdapter("tiktok_ads");
export const chatgptPaidAdsAdapter = new JsonPaidAdapter("chatgpt_ads");

export function paidAdapter(provider: ProviderKey): PaidAdsAdapter {
  if (provider === "meta_business") return new MetaPaidAdsAdapter();
  if (provider === "google_ads") return new GooglePaidAdsAdapter();
  if (provider === "reddit_ads") return redditPaidAdsAdapter;
  if (provider === "tiktok_ads") return tiktokPaidAdsAdapter;
  if (provider === "chatgpt_ads") return chatgptPaidAdsAdapter;
  throw new Error(`${provider} is not a V1 paid advertising provider.`);
}
