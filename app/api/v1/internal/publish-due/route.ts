import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ChannelKey } from "@/lib/v1/domain";
import { organicAdapter } from "@/server/v1/adapters/organic";
import { createProviderMediaUrls } from "@/server/v1/provider-media";
import { loadProviderAccountContext } from "@/server/v1/provider-context";
import {
  deleteOrganicQueueMessage,
  enqueueOrganicPublish,
  readOrganicPublishQueue,
} from "@/server/v1/queues";

function authorized(request: Request) {
  const configured = process.env.GROWTHOS_WORKER_SECRET?.trim();
  const provided = request.headers.get("x-growthos-worker-secret");
  return Boolean(
    configured &&
    provided &&
    configured.length >= 32 &&
    configured === provided,
  );
}

export async function POST(request: Request) {
  if (!authorized(request))
    return Response.json({ ok: false }, { status: 401 });
  const admin = getSupabaseAdmin();
  const messages = await readOrganicPublishQueue(20);
  if (!messages.length)
    return Response.json({ ok: true, processed: 0, results: [] });
  const messageIdsByJob = new Map<string, number[]>();
  for (const message of messages) {
    const jobId = message.message.publishJobId;
    if (typeof jobId !== "string") {
      await deleteOrganicQueueMessage(message.msg_id);
      continue;
    }
    messageIdsByJob.set(jobId, [
      ...(messageIdsByJob.get(jobId) ?? []),
      message.msg_id,
    ]);
  }
  const jobIds = [...messageIdsByJob.keys()];
  if (!jobIds.length)
    return Response.json({ ok: true, processed: 0, results: [] });
  const { data: jobs, error } = await admin
    .from("publish_jobs")
    .select(
      "id,workspace_id,schedule_id,idempotency_key,status,attempt_count,max_attempts",
    )
    .in("id", jobIds)
    .in("status", ["queued", "retrying"])
    .order("run_after")
    .limit(20);
  if (error) throw error;
  const loadedJobIds = new Set((jobs ?? []).map((job) => job.id));
  for (const [jobId, messageIds] of messageIdsByJob)
    if (!loadedJobIds.has(jobId))
      for (const messageId of messageIds)
        await deleteOrganicQueueMessage(messageId);
  const results: Array<{ jobId: string; status: string; error?: string }> = [];
  for (const job of jobs ?? []) {
    const queueMessageIds = messageIdsByJob.get(job.id) ?? [];
    const claimed = await admin
      .from("publish_jobs")
      .update({ status: "running", attempt_count: job.attempt_count + 1 })
      .eq("id", job.id)
      .eq("status", job.status)
      .select("id")
      .maybeSingle();
    if (!claimed.data) {
      for (const messageId of queueMessageIds)
        await deleteOrganicQueueMessage(messageId);
      continue;
    }
    try {
      const { data: schedule } = await admin
        .from("schedules")
        .select("id,campaign_id,content_version_id,provider_account_id,status")
        .eq("id", job.schedule_id)
        .single();
      if (!schedule || schedule.status === "cancelled") {
        await admin
          .from("publish_jobs")
          .update({ status: "cancelled" })
          .eq("id", job.id);
        results.push({ jobId: job.id, status: "cancelled" });
        for (const messageId of queueMessageIds)
          await deleteOrganicQueueMessage(messageId);
        continue;
      }
      const [{ data: version }, { data: item }] = await Promise.all([
        admin
          .from("content_versions")
          .select("id,content_item_id,copy,rendered_media_ids,destination_url")
          .eq("id", schedule.content_version_id)
          .single(),
        admin
          .from("content_items")
          .select("id,channel_key,status")
          .eq("current_version_id", schedule.content_version_id)
          .single(),
      ]);
      if (!version || !item)
        throw new Error("Approved content version is missing.");
      if (item.status !== "approved" && item.status !== "scheduled")
        throw new Error("Content is no longer approved for publishing.");
      const context = await loadProviderAccountContext(
        job.workspace_id,
        schedule.provider_account_id,
      );
      const mediaIds = (version.rendered_media_ids ?? []) as string[];
      const mediaUrls = await createProviderMediaUrls(
        job.workspace_id,
        mediaIds,
        context.provider,
      );
      const copy = version.copy as {
        headline?: string;
        body?: string;
        cta?: string;
        carouselSlides?: Array<{
          headline: string;
          body: string;
          mediaId?: string | null;
        }>;
        publishingOptions?: {
          privacy?: string | null;
          commentsEnabled?: boolean;
        } | null;
      };
      const publishInput = {
        channel: item.channel_key as ChannelKey,
        title: copy.headline,
        text: copy.body ?? copy.headline ?? "",
        destinationUrl: version.destination_url ?? undefined,
        mediaUrls: mediaIds.map((id) => mediaUrls.get(id)!).filter(Boolean),
        carousel: (copy.carouselSlides ?? []).map((slide) => ({
          text: `${slide.headline}\n${slide.body}`,
          mediaUrl: slide.mediaId ? (mediaUrls.get(slide.mediaId) ?? "") : "",
        })),
        privacy:
          context.provider === "tiktok_organic"
            ? (copy.publishingOptions?.privacy ?? undefined)
            : undefined,
        commentsEnabled: copy.publishingOptions?.commentsEnabled ?? true,
        idempotencyKey: job.idempotency_key,
      };
      const adapter = organicAdapter(context.provider);
      const validation = await adapter.validate(context, publishInput);
      if (!validation.valid)
        throw new Error(
          validation.errors.map((entry) => entry.message).join(" "),
        );
      const published = await adapter.publish(context, publishInput);
      await admin
        .from("publish_jobs")
        .update({
          status: published.status === "published" ? "published" : "running",
          external_post_id: published.externalPostId,
          provider_request_id: published.providerRequestId ?? null,
          last_error: null,
        })
        .eq("id", job.id);
      await admin
        .from("schedules")
        .update({
          status: published.status === "published" ? "published" : "publishing",
        })
        .eq("id", schedule.id);
      await admin
        .from("content_items")
        .update({
          status: published.status === "published" ? "published" : "scheduled",
        })
        .eq("id", item.id);
      await admin
        .from("audit_events")
        .insert({
          workspace_id: job.workspace_id,
          action: "organic.publish_submitted",
          resource_type: "publish_job",
          resource_id: job.id,
          metadata: {
            provider: context.provider,
            externalPostId: published.externalPostId,
            providerRequestId: published.providerRequestId,
          },
        });
      results.push({ jobId: job.id, status: published.status });
      for (const messageId of queueMessageIds)
        await deleteOrganicQueueMessage(messageId);
    } catch (cause) {
      const attempt = job.attempt_count + 1;
      const terminal = attempt >= job.max_attempts;
      const message =
        cause instanceof Error ? cause.message : "Publishing failed.";
      const delayMinutes = Math.min(360, 2 ** attempt);
      await admin
        .from("publish_jobs")
        .update({
          status: terminal ? "dead_letter" : "retrying",
          run_after: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
          last_error: { message },
        })
        .eq("id", job.id);
      await admin
        .from("schedules")
        .update({ status: terminal ? "failed" : "queued" })
        .eq("id", job.schedule_id);
      await admin
        .from("audit_events")
        .insert({
          workspace_id: job.workspace_id,
          action: terminal
            ? "organic.publish_dead_letter"
            : "organic.publish_retry",
          resource_type: "publish_job",
          resource_id: job.id,
          metadata: { attempt, message },
        });
      if (!terminal) {
        try {
          await enqueueOrganicPublish(
            job.id,
            new Date(Date.now() + delayMinutes * 60_000).toISOString(),
          );
          for (const messageId of queueMessageIds)
            await deleteOrganicQueueMessage(messageId);
        } catch {
          // Keep the current queue message. It becomes visible after the
          // visibility timeout, so a queue outage cannot lose the job.
        }
      } else
        for (const messageId of queueMessageIds)
          await deleteOrganicQueueMessage(messageId);
      results.push({
        jobId: job.id,
        status: terminal ? "dead_letter" : "retrying",
        error: message,
      });
    }
  }
  return Response.json({ ok: true, processed: results.length, results });
}
