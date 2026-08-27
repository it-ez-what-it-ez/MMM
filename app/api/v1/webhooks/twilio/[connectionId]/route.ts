import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAppOrigin } from "@/lib/supabase/config";
import { isSmsOptOut } from "@/lib/v1/messaging";
import { validateTwilioSignature, type TwilioCredential } from "@/server/v1/adapters/messaging";
import { loadMessagingCredential } from "@/server/v1/messaging-credentials";

export async function POST(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  try {
    const { connection, credential } = await loadMessagingCredential<TwilioCredential>(connectionId);
    const raw = await request.text();
    const form = new URLSearchParams(raw);
    const signature = request.headers.get("x-twilio-signature") ?? "";
    const inbound = new URL(request.url);
    const publicUrl = `${getAppOrigin()}${inbound.pathname}${inbound.search}`;
    if (!validateTwilioSignature({ authToken: credential.authToken, url: publicUrl, params: form, signature }))
      return new Response("Invalid signature", { status: 401 });

    const admin = getSupabaseAdmin();
    const messageSid = form.get("MessageSid") ?? form.get("SmsSid") ?? "";
    const status = form.get("MessageStatus") ?? form.get("SmsStatus");
    const deliveryId = inbound.searchParams.get("delivery");
    const errorCode = form.get("ErrorCode");
    if (status && (deliveryId || messageSid)) {
      const mapped = ({ queued: "accepted", sent: "accepted", delivered: "delivered", undelivered: "failed", failed: "failed" } as Record<string, string>)[status] ?? "accepted";
      const update: Record<string, unknown> = { status: mapped, provider_message_id: messageSid || undefined, error_code: errorCode, last_event_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      if (mapped === "delivered") update.delivered_at = new Date().toISOString();
      let query = admin.from("message_deliveries").update(update).eq("workspace_id", connection.workspace_id);
      query = deliveryId ? query.eq("id", deliveryId) : query.eq("provider_message_id", messageSid);
      await query;
      if (messageSid)
        await admin.from("message_events").upsert({ workspace_id: connection.workspace_id, delivery_id: deliveryId, provider_key: "twilio_messaging", provider_event_id: `${messageSid}:${status}`, event_type: status, occurred_at: new Date().toISOString(), payload: Object.fromEntries(form.entries()) }, { onConflict: "provider_key,provider_event_id", ignoreDuplicates: true });
    }

    const body = form.get("Body") ?? "";
    const from = form.get("From") ?? "";
    if (from && (isSmsOptOut(body) || form.get("OptOutType") === "STOP")) {
      const { data: contact } = await admin.from("contacts").select("id").eq("workspace_id", connection.workspace_id).eq("phone_e164", from).maybeSingle();
      if (contact) {
        const occurredAt = new Date().toISOString();
        await Promise.all([
          admin.from("communication_consents").upsert({ workspace_id: connection.workspace_id, contact_id: contact.id, channel: "sms", status: "unsubscribed", legal_basis: "express", source: "twilio_inbound_opt_out", proof: { messageSid, keyword: body.trim().toUpperCase() }, obtained_at: occurredAt, updated_at: occurredAt }, { onConflict: "workspace_id,contact_id,channel" }),
          admin.from("suppressions").upsert({ workspace_id: connection.workspace_id, contact_id: contact.id, channel: "sms", reason: "user_opt_out", provider_key: "twilio_messaging", provider_event_id: messageSid }, { onConflict: "workspace_id,contact_id,channel" }),
          admin.from("consent_events").insert({ workspace_id: connection.workspace_id, contact_id: contact.id, channel: "sms", event_type: "unsubscribed", source: "twilio_inbound_opt_out", proof: { messageSid, keyword: body.trim().toUpperCase() }, occurred_at: occurredAt }),
        ]);
      }
    }
    return new Response("", { status: 204 });
  } catch {
    return new Response("Webhook unavailable", { status: 503 });
  }
}
