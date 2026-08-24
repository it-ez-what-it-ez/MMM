import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sha256 } from "@/server/v1/credentials";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = request.nextUrl.searchParams.get("token");
  const { id } = await params;
  if (!token || token.length < 32)
    return new Response("Not found", { status: 404 });
  const admin = getSupabaseAdmin();
  const hash = await sha256(token);
  const { data: delivery } = await admin
    .schema("private")
    .from("media_delivery_tokens")
    .select("token_hash,media_id,expires_at,request_count,max_requests")
    .eq("token_hash", hash)
    .eq("media_id", id)
    .maybeSingle();
  if (
    !delivery ||
    new Date(delivery.expires_at).getTime() < Date.now() ||
    delivery.request_count >= delivery.max_requests
  )
    return new Response("Link expired", { status: 410 });
  const { data: claimed } = await admin
    .schema("private")
    .from("media_delivery_tokens")
    .update({
      request_count: delivery.request_count + 1,
      last_requested_at: new Date().toISOString(),
    })
    .eq("token_hash", hash)
    .eq("request_count", delivery.request_count)
    .select("media_id")
    .maybeSingle();
  if (!claimed) return new Response("Retry", { status: 409 });
  const { data: asset } = await admin
    .from("media_assets")
    .select("storage_path,content_type,filename")
    .eq("id", id)
    .single();
  if (!asset) return new Response("Not found", { status: 404 });
  const { data: blob, error } = await admin.storage
    .from("growthos-private-media")
    .download(asset.storage_path);
  if (error || !blob) return new Response("Unavailable", { status: 503 });
  return new Response(blob, {
    headers: {
      "Content-Type": asset.content_type,
      "Content-Disposition": `inline; filename="${asset.filename.replace(/["\r\n]/g, "")}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
