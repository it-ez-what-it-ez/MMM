import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { organicAdapter } from "@/server/v1/adapters/organic";
import { loadProviderAccountContext } from "@/server/v1/provider-context";

function authorized(request: Request) {
  const configured = process.env.GROWTHOS_WORKER_SECRET?.trim();
  const provided = request.headers.get("x-growthos-worker-secret");
  return Boolean(configured && provided && configured.length >= 32 && configured === provided);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ ok: false }, { status: 401 });
  const admin = getSupabaseAdmin();
  const { data: jobs, error } = await admin
    .from("publish_jobs")
    .select("id,workspace_id,schedule_id,external_post_id")
    .eq("status", "running")
    .not("external_post_id", "is", null)
    .limit(50);
  if (error) throw error;
  const results: Array<{ jobId: string; status: string; error?: string }> = [];
  for (const job of jobs ?? []) {
    try {
      const { data: schedule } = await admin
        .from("schedules")
        .select("id,provider_account_id")
        .eq("id", job.schedule_id)
        .single();
      if (!schedule) throw new Error("Organic schedule is missing.");
      const context = await loadProviderAccountContext(
        job.workspace_id,
        schedule.provider_account_id,
      );
      const status = await organicAdapter(context.provider).status(
        context,
        job.external_post_id!,
      );
      const data = (status.data as Record<string, unknown> | undefined) ?? status;
      const providerStatus = String(data.status ?? "published").toUpperCase();
      const failed = providerStatus.includes("FAIL") || providerStatus.includes("ERROR");
      const complete =
        providerStatus.includes("COMPLETE") ||
        providerStatus.includes("PUBLISHED") ||
        providerStatus === "FINISHED" ||
        context.provider !== "tiktok_organic";
      if (failed) {
        await admin.from("publish_jobs").update({
          status: "dead_letter",
          last_error: { code: "provider_publish_failed", providerStatus, status: data },
        }).eq("id", job.id);
        await admin.from("schedules").update({ status: "failed" }).eq("id", schedule.id);
        results.push({ jobId: job.id, status: "dead_letter", error: providerStatus });
      } else if (complete) {
        const publicIds = data.publicaly_available_post_id as string[] | undefined;
        await admin.from("publish_jobs").update({
          status: "published",
          external_post_id: publicIds?.[0] ?? job.external_post_id,
          last_error: null,
        }).eq("id", job.id);
        await admin.from("schedules").update({ status: "published" }).eq("id", schedule.id);
        results.push({ jobId: job.id, status: "published" });
      } else results.push({ jobId: job.id, status: "processing" });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Organic reconciliation failed.";
      await admin.from("audit_events").insert({
        workspace_id: job.workspace_id,
        action: "organic.reconciliation_failed",
        resource_type: "publish_job",
        resource_id: job.id,
        metadata: { message },
      });
      results.push({ jobId: job.id, status: "error", error: message });
    }
  }
  return Response.json({ ok: true, processed: results.length, results });
}
