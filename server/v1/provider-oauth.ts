import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { OAuthProviderKey } from "@/lib/v1/domain";
import { encryptCredential } from "./credentials";
import { oauthConfiguration } from "./provider-platform";

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes: string[];
  raw: Record<string, unknown>;
};
type DiscoveredAccount = {
  externalId: string;
  accountType: string;
  name: string;
  currency?: string;
  timezone?: string;
  billingStatus?: string;
  capabilities: Record<string, unknown>;
  secret?: Record<string, unknown>;
};

async function jsonResponse(response: Response, provider: string) {
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const nested = payload.error as
      Record<string, unknown> | string | undefined;
    const message =
      typeof nested === "string"
        ? nested
        : typeof nested?.message === "string"
          ? nested.message
          : typeof payload.message === "string"
            ? payload.message
            : `${provider} returned ${response.status}.`;
    throw new Error(message);
  }
  return payload;
}

function tokenSetFromPayload(
  payload: Record<string, unknown>,
  previous?: TokenSet,
): TokenSet {
  const nested =
    (payload.data as Record<string, unknown> | undefined) ?? payload;
  const accessToken = String(nested.access_token ?? "");
  if (!accessToken) throw new Error("The provider did not return an access token.");
  const seconds = Number(nested.expires_in ?? 0);
  const scopeValue = nested.scope;
  return {
    accessToken,
    refreshToken:
      typeof nested.refresh_token === "string"
        ? nested.refresh_token
        : previous?.refreshToken,
    expiresAt: seconds
      ? new Date(Date.now() + seconds * 1000).toISOString()
      : previous?.expiresAt,
    scopes:
      typeof scopeValue === "string"
        ? scopeValue.split(/[ ,]+/).filter(Boolean)
        : previous?.scopes ?? [],
    raw: payload,
  };
}

export async function exchangeAuthorizationCode(
  provider: OAuthProviderKey,
  code: string,
  verifier: string | null,
): Promise<TokenSet> {
  const config = oauthConfiguration(provider);
  let response: Response;
  if (provider === "tiktok_ads") {
    response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: config.clientId,
        secret: config.clientSecret,
        auth_code: code,
      }),
    });
  } else {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.callback,
    });
    if (provider === "tiktok_organic") {
      body.set("client_key", config.clientId);
      body.set("client_secret", config.clientSecret);
    } else if (provider !== "reddit_ads") {
      body.set("client_id", config.clientId);
      body.set("client_secret", config.clientSecret);
    }
    if (verifier && config.pkce) body.set("code_verifier", verifier);
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    };
    if (provider === "reddit_ads")
      headers.Authorization = `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`;
    response = await fetch(config.tokenUrl, { method: "POST", headers, body });
  }
  const payload = await jsonResponse(response, provider);
  return tokenSetFromPayload(payload);
}

export async function refreshAuthorizationTokens(
  provider: OAuthProviderKey,
  current: TokenSet,
): Promise<TokenSet> {
  const config = oauthConfiguration(provider);
  let response: Response;
  if (provider === "meta_business") {
    const target = new URL(config.tokenUrl);
    target.searchParams.set("grant_type", "fb_exchange_token");
    target.searchParams.set("client_id", config.clientId);
    target.searchParams.set("client_secret", config.clientSecret);
    target.searchParams.set("fb_exchange_token", current.accessToken);
    response = await fetch(target);
  } else if (provider === "tiktok_ads") {
    if (!current.refreshToken)
      throw new Error("TikTok Ads did not issue a refresh token. Reconnect this account.");
    response = await fetch(
      "https://business-api.tiktok.com/open_api/v1.3/oauth2/refresh_token/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: config.clientId,
          secret: config.clientSecret,
          refresh_token: current.refreshToken,
        }),
      },
    );
  } else {
    if (!current.refreshToken)
      throw new Error(`${provider} did not issue a refresh token. Reconnect this account.`);
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
    });
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    };
    if (provider === "reddit_ads") {
      headers.Authorization = `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`;
    } else if (provider === "tiktok_organic") {
      body.set("client_key", config.clientId);
      body.set("client_secret", config.clientSecret);
    } else {
      body.set("client_id", config.clientId);
      body.set("client_secret", config.clientSecret);
    }
    response = await fetch(config.tokenUrl, { method: "POST", headers, body });
  }
  return tokenSetFromPayload(await jsonResponse(response, provider), current);
}

async function authorizedJson(
  url: string,
  token: string,
  headers: Record<string, string> = {},
) {
  return jsonResponse(
    await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...headers,
      },
    }),
    new URL(url).hostname,
  );
}

async function authorizedPostJson(url: string, token: string) {
  return jsonResponse(
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: "{}",
    }),
    new URL(url).hostname,
  );
}

export async function discoverProviderAccounts(
  provider: OAuthProviderKey,
  tokens: TokenSet,
): Promise<{ externalUserId: string; accounts: DiscoveredAccount[] }> {
  if (provider === "meta_business") {
    const version = process.env.META_GRAPH_VERSION || "v24.0";
    const [profile, ads, pages] = await Promise.all([
      authorizedJson(
        `https://graph.facebook.com/${version}/me?fields=id,name`,
        tokens.accessToken,
      ),
      authorizedJson(
        `https://graph.facebook.com/${version}/me/adaccounts?fields=id,account_id,name,currency,timezone_name,account_status`,
        tokens.accessToken,
      ),
      authorizedJson(
        `https://graph.facebook.com/${version}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}`,
        tokens.accessToken,
      ),
    ]);
    const adRows = (ads.data as Record<string, unknown>[] | undefined) ?? [];
    const pageRows =
      (pages.data as Record<string, unknown>[] | undefined) ?? [];
    const accounts: DiscoveredAccount[] = adRows.map((row) => ({
      externalId: String(row.account_id ?? row.id).replace(/^act_/, ""),
      accountType: "ad_account",
      name: String(row.name ?? row.id),
      currency: typeof row.currency === "string" ? row.currency : undefined,
      timezone:
        typeof row.timezone_name === "string" ? row.timezone_name : undefined,
      billingStatus: String(row.account_status ?? "unknown"),
      capabilities: {
        staticImage: true,
        carousel: true,
        reporting: true,
        pageSelectionRequired: true,
      },
    }));
    for (const page of pageRows) {
      accounts.push({
        externalId: String(page.id),
        accountType: "facebook_page",
        name: String(page.name ?? page.id),
        capabilities: { staticPost: true, carousel: true, reporting: true },
        secret: { pageAccessToken: page.access_token },
      });
      const instagram = page.instagram_business_account as
        Record<string, unknown> | undefined;
      if (instagram?.id)
        accounts.push({
          externalId: String(instagram.id),
          accountType: "instagram_professional",
          name: String(instagram.username ?? `${page.name} Instagram`),
          capabilities: { staticPost: true, carousel: true, reporting: true },
          secret: { pageId: page.id, pageAccessToken: page.access_token },
        });
    }
    return { externalUserId: String(profile.id), accounts };
  }
  if (provider === "google_ads") {
    const profile = await authorizedJson(
      "https://openidconnect.googleapis.com/v1/userinfo",
      tokens.accessToken,
    );
    const accessible = await authorizedJson(
      "https://googleads.googleapis.com/v25/customers:listAccessibleCustomers",
      tokens.accessToken,
      { "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "" },
    );
    const names = (accessible.resourceNames as string[] | undefined) ?? [];
    const customers = await Promise.all(
      names.slice(0, 50).map(async (name) => {
        const id = name.split("/").pop()!;
        const customer = await authorizedJson(
          `https://googleads.googleapis.com/v25/customers/${id}`,
          tokens.accessToken,
          {
            "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
            ...(process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID
              ? {
                  "login-customer-id": process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID.replace(/\D/g, ""),
                }
              : {}),
          },
        );
        return { id, customer };
      }),
    );
    return {
      externalUserId: String(profile.sub ?? profile.email),
      accounts: customers.map(({ id, customer }) => ({
        externalId: id,
        accountType: "ad_account",
        name: String(customer.descriptiveName ?? `Google Ads ${id}`),
        currency:
          typeof customer.currencyCode === "string"
            ? customer.currencyCode
            : undefined,
        timezone:
          typeof customer.timeZone === "string" ? customer.timeZone : undefined,
        billingStatus: customer.testAccount ? "test_account" : "unknown",
        capabilities: {
          responsiveSearch: true,
          responsiveDisplay: true,
          reporting: true,
          manager: Boolean(customer.manager),
          testAccount: Boolean(customer.testAccount),
        },
      })),
    };
  }
  if (provider === "ga4") {
    const profile = await authorizedJson(
      "https://openidconnect.googleapis.com/v1/userinfo",
      tokens.accessToken,
    );
    const summaries = await authorizedJson(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
      tokens.accessToken,
    );
    const accounts: DiscoveredAccount[] = [];
    for (const summary of (summaries.accountSummaries as
      Record<string, unknown>[] | undefined) ?? [])
      for (const property of (summary.propertySummaries as
        Record<string, unknown>[] | undefined) ?? [])
        accounts.push({
          externalId: String(property.property).split("/").pop()!,
          accountType: "ga4_property",
          name: String(property.displayName ?? property.property),
          capabilities: { reporting: true, readOnly: true },
        });
    return { externalUserId: String(profile.sub ?? profile.email), accounts };
  }
  if (provider === "reddit_ads") {
    const profile = await authorizedJson(
      "https://oauth.reddit.com/api/v1/me",
      tokens.accessToken,
      { "User-Agent": "GrowthOS/1.0" },
    );
    const adAccounts = await authorizedJson(
      "https://ads-api.reddit.com/api/v3/ad_accounts",
      tokens.accessToken,
      { "User-Agent": "GrowthOS/1.0" },
    );
    const rows =
      (adAccounts.data as Record<string, unknown>[] | undefined) ??
      (adAccounts.results as Record<string, unknown>[] | undefined) ??
      [];
    return {
      externalUserId: String(profile.id ?? profile.name),
      accounts: rows.map((row) => ({
        externalId: String(row.id),
        accountType: "ad_account",
        name: String(row.name ?? row.id),
        currency: typeof row.currency === "string" ? row.currency : undefined,
        timezone: typeof row.timezone === "string" ? row.timezone : undefined,
        capabilities: { image: true, carousel: true, reporting: true },
      })),
    };
  }
  if (provider === "linkedin_pages") {
    const version = process.env.LINKEDIN_API_VERSION || "202602";
    const profile = await authorizedJson(
      "https://api.linkedin.com/v2/userinfo",
      tokens.accessToken,
    );
    const organizations = await authorizedJson(
      "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&state=APPROVED",
      tokens.accessToken,
      { "LinkedIn-Version": version, "X-Restli-Protocol-Version": "2.0.0" },
    );
    const rows =
      (organizations.elements as Record<string, unknown>[] | undefined) ?? [];
    return {
      externalUserId: String(profile.sub),
      accounts: rows.map((row) => {
        const urn = String(row.organization ?? "");
        return {
          externalId: urn.split(":").pop()!,
          accountType: "organization_page",
          name: urn,
          capabilities: {
            text: true,
            image: true,
            document: true,
            reporting: true,
          },
        };
      }),
    };
  }
  if (provider === "tiktok_organic") {
    const [profile, creatorResponse] = await Promise.all([
      authorizedJson(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name",
        tokens.accessToken,
      ),
      authorizedPostJson(
        "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
        tokens.accessToken,
      ),
    ]);
    const user = (profile.data as Record<string, unknown> | undefined)?.user as
      Record<string, unknown> | undefined;
    const creator =
      (creatorResponse.data as Record<string, unknown> | undefined) ?? {};
    return {
      externalUserId: String(user?.open_id),
      accounts: [
        {
          externalId: String(user?.open_id),
          accountType: "creator",
          name: String(user?.display_name ?? "TikTok account"),
          capabilities: {
            photo: true,
            photoCarousel: true,
            video: false,
            privacyOptionsRequired: true,
            privacyOptions:
              (creator.privacy_level_options as string[] | undefined) ?? [],
            commentsDisabled: Boolean(creator.comment_disabled),
          },
        },
      ],
    };
  }
  const nested =
    (tokens.raw.data as Record<string, unknown> | undefined) ?? tokens.raw;
  const advertiserIds =
    (nested.advertiser_ids as Array<string | number> | undefined) ?? [];
  return {
    externalUserId: String(
      nested.open_id ??
        nested.creator_id ??
        advertiserIds[0] ??
        "tiktok-business",
    ),
    accounts: advertiserIds.map((id) => ({
      externalId: String(id),
      accountType: "ad_account",
      name: `TikTok Ads ${id}`,
      capabilities: {
        staticCarousel: true,
        reporting: true,
        capabilityDiscoveryRequired: true,
      },
    })),
  };
}

export async function persistProviderConnection(input: {
  provider: OAuthProviderKey;
  workspaceId: string;
  userId: string;
  tokens: TokenSet;
  externalUserId: string;
  accounts: DiscoveredAccount[];
}) {
  const admin = getSupabaseAdmin();
  const existing = await admin
    .from("provider_connections")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("provider_key", input.provider)
    .eq("external_user_id", input.externalUserId)
    .maybeSingle();
  const connectionId = existing.data?.id ?? crypto.randomUUID();
  const credentialPayload = {
    accessToken: input.tokens.accessToken,
    refreshToken: input.tokens.refreshToken,
    scopes: input.tokens.scopes,
    expiresAt: input.tokens.expiresAt,
    accountSecrets: Object.fromEntries(
      input.accounts
        .filter((account) => account.secret)
        .map((account) => [account.externalId, account.secret]),
    ),
  };
  const encrypted = await encryptCredential(credentialPayload);
  const connectionRecord = {
    id: connectionId,
    workspace_id: input.workspaceId,
    provider_key: input.provider,
    status: "connected",
    external_user_id: input.externalUserId,
    granted_scopes: input.tokens.scopes,
    token_expires_at: input.tokens.expiresAt ?? null,
    health_checked_at: new Date().toISOString(),
    health_error: null,
    connected_by: input.userId,
  };
  const { error: connectionError } = await admin
    .from("provider_connections")
    .upsert(connectionRecord);
  if (connectionError) throw connectionError;
  const { error: credentialError } = await admin
    .schema("private")
    .from("provider_credentials")
    .upsert({
      connection_id: connectionId,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      key_version: encrypted.keyVersion,
    });
  if (credentialError) throw credentialError;
  await admin
    .from("provider_accounts")
    .delete()
    .eq("connection_id", connectionId);
  if (input.accounts.length) {
    const { error: accountsError } = await admin
      .from("provider_accounts")
      .insert(
        input.accounts.map((account) => ({
          workspace_id: input.workspaceId,
          connection_id: connectionId,
          provider_key: input.provider,
          external_id: account.externalId,
          account_type: account.accountType,
          name: account.name,
          currency: account.currency ?? null,
          timezone: account.timezone ?? null,
          billing_status: account.billingStatus ?? null,
          capabilities: account.capabilities,
          selected: false,
        })),
      );
    if (accountsError) throw accountsError;
  }
  return connectionId;
}
