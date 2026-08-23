import "server-only";

import {
  getProviderCredential,
  providerEnvironment,
  updateProviderTokens,
  type DecryptedProviderCredential,
} from "@/server/provider-credentials";

async function tokenRequest(
  url: string,
  init: RequestInit,
  label: string,
) {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error(
      typeof payload.error_description === "string"
        ? payload.error_description
        : `${label} authorization expired. Reconnect the account.`,
    );
  }
  return payload;
}

export async function getFreshProviderCredential(
  definitionId: string,
): Promise<DecryptedProviderCredential> {
  const credential = await getProviderCredential(definitionId);
  if (!credential || !credential.providerAccountId) {
    const providerName =
      definitionId === "int-reddit-ads"
        ? "Reddit Ads"
        : definitionId === "int-google-ads"
          ? "Google Ads"
          : definitionId === "int-meta"
            ? "Meta Ads"
            : "This advertising provider";
    throw new Error(
      `${providerName} is not connected. Connect it and choose an account first.`,
    );
  }
  const expiry = credential.tokenExpiresAt
    ? new Date(credential.tokenExpiresAt).getTime()
    : Number.POSITIVE_INFINITY;
  if (expiry > Date.now() + 5 * 60_000) return credential;
  const values = providerEnvironment();
  if (definitionId === "int-google-ads") {
    if (!credential.refreshToken)
      throw new Error("Google authorization expired. Reconnect the account.");
    const payload = await tokenRequest(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: values.GOOGLE_ADS_CLIENT_ID ?? "",
          client_secret: values.GOOGLE_ADS_CLIENT_SECRET ?? "",
          refresh_token: credential.refreshToken,
          grant_type: "refresh_token",
        }),
      },
      "Google",
    );
    const accessToken = String(payload.access_token);
    const tokenExpiresAt = new Date(
      Date.now() + Number(payload.expires_in ?? 3600) * 1000,
    ).toISOString();
    await updateProviderTokens(definitionId, { accessToken, tokenExpiresAt });
    return { ...credential, accessToken, tokenExpiresAt };
  }
  if (definitionId === "int-reddit-ads") {
    if (!credential.refreshToken)
      throw new Error("Reddit authorization expired. Reconnect the account.");
    const basic = btoa(
      `${values.REDDIT_ADS_CLIENT_ID ?? ""}:${values.REDDIT_ADS_CLIENT_SECRET ?? ""}`,
    );
    const payload = await tokenRequest(
      "https://www.reddit.com/api/v1/access_token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": values.REDDIT_ADS_USER_AGENT ?? "GrowthOS/1.0",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: credential.refreshToken,
        }),
      },
      "Reddit",
    );
    const accessToken = String(payload.access_token);
    const tokenExpiresAt = new Date(
      Date.now() + Number(payload.expires_in ?? 3600) * 1000,
    ).toISOString();
    await updateProviderTokens(definitionId, { accessToken, tokenExpiresAt });
    return { ...credential, accessToken, tokenExpiresAt };
  }
  throw new Error("Provider authorization expired. Reconnect the account.");
}
