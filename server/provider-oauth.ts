import "server-only";

import { database, initializeDatabase, loadAppState } from "@/db/runtime";
import type {
  ProviderAccountOption,
  ProviderAssetOption,
} from "@/lib/types";
import {
  providerEnvironment,
  saveProviderCredential,
} from "@/server/provider-credentials";

export type OAuthProvider = "google" | "meta" | "reddit";

const definitionIds: Record<OAuthProvider, string> = {
  google: "int-google-ads",
  meta: "int-meta",
  reddit: "int-reddit-ads",
};

const requiredConfiguration: Record<OAuthProvider, string[]> = {
  google: [
    "PROVIDER_TOKEN_ENCRYPTION_KEY",
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_DEVELOPER_TOKEN",
  ],
  meta: [
    "PROVIDER_TOKEN_ENCRYPTION_KEY",
    "META_ADS_APP_ID",
    "META_ADS_APP_SECRET",
  ],
  reddit: [
    "PROVIDER_TOKEN_ENCRYPTION_KEY",
    "REDDIT_ADS_CLIENT_ID",
    "REDDIT_ADS_CLIENT_SECRET",
    "REDDIT_ADS_USER_AGENT",
  ],
};

const now = () => new Date().toISOString();
const cleanReturnTo = (value: string | null) =>
  value?.startsWith("/app") ? value : "/app/integrations";
const origin = (request: Request) =>
  providerEnvironment().APP_BASE_URL?.replace(/\/$/, "") ??
  new URL(request.url).origin;
const callbackUrl = (request: Request, provider: OAuthProvider) =>
  `${origin(request)}/api/oauth/${provider}/callback`;

function requireProviderConfiguration(provider: OAuthProvider) {
  const values = providerEnvironment();
  const missing = requiredConfiguration[provider].filter(
    (key) => !values[key]?.trim(),
  );
  if (missing.length)
    throw new Error(
      `${provider[0].toUpperCase()}${provider.slice(1)} account login is waiting for platform-owner configuration.`,
    );
  return values;
}

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "meta" || value === "reddit";
}

export async function createProviderAuthorizationUrl(
  request: Request,
  provider: OAuthProvider,
  userId: string,
) {
  await initializeDatabase();
  const state = await loadAppState(userId);
  if (!new Set(["OWNER", "ADMIN"]).has(state.currentUser.role))
    throw new Error("Only an Owner or Admin can connect advertising accounts.");
  const values = requireProviderConfiguration(provider);
  const stateId = crypto.randomUUID();
  const createdAt = now();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const requestUrl = new URL(request.url);
  const returnTo = cleanReturnTo(requestUrl.searchParams.get("return_to"));
  await database()
    .prepare(
      "INSERT INTO oauth_states (id, workspace_id, definition_id, user_id, return_to, code_verifier, expires_at, used_at, created_at) VALUES (?, 'ws-northstar', ?, ?, ?, NULL, ?, NULL, ?)",
    )
    .bind(
      stateId,
      definitionIds[provider],
      userId,
      returnTo,
      expiresAt,
      createdAt,
    )
    .run();

  if (provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: values.GOOGLE_ADS_CLIENT_ID!,
      redirect_uri: callbackUrl(request, provider),
      response_type: "code",
      scope: "https://www.googleapis.com/auth/adwords",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state: stateId,
    }).toString();
    return url.toString();
  }
  if (provider === "meta") {
    const version = values.META_GRAPH_API_VERSION?.trim() || "v24.0";
    const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
    url.search = new URLSearchParams({
      client_id: values.META_ADS_APP_ID!,
      redirect_uri: callbackUrl(request, provider),
      response_type: "code",
      scope:
        "ads_management,ads_read,business_management,pages_show_list,pages_read_engagement,public_profile",
      state: stateId,
    }).toString();
    return url.toString();
  }
  const url = new URL("https://www.reddit.com/api/v1/authorize");
  url.search = new URLSearchParams({
    client_id: values.REDDIT_ADS_CLIENT_ID!,
    redirect_uri: callbackUrl(request, provider),
    response_type: "code",
    duration: "permanent",
    scope: "adsread,adsedit",
    state: stateId,
  }).toString();
  return url.toString();
}

async function jsonResponse(
  url: string,
  init: RequestInit,
  label: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const nested = payload.error as Record<string, unknown> | undefined;
    const message =
      typeof nested?.message === "string"
        ? nested.message
        : typeof payload.error_description === "string"
          ? payload.error_description
          : typeof payload.message === "string"
            ? payload.message
            : `${label} returned ${response.status}.`;
    throw new Error(message);
  }
  return payload;
}

const payloadData = (payload: Record<string, unknown>) =>
  Array.isArray(payload.data) ? (payload.data as Record<string, unknown>[]) : [];

async function googleAccounts(accessToken: string) {
  const values = providerEnvironment();
  const version = values.GOOGLE_ADS_API_VERSION?.trim() || "v25";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": values.GOOGLE_ADS_DEVELOPER_TOKEN!,
    "Content-Type": "application/json",
  };
  const listed = await jsonResponse(
    `https://googleads.googleapis.com/${version}/customers:listAccessibleCustomers`,
    { method: "GET", headers },
    "Google Ads account discovery",
  );
  const resources = Array.isArray(listed.resourceNames)
    ? listed.resourceNames.map(String).slice(0, 30)
    : [];
  const options: ProviderAccountOption[] = [];
  for (const resource of resources) {
    const customerId = resource.split("/").pop()?.replace(/\D/g, "") ?? "";
    if (!customerId) continue;
    try {
      const detail = await jsonResponse(
        `https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:search`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            query:
              "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1",
          }),
        },
        "Google Ads account details",
      );
      const row = Array.isArray(detail.results)
        ? (detail.results[0] as Record<string, unknown> | undefined)
        : undefined;
      const customer = row?.customer as Record<string, unknown> | undefined;
      options.push({
        id: customerId,
        name:
          (typeof customer?.descriptiveName === "string" &&
            customer.descriptiveName) ||
          `Google Ads ${customerId}`,
        currency:
          typeof customer?.currencyCode === "string"
            ? customer.currencyCode
            : undefined,
        timezone:
          typeof customer?.timeZone === "string" ? customer.timeZone : undefined,
        manager: Boolean(customer?.manager),
      });
    } catch {
      options.push({ id: customerId, name: `Google Ads ${customerId}` });
    }
  }
  const advertiserAccounts = options.filter((option) => !option.manager);
  return advertiserAccounts.length ? advertiserAccounts : options;
}

async function metaProof(token: string, appSecret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)),
  );
  return [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function metaAccounts(accessToken: string) {
  const values = providerEnvironment();
  const version = values.META_GRAPH_API_VERSION?.trim() || "v24.0";
  const proof = await metaProof(accessToken, values.META_ADS_APP_SECRET!);
  const query = (fields: string) =>
    new URLSearchParams({
      fields,
      limit: "100",
      access_token: accessToken,
      appsecret_proof: proof,
    });
  const accountsPayload = await jsonResponse(
    `https://graph.facebook.com/${version}/me/adaccounts?${query("id,name,account_id,currency,timezone_name,account_status")}`,
    { method: "GET" },
    "Meta ad account discovery",
  );
  const pagesPayload = await jsonResponse(
    `https://graph.facebook.com/${version}/me/accounts?${query("id,name")}`,
    { method: "GET" },
    "Meta Page discovery",
  );
  return {
    accounts: payloadData(accountsPayload).map((account) => ({
      id: String(account.account_id ?? account.id).replace(/^act_/, ""),
      name: String(account.name ?? `Meta Ads ${account.account_id}`),
      currency:
        typeof account.currency === "string" ? account.currency : undefined,
      timezone:
        typeof account.timezone_name === "string"
          ? account.timezone_name
          : undefined,
    })),
    assets: payloadData(pagesPayload).map((page) => ({
      id: String(page.id),
      name: String(page.name ?? "Facebook Page"),
      kind: "PAGE" as const,
    })),
  };
}

async function redditRequest(
  path: string,
  accessToken: string,
  label: string,
) {
  return jsonResponse(
    `https://ads-api.reddit.com/api/v3${path}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": providerEnvironment().REDDIT_ADS_USER_AGENT!,
      },
    },
    label,
  );
}

async function optionalRedditList(
  path: string,
  accessToken: string,
  label: string,
) {
  try {
    return payloadData(await redditRequest(path, accessToken, label));
  } catch {
    return [];
  }
}

async function redditAccounts(accessToken: string) {
  const businesses = payloadData(
    await redditRequest("/me/businesses", accessToken, "Reddit business discovery"),
  );
  const accounts: ProviderAccountOption[] = [];
  const assets: ProviderAssetOption[] = [];
  for (const business of businesses.slice(0, 20)) {
    const businessId = String(business.id ?? "");
    if (!businessId) continue;
    const businessAccounts = await optionalRedditList(
      `/businesses/${encodeURIComponent(businessId)}/ad_accounts`,
      accessToken,
      "Reddit ad account discovery",
    );
    for (const account of businessAccounts.slice(0, 30)) {
      const accountId = String(account.id ?? "");
      if (!accountId) continue;
      accounts.push({
        id: accountId,
        name: String(account.name ?? `Reddit Ads ${accountId}`),
        currency:
          typeof account.currency === "string" ? account.currency : undefined,
      });
      const [profiles, funding, pixels] = await Promise.all([
        optionalRedditList(
          `/ad_accounts/${encodeURIComponent(accountId)}/profiles`,
          accessToken,
          "Reddit profile discovery",
        ),
        optionalRedditList(
          `/ad_accounts/${encodeURIComponent(accountId)}/funding_instruments`,
          accessToken,
          "Reddit funding discovery",
        ),
        optionalRedditList(
          `/ad_accounts/${encodeURIComponent(accountId)}/pixels`,
          accessToken,
          "Reddit pixel discovery",
        ),
      ]);
      assets.push(
        ...profiles.map((item) => ({
          id: String(item.id),
          name: String(item.name ?? item.username ?? "Reddit profile"),
          kind: "PROFILE" as const,
          accountId,
        })),
        ...funding.map((item) => ({
          id: String(item.id),
          name: String(item.name ?? item.display_name ?? "Funding source"),
          kind: "FUNDING_INSTRUMENT" as const,
          accountId,
        })),
        ...pixels.map((item) => ({
          id: String(item.id),
          name: String(item.name ?? "Reddit Pixel"),
          kind: "PIXEL" as const,
          accountId,
        })),
      );
    }
  }
  return { accounts, assets };
}

export async function completeProviderOAuth(
  request: Request,
  provider: OAuthProvider,
  userId: string,
) {
  await initializeDatabase();
  const requestUrl = new URL(request.url);
  const stateId = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code")?.replace(/#_$/, "");
  const providerError = requestUrl.searchParams.get("error_description");
  if (providerError) throw new Error(providerError);
  if (!stateId || !code) throw new Error("Provider authorization was incomplete.");
  const oauthState = await database()
    .prepare("SELECT * FROM oauth_states WHERE id = ? LIMIT 1")
    .bind(stateId)
    .first<Record<string, unknown>>();
  if (
    !oauthState ||
    oauthState.used_at ||
    String(oauthState.user_id) !== userId ||
    String(oauthState.definition_id) !== definitionIds[provider] ||
    new Date(String(oauthState.expires_at)).getTime() < Date.now()
  )
    throw new Error("This provider authorization link expired. Start again.");
  await database()
    .prepare("UPDATE oauth_states SET used_at = ? WHERE id = ? AND used_at IS NULL")
    .bind(now(), stateId)
    .run();
  const values = requireProviderConfiguration(provider);
  let accessToken = "";
  let refreshToken: string | undefined;
  let tokenExpiresAt: string | undefined;
  let accountOptions: ProviderAccountOption[] = [];
  let assetOptions: ProviderAssetOption[] = [];

  if (provider === "google") {
    const token = await jsonResponse(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: values.GOOGLE_ADS_CLIENT_ID!,
          client_secret: values.GOOGLE_ADS_CLIENT_SECRET!,
          code,
          grant_type: "authorization_code",
          redirect_uri: callbackUrl(request, provider),
        }),
      },
      "Google OAuth",
    );
    accessToken = String(token.access_token ?? "");
    refreshToken = token.refresh_token ? String(token.refresh_token) : undefined;
    tokenExpiresAt = new Date(
      Date.now() + Number(token.expires_in ?? 3600) * 1000,
    ).toISOString();
    accountOptions = await googleAccounts(accessToken);
  } else if (provider === "meta") {
    const version = values.META_GRAPH_API_VERSION?.trim() || "v24.0";
    const short = await jsonResponse(
      `https://graph.facebook.com/${version}/oauth/access_token?${new URLSearchParams({
        client_id: values.META_ADS_APP_ID!,
        client_secret: values.META_ADS_APP_SECRET!,
        redirect_uri: callbackUrl(request, provider),
        code,
      })}`,
      { method: "GET" },
      "Meta OAuth",
    );
    const long = await jsonResponse(
      `https://graph.facebook.com/${version}/oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: values.META_ADS_APP_ID!,
        client_secret: values.META_ADS_APP_SECRET!,
        fb_exchange_token: String(short.access_token ?? ""),
      })}`,
      { method: "GET" },
      "Meta long-lived authorization",
    );
    accessToken = String(long.access_token ?? short.access_token ?? "");
    tokenExpiresAt = new Date(
      Date.now() + Number(long.expires_in ?? short.expires_in ?? 5_184_000) * 1000,
    ).toISOString();
    const discovered = await metaAccounts(accessToken);
    accountOptions = discovered.accounts;
    assetOptions = discovered.assets;
  } else {
    const encoded = btoa(
      `${values.REDDIT_ADS_CLIENT_ID!}:${values.REDDIT_ADS_CLIENT_SECRET!}`,
    );
    const token = await jsonResponse(
      "https://www.reddit.com/api/v1/access_token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${encoded}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": values.REDDIT_ADS_USER_AGENT!,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: callbackUrl(request, provider),
        }),
      },
      "Reddit OAuth",
    );
    accessToken = String(token.access_token ?? "");
    refreshToken = token.refresh_token ? String(token.refresh_token) : undefined;
    tokenExpiresAt = new Date(
      Date.now() + Number(token.expires_in ?? 3600) * 1000,
    ).toISOString();
    const discovered = await redditAccounts(accessToken);
    accountOptions = discovered.accounts;
    assetOptions = discovered.assets;
  }
  if (!accessToken) throw new Error("The provider did not return an access token.");
  if (!accountOptions.length)
    throw new Error(
      "No eligible advertising accounts were returned. Check account access and provider permissions.",
    );
  const definitionId = definitionIds[provider];
  const existing = await database()
    .prepare(
      "SELECT id FROM connections WHERE workspace_id = 'ws-northstar' AND definition_id = ? LIMIT 1",
    )
    .bind(definitionId)
    .first<Record<string, unknown>>();
  const connectionId = existing?.id
    ? String(existing.id)
    : `conn-${crypto.randomUUID().slice(0, 8)}`;
  const state = await loadAppState(userId);
  const definition = state.definitions.find((item) => item.id === definitionId)!;
  if (existing) {
    await database()
      .prepare(
        "UPDATE connections SET account_name = 'Choose an account', state = 'NEEDS_ACCOUNT', capabilities_json = ?, last_activity = ?, last_error = NULL, success_rate = 0 WHERE id = ?",
      )
      .bind(JSON.stringify(definition.capabilities), now(), connectionId)
      .run();
  } else {
    await database()
      .prepare(
        "INSERT INTO connections (id, workspace_id, definition_id, account_name, state, capabilities_json, last_activity, last_error, success_rate) VALUES (?, 'ws-northstar', ?, 'Choose an account', 'NEEDS_ACCOUNT', ?, ?, NULL, 0)",
      )
      .bind(
        connectionId,
        definitionId,
        JSON.stringify(definition.capabilities),
        now(),
      )
      .run();
  }
  await saveProviderCredential({
    definitionId,
    connectionId,
    accessToken,
    refreshToken,
    tokenExpiresAt,
    accountOptions,
    assetOptions,
    createdBy: userId,
  });
  await database()
    .prepare(
      "INSERT INTO audit_events (id, workspace_id, actor_id, action, entity_type, entity_id, detail, created_at) VALUES (?, 'ws-northstar', ?, 'PROVIDER_AUTHORIZED', 'Connection', ?, ?, ?)",
    )
    .bind(
      `audit-${crypto.randomUUID().slice(0, 8)}`,
      userId,
      connectionId,
      `${definition.name} authorization completed; account selection required`,
      now(),
    )
    .run();
  return {
    connectionId,
    returnTo: cleanReturnTo(String(oauthState.return_to)),
  };
}
