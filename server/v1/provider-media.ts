import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAppOrigin } from "@/lib/supabase/config";
import type { ProviderKey } from "@/lib/v1/domain";
import { randomUrlSafe, sha256 } from "./credentials";

export async function createProviderMediaUrls(
  workspaceId: string,
  mediaIds: string[],
  provider: ProviderKey,
  lifetimeMinutes = 1440,
) {
  const admin = getSupabaseAdmin();
  const uniqueIds = [...new Set(mediaIds)];
  if (!uniqueIds.length) return new Map<string, string>();
  const { data: assets, error } = await admin
    .from("media_assets")
    .select("id")
    .eq("workspace_id", workspaceId)
    .in("id", uniqueIds)
    .eq("moderation_status", "accepted");
  if (error) throw error;
  const allowed = new Set((assets ?? []).map((asset) => asset.id));
  const missing = uniqueIds.filter((id) => !allowed.has(id));
  if (missing.length)
    throw new Error(
      "One or more creative images have not passed media moderation.",
    );
  const urls = new Map<string, string>();
  for (const mediaId of uniqueIds) {
    const token = randomUrlSafe(36);
    const { error: insertError } = await admin
      .schema("private")
      .from("media_delivery_tokens")
      .insert({
        token_hash: await sha256(token),
        workspace_id: workspaceId,
        media_id: mediaId,
        provider_key: provider,
        expires_at: new Date(
          Date.now() + lifetimeMinutes * 60_000,
        ).toISOString(),
      });
    if (insertError) throw insertError;
    urls.set(
      mediaId,
      `${getAppOrigin()}/api/v1/provider-media/${mediaId}?token=${encodeURIComponent(token)}`,
    );
  }
  return urls;
}
