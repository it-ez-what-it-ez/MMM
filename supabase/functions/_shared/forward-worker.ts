declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

export function serveWorker(path: string) {
  Deno.serve(async (request) => {
    if (request.method !== "POST")
      return Response.json({ ok: false, message: "Method not allowed." }, { status: 405 });
    const origin = Deno.env.get("GROWTHOS_APP_ORIGIN")?.replace(/\/$/, "");
    const secret = Deno.env.get("GROWTHOS_WORKER_SECRET");
    if (!origin || !secret || secret.length < 32)
      return Response.json(
        { ok: false, message: "Worker environment is not configured." },
        { status: 503 },
      );
    const response = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: { "x-growthos-worker-secret": secret },
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  });
}
