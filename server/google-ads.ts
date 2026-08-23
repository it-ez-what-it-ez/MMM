import "server-only";

import { providerEnvironment } from "@/server/provider-credentials";

export type GoogleAdsAuth = {
  accessToken: string;
  customerId: string;
  loginCustomerId?: string;
};

async function googleRequest(
  auth: GoogleAdsAuth,
  path: string,
  init: RequestInit,
) {
  const values = providerEnvironment();
  const version = values.GOOGLE_ADS_API_VERSION?.trim() || "v25";
  const response = await fetch(`https://googleads.googleapis.com/${version}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "developer-token": values.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      ...(auth.loginCustomerId
        ? { "login-customer-id": auth.loginCustomerId.replace(/\D/g, "") }
        : {}),
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const error = payload.error as Record<string, unknown> | undefined;
    throw new Error(
      typeof error?.message === "string"
        ? error.message
        : `Google Ads API returned ${response.status}.`,
    );
  }
  return payload;
}

function resourceName(payload: Record<string, unknown>, label: string) {
  const results = payload.results as Record<string, unknown>[] | undefined;
  const value = results?.[0]?.resourceName;
  if (typeof value !== "string")
    throw new Error(`Google Ads did not return a ${label} resource.`);
  return value;
}

const clean = (value: string, max: number) => value.trim().slice(0, max);
const googleDate = (value: string) => value.replaceAll("-", "");

export async function verifyGoogleAdsAccount(auth: GoogleAdsAuth) {
  return googleRequest(
    auth,
    `/customers/${auth.customerId}/googleAds:search`,
    {
      method: "POST",
      body: JSON.stringify({
        query:
          "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1",
      }),
    },
  );
}

export async function createPausedGoogleAdsCampaign(input: {
  auth: GoogleAdsAuth;
  campaignName: string;
  budget: number;
  startDate: string;
  endDate: string;
  creative: {
    headline: string;
    body: string;
    targetUrl: string;
  };
}) {
  const { auth } = input;
  new URL(input.creative.targetUrl);
  const customerPath = `/customers/${auth.customerId}`;
  const budget = await googleRequest(
    auth,
    `${customerPath}/campaignBudgets:mutate`,
    {
      method: "POST",
      body: JSON.stringify({
        operations: [
          {
            create: {
              name: `${clean(input.campaignName, 220)} · Budget`,
              amountMicros: String(Math.max(1, Math.round((input.budget / 30) * 1_000_000))),
              deliveryMethod: "STANDARD",
              explicitlyShared: false,
            },
          },
        ],
      }),
    },
  );
  const budgetResourceName = resourceName(budget, "budget");
  const campaign = await googleRequest(
    auth,
    `${customerPath}/campaigns:mutate`,
    {
      method: "POST",
      body: JSON.stringify({
        operations: [
          {
            create: {
              name: clean(input.campaignName, 220),
              status: "PAUSED",
              advertisingChannelType: "SEARCH",
              campaignBudget: budgetResourceName,
              manualCpc: { enhancedCpcEnabled: false },
              networkSettings: {
                targetGoogleSearch: true,
                targetSearchNetwork: true,
                targetContentNetwork: false,
                targetPartnerSearchNetwork: false,
              },
              startDate: googleDate(input.startDate),
              endDate: googleDate(input.endDate),
            },
          },
        ],
      }),
    },
  );
  const campaignResourceName = resourceName(campaign, "campaign");
  const adGroup = await googleRequest(auth, `${customerPath}/adGroups:mutate`, {
    method: "POST",
    body: JSON.stringify({
      operations: [
        {
          create: {
            name: `${clean(input.campaignName, 220)} · Search`,
            campaign: campaignResourceName,
            status: "PAUSED",
            type: "SEARCH_STANDARD",
            cpcBidMicros: "1000000",
          },
        },
      ],
    }),
  });
  const adGroupResourceName = resourceName(adGroup, "ad group");
  const headline = clean(input.creative.headline, 30);
  const description = clean(input.creative.body, 90);
  const ad = await googleRequest(auth, `${customerPath}/adGroupAds:mutate`, {
    method: "POST",
    body: JSON.stringify({
      operations: [
        {
          create: {
            adGroup: adGroupResourceName,
            status: "PAUSED",
            ad: {
              finalUrls: [input.creative.targetUrl],
              responsiveSearchAd: {
                headlines: [
                  { text: headline },
                  { text: clean(`${headline} today`, 30) },
                  { text: clean(`Discover ${headline}`, 30) },
                ],
                descriptions: [
                  { text: description },
                  { text: clean(`${description} Learn more today.`, 90) },
                ],
              },
            },
          },
        },
      ],
    }),
  });
  const adResourceName = resourceName(ad, "ad");
  return {
    campaignId: campaignResourceName.split("/").pop()!,
    campaignResourceName,
    adGroupId: adGroupResourceName.split("/").pop()!,
    adId: adResourceName.split("/").pop()!,
    status: "PAUSED" as const,
  };
}

export async function activateGoogleAdsCampaign(
  auth: GoogleAdsAuth,
  campaignId: string,
) {
  return googleRequest(auth, `/customers/${auth.customerId}/campaigns:mutate`, {
    method: "POST",
    body: JSON.stringify({
      operations: [
        {
          update: {
            resourceName: `customers/${auth.customerId}/campaigns/${campaignId}`,
            status: "ENABLED",
          },
          updateMask: "status",
        },
      ],
    }),
  });
}
