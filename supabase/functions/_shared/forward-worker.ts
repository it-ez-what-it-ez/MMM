declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

export function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1)
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  return mismatch === 0;
}

export function serveWorker(path: string) {
  Deno.serve(async (request) => {
    const startedAt = Date.now();
    if (request.method !== "POST")
      return Response.json(
        { ok: false, message: "Method not allowed." },
        { status: 405 },
      );
    const origin = Deno.env.get("GROWTHOS_APP_ORIGIN")?.replace(/\/$/, "");
    const secret = Deno.env.get("GROWTHOS_WORKER_SECRET");
    const cronSecret = Deno.env.get("GROWTHOS_CRON_SECRET");
    const providedCronSecret = request.headers.get("x-growthos-cron-secret");
    const siteBypassToken = Deno.env.get("GROWTHOS_SITE_BYPASS_TOKEN")?.trim();
    if (
      !origin ||
      !secret ||
      secret.length < 32 ||
      !cronSecret ||
      cronSecret.length < 32
    )
      return Response.json(
        { ok: false, message: "Worker environment is not configured." },
        { status: 503 },
      );
    if (
      !providedCronSecret ||
      !constantTimeEqual(cronSecret, providedCronSecret)
    )
      return Response.json(
        { ok: false, message: "Unauthorized." },
        { status: 401 },
      );
    const headers: Record<string, string> = {
      "x-growthos-worker-secret": secret,
    };
    if (siteBypassToken)
      headers["OAI-Sites-Authorization"] = `Bearer ${siteBypassToken}`;
    const response = await fetch(`${origin}${path}`, {
      method: "POST",
      headers,
    });
    if (response.ok) {
      const workerName = path.split("/").filter(Boolean).at(-1);
      if (!workerName)
        return Response.json(
          { ok: false, message: "Worker name could not be resolved." },
          { status: 500 },
        );
      const heartbeat = await fetch(
        `${origin}/api/v1/internal/worker-heartbeat`,
        {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({
            workerName,
            statusCode: response.status,
            durationMs: Date.now() - startedAt,
          }),
        },
      );
      if (!heartbeat.ok)
        return Response.json(
          { ok: false, message: "Worker heartbeat could not be recorded." },
          { status: 502 },
        );
    }
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type":
          response.headers.get("content-type") ?? "application/json",
      },
    });
  });
}
