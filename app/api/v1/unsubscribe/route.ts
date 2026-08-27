import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sha256 } from "@/server/v1/credentials";

const schema = z.object({ token: z.string().min(32).max(200) });

export async function POST(request: Request) {
  try {
    const queryToken = new URL(request.url).searchParams.get("token");
    const contentType = request.headers.get("content-type") ?? "";
    const token = queryToken
      ? schema.parse({ token: queryToken }).token
      : contentType.includes("application/json")
        ? schema.parse(await request.json()).token
        : schema.parse({ token: new URLSearchParams(await request.text()).get("token") }).token;
    const admin = getSupabaseAdmin();
    const tokenHash = await sha256(token);
    const { data: record } = await admin.schema("private").from("unsubscribe_tokens").select("workspace_id,contact_id,channel,expires_at,used_at").eq("token_hash", tokenHash).maybeSingle();
    if (!record || record.used_at || new Date(record.expires_at).getTime() < Date.now())
      return Response.json({ ok: false, message: "This unsubscribe link is invalid or expired." }, { status: 410 });
    const occurredAt = new Date().toISOString();
    await Promise.all([
      admin.from("communication_consents").upsert({ workspace_id: record.workspace_id, contact_id: record.contact_id, channel: record.channel, status: "unsubscribed", legal_basis: "express", source: "growthos_unsubscribe", proof: { tokenHash }, obtained_at: occurredAt, updated_at: occurredAt }, { onConflict: "workspace_id,contact_id,channel" }),
      admin.from("suppressions").upsert({ workspace_id: record.workspace_id, contact_id: record.contact_id, channel: record.channel, reason: "user_opt_out", provider_key: "sendgrid_email" }, { onConflict: "workspace_id,contact_id,channel" }),
      admin.from("consent_events").insert({ workspace_id: record.workspace_id, contact_id: record.contact_id, channel: record.channel, event_type: "unsubscribed", source: "growthos_unsubscribe", proof: { tokenHash }, occurred_at: occurredAt }),
      admin.schema("private").from("unsubscribe_tokens").update({ used_at: occurredAt }).eq("token_hash", tokenHash),
    ]);
    return Response.json({ ok: true, message: "You have been unsubscribed." });
  } catch {
    return Response.json({ ok: false, message: "This unsubscribe request is invalid." }, { status: 400 });
  }
}
