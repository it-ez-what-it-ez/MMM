import "server-only";

type EncryptedValue = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

function decodeBase64(value: string) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function keyBytes() {
  const raw = process.env.PROVIDER_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw)
    throw new Error(
      "PROVIDER_TOKEN_ENCRYPTION_KEY is required before provider accounts can be connected.",
    );
  const bytes = /^[0-9a-f]{64}$/i.test(raw)
    ? Uint8Array.from(raw.match(/.{2}/g)!, (pair) => Number.parseInt(pair, 16))
    : decodeBase64(raw);
  if (bytes.byteLength !== 32)
    throw new Error(
      "PROVIDER_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.",
    );
  return bytes;
}

async function key() {
  return crypto.subtle.importKey("raw", keyBytes(), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptCredential(
  value: unknown,
): Promise<EncryptedValue> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const combined = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      await key(),
      plaintext,
    ),
  );
  const ciphertext = combined.slice(0, -16);
  const authTag = combined.slice(-16);
  return {
    ciphertext: encodeBase64(ciphertext),
    iv: encodeBase64(iv),
    authTag: encodeBase64(authTag),
    keyVersion: 1,
  };
}

export async function decryptCredential<T>(
  encrypted: EncryptedValue,
): Promise<T> {
  const ciphertext = decodeBase64(encrypted.ciphertext);
  const authTag = decodeBase64(encrypted.authTag);
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(encrypted.iv), tagLength: 128 },
    await key(),
    combined,
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export async function sha256(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomUrlSafe(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
