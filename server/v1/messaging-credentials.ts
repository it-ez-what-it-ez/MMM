import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { decryptCredential } from "@/server/v1/credentials";
import type { SendGridCredential, TwilioCredential } from "@/server/v1/adapters/messaging";

export async function loadMessagingCredential<T extends TwilioCredential | SendGridCredential>(
  connectionId: string,
) {
  const admin = getSupabaseAdmin();
  const [{ data: connection, error: connectionError }, { data: encrypted, error: credentialError }] = await Promise.all([
    admin.from("provider_connections").select("id,workspace_id,provider_key,status").eq("id", connectionId).single(),
    admin.schema("private").from("provider_credentials").select("ciphertext,iv,auth_tag,key_version").eq("connection_id", connectionId).single(),
  ]);
  if (connectionError || credentialError || !connection || !encrypted)
    throw new Error("Messaging connection credentials were not found.");
  if (connection.status !== "connected") throw new Error("Messaging connection is not healthy.");
  const credential = await decryptCredential<T>({
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.auth_tag,
    keyVersion: encrypted.key_version,
  });
  return { connection, credential };
}
