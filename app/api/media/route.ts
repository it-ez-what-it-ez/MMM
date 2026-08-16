import { NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { database, initializeDatabase } from "@/db/runtime";

type MediaBucket = {
  put(key: string, value: ArrayBuffer, options?: unknown): Promise<unknown>;
  get(key: string): Promise<{
    body: ReadableStream;
    httpMetadata?: { contentType?: string };
  } | null>;
};

function mediaBucket() {
  return (env as unknown as { MEDIA?: MediaBucket }).MEDIA;
}

export async function GET(request: Request) {
  await initializeDatabase();
  const assetId = new URL(request.url).searchParams.get("id");
  if (!assetId || !/^media-[a-zA-Z0-9-]+$/.test(assetId))
    return new Response("Media not found", { status: 404 });

  const asset = await database()
    .prepare(
      "SELECT object_key FROM media_assets WHERE id = ? AND workspace_id = 'ws-northstar'",
    )
    .bind(assetId)
    .first<{ object_key?: string | null }>();
  if (!asset?.object_key)
    return new Response("Media preview unavailable", { status: 404 });

  const stored = await mediaBucket()?.get(asset.object_key);
  if (!stored) return new Response("Media not found", { status: 404 });

  return new Response(stored.body, {
    headers: {
      "Content-Type": stored.httpMetadata?.contentType ?? "image/jpeg",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  await initializeDatabase();
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json(
      { ok: false, error: "Choose a file to upload." },
      { status: 400 },
    );
  if (
    file.size > 10_000_000 ||
    !["image/png", "image/jpeg", "image/webp"].includes(file.type)
  )
    return NextResponse.json(
      { ok: false, error: "Use a PNG, JPEG, or WebP image under 10 MB." },
      { status: 400 },
    );

  const assetId = `media-${crypto.randomUUID().slice(0, 8)}`;
  const objectKey = `northstar/${assetId}-${file.name.replace(
    /[^a-zA-Z0-9._-]/g,
    "-",
  )}`;
  const bucket = mediaBucket();
  if (!bucket)
    return NextResponse.json(
      { ok: false, error: "Media storage is unavailable." },
      { status: 503 },
    );

  await bucket.put(objectKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });
  await database()
    .prepare(
      "INSERT INTO media_assets (id, workspace_id, name, kind, object_key, tags_json, approved_for_ai, created_at) VALUES (?, 'ws-northstar', ?, 'IMAGE', ?, '[\"uploaded\",\"product\"]', 1, ?)",
    )
    .bind(assetId, file.name, objectKey, new Date().toISOString())
    .run();
  return NextResponse.json({ ok: true, assetId });
}
