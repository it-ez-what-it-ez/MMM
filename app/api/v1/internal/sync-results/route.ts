import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { paidAdapter } from "@/server/v1/adapters/paid";
import { loadProviderAccountContext } from "@/server/v1/provider-context";
import { measurementAdapter } from "@/server/v1/adapters/measurement";
import { organicAdapter } from "@/server/v1/adapters/organic";

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
  const { data: deployments, error } = await admin
    .from("campaign_deployments")
    .select(
      "id,workspace_id,campaign_id,provider_account_id,external_campaign_id,external_resource_ids,status",
    )
    .in("status", ["active", "completed"]);
  if (error) throw error;
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 86400000);
  const results: Array<{
    deploymentId: string;
    snapshots: number;
    error?: string;
  }> = [];
  for (const deployment of deployments ?? []) {
    try {
      const context = await loadProviderAccountContext(
        deployment.workspace_id,
        deployment.provider_account_id,
      );
      const snapshots = await paidAdapter(context.provider).metrics(
        context,
        {
          campaignId: deployment.external_campaign_id,
          resourceIds: (deployment.external_resource_ids ?? {}) as Record<
            string,
            string | string[]
          >,
          status: "paused",
        },
        { start: start.toISOString(), end: end.toISOString() },
      );
      for (const snapshot of snapshots)
        await admin
          .from("metric_snapshots")
          .upsert(
            {
              workspace_id: deployment.workspace_id,
              campaign_id: deployment.campaign_id,
              deployment_id: deployment.id,
              provider_key: snapshot.provider,
              source_model: snapshot.sourceModel,
              period_start: snapshot.periodStart,
              period_end: snapshot.periodEnd,
              currency: snapshot.currency ?? context.account.currency ?? null,
              metrics: snapshot.metrics,
              provider_report_id: `${deployment.id}:${snapshot.periodStart}:${snapshot.periodEnd}`,
            },
            {
              onConflict:
                "provider_key,provider_report_id,period_start,period_end",
            },
          );
      results.push({
        deploymentId: deployment.id,
        snapshots: snapshots.length,
      });
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Metric synchronization failed.";
      await admin
        .from("audit_events")
        .insert({
          workspace_id: deployment.workspace_id,
          action: "metrics.sync_failed",
          resource_type: "campaign_deployment",
          resource_id: deployment.id,
          metadata: { message },
        });
      results.push({
        deploymentId: deployment.id,
        snapshots: 0,
        error: message,
      });
    }
  }
  const { data: organicJobs } = await admin
    .from("publish_jobs")
    .select("id,workspace_id,schedule_id,external_post_id")
    .eq("status", "published")
    .not("external_post_id", "is", null);
  for (const job of organicJobs ?? []) {
    try {
      const { data: schedule } = await admin
        .from("schedules")
        .select("campaign_id,provider_account_id")
        .eq("id", job.schedule_id)
        .single();
      if (!schedule) throw new Error("Organic schedule is missing.");
      const context = await loadProviderAccountContext(
        job.workspace_id,
        schedule.provider_account_id,
      );
      const snapshots = await organicAdapter(context.provider).metrics(
        context,
        job.external_post_id!,
      );
      for (const snapshot of snapshots)
        await admin.from("metric_snapshots").upsert(
          {
            workspace_id: job.workspace_id,
            campaign_id: schedule.campaign_id,
            provider_key: snapshot.provider,
            source_model: snapshot.sourceModel,
            period_start: snapshot.periodStart,
            period_end: snapshot.periodEnd,
            currency: null,
            metrics: snapshot.metrics,
            provider_report_id: `organic:${job.id}:${snapshot.periodStart}:${snapshot.periodEnd}`,
          },
          {
            onConflict:
              "provider_key,provider_report_id,period_start,period_end",
          },
        );
      results.push({
        deploymentId: `organic:${job.id}`,
        snapshots: snapshots.length,
      });
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Organic metric synchronization failed.";
      await admin.from("audit_events").insert({
        workspace_id: job.workspace_id,
        action: "metrics.organic_sync_failed",
        resource_type: "publish_job",
        resource_id: job.id,
        metadata: { message },
      });
      results.push({
        deploymentId: `organic:${job.id}`,
        snapshots: 0,
        error: message,
      });
    }
  }
  const { data: measurementAccounts } = await admin
    .from("provider_accounts")
    .select("id,workspace_id,external_id")
    .eq("provider_key", "ga4")
    .eq("selected", true);
  for (const account of measurementAccounts ?? []) {
    try {
      const context = await loadProviderAccountContext(
        account.workspace_id,
        account.id,
      );
      const snapshots = await measurementAdapter("ga4").sync(context, {
        start: start.toISOString(),
        end: end.toISOString(),
      });
      for (const snapshot of snapshots)
        await admin.from("metric_snapshots").upsert(
          {
            workspace_id: account.workspace_id,
            provider_key: snapshot.provider,
            source_model: snapshot.sourceModel,
            period_start: snapshot.periodStart,
            period_end: snapshot.periodEnd,
            currency: snapshot.currency,
            metrics: snapshot.metrics,
            provider_report_id: `ga4:${account.external_id}:${snapshot.periodStart}:${snapshot.periodEnd}`,
          },
          { onConflict: "provider_key,provider_report_id,period_start,period_end" },
        );
      results.push({ deploymentId: `ga4:${account.id}`, snapshots: snapshots.length });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "GA4 synchronization failed.";
      await admin.from("audit_events").insert({
        workspace_id: account.workspace_id,
        action: "metrics.ga4_sync_failed",
        resource_type: "provider_account",
        resource_id: account.id,
        metadata: { message },
      });
      results.push({ deploymentId: `ga4:${account.id}`, snapshots: 0, error: message });
    }
  }
  return Response.json({ ok: true, results });
}
