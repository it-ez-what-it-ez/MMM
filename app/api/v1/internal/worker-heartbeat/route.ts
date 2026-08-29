import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const workerNames = [
  "publish-due",
  "send-messages",
  "sync-results",
  "refresh-tokens",
  "reconcile-organic",
] as const;

const inputSchema = z.object({
  workerName: z.enum(workerNames),
  statusCode: z.number().int().min(200).max(299),
  durationMs: z.number().int().min(0).max(120_000),
});

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
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin().from("worker_heartbeats").upsert(
    {
      worker_name: parsed.data.workerName,
      last_succeeded_at: now,
      last_status_code: parsed.data.statusCode,
      last_duration_ms: parsed.data.durationMs,
      updated_at: now,
    },
    { onConflict: "worker_name" },
  );
  if (error) throw error;
  return Response.json({ ok: true });
}
