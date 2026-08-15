import { NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { database, initializeDatabase } from "@/db/runtime";

export async function POST(request: Request) {
  await initializeDatabase();
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a file to upload." }, { status: 400 });
  if (file.size > 10_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) return NextResponse.json({ ok: false, error: "Use a PNG, JPEG, or WebP image under 10 MB." }, { status: 400 });
  const assetId = `media-${crypto.randomUUID().slice(0, 8)}`; const objectKey = `northstar/${assetId}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
  const bucket = (env as unknown as { MEDIA?: { put(key: string, value: ArrayBuffer, options?: unknown): Promise<unknown> } }).MEDIA;
  if (!bucket) return NextResponse.json({ ok: false, error: "Media storage is unavailable." }, { status: 503 });
  await bucket.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  await database().prepare("INSERT INTO media_assets (id, workspace_id, name, kind, object_key, tags_json, approved_for_ai, created_at) VALUES (?, 'ws-northstar', ?, 'IMAGE', ?, '[\"uploaded\"]', 1, ?)").bind(assetId, file.name, objectKey, new Date().toISOString()).run();
  return NextResponse.json({ ok: true, assetId });
}
