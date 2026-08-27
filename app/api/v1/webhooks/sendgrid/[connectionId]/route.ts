import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { validateSendGridSignature, type SendGridCredential } from "@/server/v1/adapters/messaging";
import { loadMessagingCredential } from "@/server/v1/messaging-credentials";

type SendGridEvent = Record<string, unknown> & { event?: string; sg_event_id?: string; timestamp?: number; growthos_delivery_id?: string; email?: string };

export async function POST(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  try {
    const { connection, credential } = await loadMessagingCredential<SendGridCredential>(connectionId);
    const rawBody = await request.text();
    const signature = request.headers.get("x-twilio-email-event-webhook-signature") ?? "";
    const timestamp = request.headers.get("x-twilio-email-event-webhook-timestamp") ?? "";
    if (!validateSendGridSignature({ publicKey: credential.eventWebhookPublicKey, timestamp, rawBody, signature }))
      return new Response("Invalid signature", { status: 401 });
    const events = JSON.parse(rawBody) as SendGridEvent[];
    const admin = getSupabaseAdmin();
    for (const event of events) {
      const deliveryId = event.growthos_delivery_id;
      const eventType = String(event.event ?? "unknown");
      const providerEventId = String(event.sg_event_id ?? `${deliveryId}:${eventType}:${event.timestamp}`);
      const occurredAt = new Date(Number(event.timestamp ?? Date.now() / 1000) * 1000).toISOString();
      if (deliveryId) {
        const mapped = ({ processed: "accepted", delivered: "delivered", open: "opened", click: "clicked", deferred: "deferred", bounce: "bounced", dropped: "failed", spamreport: "unsubscribed", spam_report: "unsubscribed", unsubscribe: "unsubscribed", group_unsubscribe: "unsubscribed" } as Record<string, string>)[eventType];
        if (mapped) {
          const update: Record<string, unknown> = { status: mapped, last_event_at: occurredAt, updated_at: new Date().toISOString() };
          if (mapped === "delivered") update.delivered_at = occurredAt;
          await admin.from("message_deliveries").update(update).eq("id", deliveryId).eq("workspace_id", connection.workspace_id);
        }
      }
      await admin.from("message_events").upsert({ workspace_id: connection.workspace_id, delivery_id: deliveryId ?? null, provider_key: "sendgrid_email", provider_event_id: providerEventId, event_type: eventType, occurred_at: occurredAt, payload: event }, { onConflict: "provider_key,provider_event_id", ignoreDuplicates: true });
      if (["bounce", "dropped", "spamreport", "spam_report", "unsubscribe", "group_unsubscribe"].includes(eventType) && event.email) {
        const { data: contact } = await admin.from("contacts").select("id").eq("workspace_id", connection.workspace_id).ilike("email", event.email).maybeSingle();
        if (contact) {
          const reason = eventType === "bounce" || eventType === "dropped" ? "hard_bounce" : eventType.includes("spam") ? "spam_report" : "provider_unsubscribe";
          await Promise.all([
            admin.from("communication_consents").upsert({ workspace_id: connection.workspace_id, contact_id: contact.id, channel: "email", status: "unsubscribed", legal_basis: "express", source: `sendgrid_${eventType}`, proof: { providerEventId }, obtained_at: occurredAt, updated_at: occurredAt }, { onConflict: "workspace_id,contact_id,channel" }),
            admin.from("suppressions").upsert({ workspace_id: connection.workspace_id, contact_id: contact.id, channel: "email", reason, provider_key: "sendgrid_email", provider_event_id: providerEventId }, { onConflict: "workspace_id,contact_id,channel" }),
            admin.from("consent_events").insert({ workspace_id: connection.workspace_id, contact_id: contact.id, channel: "email", event_type: eventType.includes("unsubscribe") ? "unsubscribed" : "provider_suppressed", source: `sendgrid_${eventType}`, proof: { providerEventId }, occurred_at: occurredAt }),
          ]);
        }
      }
    }
    return new Response("", { status: 204 });
  } catch {
    return new Response("Webhook unavailable", { status: 503 });
  }
}
