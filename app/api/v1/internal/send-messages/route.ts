import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAppOrigin } from "@/lib/supabase/config";
import { randomUrlSafe, sha256 } from "@/server/v1/credentials";
import { sendSendGridEmail, sendTwilioSms, type SendGridCredential, type TwilioCredential } from "@/server/v1/adapters/messaging";
import { loadMessagingCredential } from "@/server/v1/messaging-credentials";
import { deleteMessageQueueEntry, enqueueMessageBatch, readMessageQueue } from "@/server/v1/queues";

const CHUNK_SIZE = 25;

function authorized(request: Request) {
  const configured = process.env.GROWTHOS_WORKER_SECRET?.trim();
  const provided = request.headers.get("x-growthos-worker-secret");
  return Boolean(configured && provided && configured.length >= 32 && configured === provided);
}

function isQuietNow(timezone: string, start: string, end: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, hour: "2-digit", hour12: false }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "12");
  const startHour = Number(start.slice(0, 2));
  const endHour = Number(end.slice(0, 2));
  return startHour > endHour ? hour >= startHour || hour < endHour : hour >= startHour && hour < endHour;
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ ok: false }, { status: 401 });
  const admin = getSupabaseAdmin();
  const queue = await readMessageQueue(5);
  const results: Array<{ batchId: string; sent: number; failed: number; deferred: number; status: string }> = [];
  for (const queued of queue) {
    const batchId = queued.message.batchId;
    if (typeof batchId !== "string") {
      await deleteMessageQueueEntry(queued.msg_id);
      continue;
    }
    try {
      const { data: batch } = await admin.from("message_batches").select("id,workspace_id,campaign_id,content_version_id,provider_account_id,list_id,channel,status").eq("id", batchId).single();
      if (!batch || ["cancelled", "sent", "failed", "needs_attention"].includes(batch.status)) {
        await deleteMessageQueueEntry(queued.msg_id);
        continue;
      }
      const [{ data: version }, { data: account }, { data: settings }] = await Promise.all([
        admin.from("content_versions").select("copy,rendered_media_ids").eq("id", batch.content_version_id).eq("workspace_id", batch.workspace_id).single(),
        admin.from("provider_accounts").select("connection_id,provider_key").eq("id", batch.provider_account_id).eq("workspace_id", batch.workspace_id).single(),
        admin.from("messaging_settings").select("quiet_hours_start,quiet_hours_end").eq("workspace_id", batch.workspace_id).single(),
      ]);
      if (!version || !account || !settings) throw new Error("The approved message, provider account, or messaging settings no longer exists.");
      const copy = version.copy as Record<string, unknown>;
      const messaging = (copy.messaging ?? {}) as Record<string, unknown>;
      if (batch.status === "queued") {
        const { data: members } = await admin.from("contact_list_members").select("contact_id").eq("workspace_id", batch.workspace_id).eq("list_id", batch.list_id).limit(10000);
        const contactIds = (members ?? []).map((member) => member.contact_id);
        const [{ data: consents }, { data: suppressed }] = contactIds.length ? await Promise.all([
          admin.from("communication_consents").select("contact_id").eq("workspace_id", batch.workspace_id).eq("channel", batch.channel).eq("status", "subscribed").in("contact_id", contactIds),
          admin.from("suppressions").select("contact_id").eq("workspace_id", batch.workspace_id).eq("channel", batch.channel).in("contact_id", contactIds),
        ]) : [{ data: [] }, { data: [] }];
        const suppressedIds = new Set((suppressed ?? []).map((entry) => entry.contact_id));
        const rows = (consents ?? []).map((entry) => ({ id: crypto.randomUUID(), workspace_id: batch.workspace_id, batch_id: batch.id, contact_id: entry.contact_id, channel: batch.channel, status: suppressedIds.has(entry.contact_id) ? "suppressed" : "queued" }));
        if (rows.length) await admin.from("message_deliveries").upsert(rows, { onConflict: "batch_id,contact_id", ignoreDuplicates: true });
        await admin.from("message_batches").update({ status: "sending" }).eq("id", batch.id).eq("status", "queued");
      }
      const { data: deliveries } = await admin.from("message_deliveries").select("id,contact_id").eq("batch_id", batch.id).eq("status", "queued").limit(CHUNK_SIZE);
      if (!deliveries?.length) {
        await admin.from("message_batches").update({ status: "sent" }).eq("id", batch.id);
        await deleteMessageQueueEntry(queued.msg_id);
        results.push({ batchId, sent: 0, failed: 0, deferred: 0, status: "sent" });
        continue;
      }
      const { data: contacts } = await admin.from("contacts").select("id,email,phone_e164,timezone").eq("workspace_id", batch.workspace_id).in("id", deliveries.map((entry) => entry.contact_id));
      const contactById = new Map((contacts ?? []).map((contact) => [contact.id, contact]));
      const { credential } = await loadMessagingCredential<TwilioCredential | SendGridCredential>(account.connection_id);
      let inlineHero: { contentBase64: string; contentType: string; filename: string } | undefined;
      const mediaId = ((version.rendered_media_ids ?? []) as string[])[0];
      if (batch.channel === "email" && mediaId) {
        const { data: asset } = await admin.from("media_assets").select("storage_path,content_type,filename").eq("id", mediaId).eq("workspace_id", batch.workspace_id).single();
        if (asset) {
          const { data: blob } = await admin.storage.from("growthos-private-media").download(asset.storage_path);
          if (blob) inlineHero = { contentBase64: Buffer.from(await blob.arrayBuffer()).toString("base64"), contentType: asset.content_type, filename: asset.filename };
        }
      }
      let sent = 0;
      let failed = 0;
      let deferred = 0;
      for (const delivery of deliveries) {
        const contact = contactById.get(delivery.contact_id);
        if (!contact) continue;
        const timezone = contact.timezone || "America/Toronto";
        if (isQuietNow(timezone, String(settings.quiet_hours_start), String(settings.quiet_hours_end))) {
          deferred += 1;
          continue;
        }
        const claimed = await admin.from("message_deliveries").update({ status: "sending", updated_at: new Date().toISOString() }).eq("id", delivery.id).eq("status", "queued").select("id").maybeSingle();
        if (!claimed.data) continue;
        try {
          const statusCallbackUrl = `${getAppOrigin()}/api/v1/webhooks/twilio/${account.connection_id}?delivery=${delivery.id}`;
          let response: { providerMessageId: string; status: string };
          if (batch.channel === "sms") {
            if (!contact.phone_e164) throw new Error("The consented contact has no phone number.");
            response = await sendTwilioSms(credential as TwilioCredential, { deliveryId: delivery.id, channel: "sms", to: contact.phone_e164, body: String(copy.body ?? ""), statusCallbackUrl });
          } else {
            if (!contact.email) throw new Error("The consented contact has no email address.");
            const token = randomUrlSafe(36);
            await admin.schema("private").from("unsubscribe_tokens").insert({ token_hash: await sha256(token), workspace_id: batch.workspace_id, contact_id: contact.id, channel: "email", expires_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString() });
            const unsubscribeUrl = `${getAppOrigin()}/api/v1/unsubscribe?token=${encodeURIComponent(token)}`;
            response = await sendSendGridEmail(credential as SendGridCredential, { deliveryId: delivery.id, channel: "email", to: String(contact.email), body: String(copy.body ?? ""), subject: String(messaging.subject ?? copy.headline ?? ""), html: String(messaging.html ?? ""), statusCallbackUrl, unsubscribeUrl, inlineHero });
          }
          await admin.from("message_deliveries").update({ status: "accepted", provider_message_id: response.providerMessageId, accepted_at: new Date().toISOString(), last_event_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", delivery.id).eq("status", "sending");
          sent += 1;
        } catch (error) {
          await admin.from("message_deliveries").update({ status: "failed", error_code: "provider_rejected_or_ambiguous", error_message: error instanceof Error ? error.message : "Delivery failed.", last_event_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", delivery.id);
          failed += 1;
        }
      }
      await deleteMessageQueueEntry(queued.msg_id);
      const { count: remaining } = await admin.from("message_deliveries").select("id", { count: "exact", head: true }).eq("batch_id", batch.id).eq("status", "queued");
      if ((remaining ?? 0) > 0) await enqueueMessageBatch(batch.id, new Date(Date.now() + (deferred ? 60 * 60_000 : 1000)).toISOString());
      else await admin.from("message_batches").update({ status: "sent" }).eq("id", batch.id);
      results.push({ batchId, sent, failed, deferred, status: (remaining ?? 0) > 0 ? "sending" : "sent" });
    } catch (error) {
      await admin.from("message_batches").update({ status: "needs_attention" }).eq("id", batchId);
      await deleteMessageQueueEntry(queued.msg_id);
      results.push({ batchId, sent: 0, failed: 1, deferred: 0, status: "needs_attention" });
      await admin.from("audit_events").insert({ workspace_id: null, actor_id: null, action: "messaging.worker_failed", resource_type: "message_batch", resource_id: batchId, metadata: { message: error instanceof Error ? error.message : "Worker failed" } });
    }
  }
  return Response.json({ ok: true, processed: results.length, results });
}
