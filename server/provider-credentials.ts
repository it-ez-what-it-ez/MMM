import "server-only";

import { env } from "cloudflare:workers";
import { database, initializeDatabase } from "@/db/runtime";
import type {
  ProviderAccountOption,
  ProviderAssetOption,
} from "@/lib/types";

type CredentialRow = Record<string, unknown>;

export type ProviderCredentialMetadata = {
  accountOptions: ProviderAccountOption[];
  assetOptions: ProviderAssetOption[];
  selectedAssets: Record<string, string>;
  loginCustomerId?: string;
};

export type DecryptedProviderCredential = {
  id: string;
  definitionId: string;
  connectionId: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  providerAccountId?: string;
  providerAccountName?: string;
  metadata: ProviderCredentialMetadata;
};

const values = () => env as unknown as Record<string, string | undefined>;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const configured = values().PROVIDER_TOKEN_ENCRYPTION_KEY?.trim();
  if (!configured)
    throw new Error(
      "Secure provider storage is not configured. Add the provider-token encryption secret.",
    );
  let raw: Uint8Array;
  try {
    raw = base64ToBytes(configured);
  } catch {
    raw = new Uint8Array();
  }
  if (raw.length !== 32) {
    raw = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(configured)),
    );
  }
  const keyBytes = new Uint8Array(raw);
  return crypto.subtle.importKey("raw", keyBytes.buffer, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptProviderSecret(secret: string) {
  if (!secret) throw new Error("Provider credential cannot be empty.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(secret),
  );
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptProviderSecret(value: string) {
  const [version, ivValue, payload] = value.split(".");
  if (version !== "v1" || !ivValue || !payload)
    throw new Error("Stored provider credential has an unsupported format.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivValue) },
    await encryptionKey(),
    base64ToBytes(payload),
  );
  return new TextDecoder().decode(decrypted);
}

const metadata = (value: unknown): ProviderCredentialMetadata => {
  try {
    const parsed = JSON.parse(String(value)) as Partial<ProviderCredentialMetadata>;
    return {
      accountOptions: Array.isArray(parsed.accountOptions)
        ? parsed.accountOptions
        : [],
      assetOptions: Array.isArray(parsed.assetOptions) ? parsed.assetOptions : [],
      selectedAssets:
        parsed.selectedAssets && typeof parsed.selectedAssets === "object"
          ? parsed.selectedAssets
          : {},
      loginCustomerId: parsed.loginCustomerId,
    };
  } catch {
    return { accountOptions: [], assetOptions: [], selectedAssets: {} };
  }
};

export async function getProviderCredential(definitionId: string) {
  await initializeDatabase();
  const row = await database()
    .prepare(
      "SELECT * FROM provider_credentials WHERE workspace_id = 'ws-northstar' AND definition_id = ? LIMIT 1",
    )
    .bind(definitionId)
    .first<CredentialRow>();
  if (!row) return null;
  return {
    id: String(row.id),
    definitionId: String(row.definition_id),
    connectionId: String(row.connection_id),
    accessToken: await decryptProviderSecret(String(row.encrypted_access_token)),
    refreshToken: row.encrypted_refresh_token
      ? await decryptProviderSecret(String(row.encrypted_refresh_token))
      : undefined,
    tokenExpiresAt: row.token_expires_at
      ? String(row.token_expires_at)
      : undefined,
    providerAccountId: row.provider_account_id
      ? String(row.provider_account_id)
      : undefined,
    providerAccountName: row.provider_account_name
      ? String(row.provider_account_name)
      : undefined,
    metadata: metadata(row.metadata_json),
  } satisfies DecryptedProviderCredential;
}

export async function saveProviderCredential(input: {
  definitionId: string;
  connectionId: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  accountOptions: ProviderAccountOption[];
  assetOptions?: ProviderAssetOption[];
  createdBy: string;
}) {
  await initializeDatabase();
  const existing = await database()
    .prepare(
      "SELECT encrypted_refresh_token, created_at FROM provider_credentials WHERE workspace_id = 'ws-northstar' AND definition_id = ? LIMIT 1",
    )
    .bind(input.definitionId)
    .first<CredentialRow>();
  const encryptedRefreshToken = input.refreshToken
    ? await encryptProviderSecret(input.refreshToken)
    : existing?.encrypted_refresh_token
      ? String(existing.encrypted_refresh_token)
      : null;
  const timestamp = new Date().toISOString();
  await database()
    .prepare(
      "INSERT INTO provider_credentials (id, workspace_id, definition_id, connection_id, encrypted_access_token, encrypted_refresh_token, token_expires_at, provider_account_id, provider_account_name, metadata_json, created_by, created_at, updated_at) VALUES (?, 'ws-northstar', ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?) ON CONFLICT(workspace_id, definition_id) DO UPDATE SET connection_id = excluded.connection_id, encrypted_access_token = excluded.encrypted_access_token, encrypted_refresh_token = excluded.encrypted_refresh_token, token_expires_at = excluded.token_expires_at, provider_account_id = NULL, provider_account_name = NULL, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at",
    )
    .bind(
      `pcred-${crypto.randomUUID().slice(0, 8)}`,
      input.definitionId,
      input.connectionId,
      await encryptProviderSecret(input.accessToken),
      encryptedRefreshToken,
      input.tokenExpiresAt ?? null,
      JSON.stringify({
        accountOptions: input.accountOptions,
        assetOptions: input.assetOptions ?? [],
        selectedAssets: {},
      } satisfies ProviderCredentialMetadata),
      input.createdBy,
      existing?.created_at ? String(existing.created_at) : timestamp,
      timestamp,
    )
    .run();
}

export async function selectProviderAccount(input: {
  definitionId: string;
  connectionId: string;
  accountId: string;
  selectedAssets?: Record<string, string>;
}) {
  const credential = await getProviderCredential(input.definitionId);
  if (!credential || credential.connectionId !== input.connectionId)
    throw new Error("Provider connection was not found.");
  const account = credential.metadata.accountOptions.find(
    (option) => option.id === input.accountId,
  );
  if (!account) throw new Error("Choose an account returned by the provider.");
  const selectedAssets = input.selectedAssets ?? {};
  if (input.definitionId === "int-meta" && !selectedAssets.pageId)
    throw new Error("Choose the Facebook Page that will represent this advertiser.");
  if (input.definitionId === "int-reddit-ads") {
    for (const key of ["profileId", "fundingInstrumentId", "pixelId"])
      if (!selectedAssets[key])
        throw new Error("Choose the Reddit profile, funding source, and pixel.");
  }
  const updatedMetadata = {
    ...credential.metadata,
    selectedAssets,
  } satisfies ProviderCredentialMetadata;
  const timestamp = new Date().toISOString();
  await database().batch([
    database()
      .prepare(
        "UPDATE provider_credentials SET provider_account_id = ?, provider_account_name = ?, metadata_json = ?, updated_at = ? WHERE connection_id = ?",
      )
      .bind(
        account.id,
        account.name,
        JSON.stringify(updatedMetadata),
        timestamp,
        input.connectionId,
      ),
    database()
      .prepare(
        "UPDATE connections SET account_name = ?, state = 'CONNECTED', last_activity = ?, last_error = NULL, success_rate = 100 WHERE id = ?",
      )
      .bind(account.name, timestamp, input.connectionId),
  ]);
  return account;
}

export async function updateProviderTokens(
  definitionId: string,
  input: { accessToken: string; refreshToken?: string; tokenExpiresAt?: string },
) {
  const existing = await getProviderCredential(definitionId);
  if (!existing) throw new Error("Provider connection was not found.");
  await database()
    .prepare(
      "UPDATE provider_credentials SET encrypted_access_token = ?, encrypted_refresh_token = COALESCE(?, encrypted_refresh_token), token_expires_at = ?, updated_at = ? WHERE definition_id = ? AND workspace_id = 'ws-northstar'",
    )
    .bind(
      await encryptProviderSecret(input.accessToken),
      input.refreshToken
        ? await encryptProviderSecret(input.refreshToken)
        : null,
      input.tokenExpiresAt ?? null,
      new Date().toISOString(),
      definitionId,
    )
    .run();
}

export async function removeProviderCredential(definitionId: string) {
  const credential = await getProviderCredential(definitionId);
  if (!credential) return;
  await database().batch([
    database()
      .prepare("DELETE FROM provider_credentials WHERE definition_id = ?")
      .bind(definitionId),
    database()
      .prepare(
        "UPDATE connections SET account_name = 'Not connected', state = 'SETUP_REQUIRED', last_error = 'Authorization required', success_rate = 0, last_activity = ? WHERE id = ?",
      )
      .bind(new Date().toISOString(), credential.connectionId),
  ]);
}

export function providerEnvironment() {
  return values();
}
