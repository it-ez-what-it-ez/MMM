import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { moderateImage } from "@/server/v1/ai-provider";
import {
  authorizationErrorResponse,
  requireApiUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";

const schema = z.object({ workspaceId: z.string().uuid() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    const input = schema.parse(await request.json());
    const { id } = await params;
    await requireWorkspaceRole(user.id, input.workspaceId, [
      "owner",
      "admin",
      "marketer",
    ]);
    const admin = getSupabaseAdmin();
    const { data: asset } = await admin
      .from("media_assets")
      .select("storage_path,content_type,byte_size")
      .eq("id", id)
      .eq("workspace_id", input.workspaceId)
      .single();
    if (!asset)
      return Response.json(
        {
          ok: false,
          errors: [
            {
              code: "not_found",
              message: "Media asset not found.",
              recoverable: false,
            },
          ],
          operationId,
          auditEventId,
        },
        { status: 404 },
      );
    if (asset.byte_size > 20 * 1024 * 1024)
      throw new Error("Media exceeds the moderation size limit.");
    const { data: blob, error } = await admin.storage
      .from("growthos-private-media")
      .download(asset.storage_path);
    if (error || !blob)
      throw error ?? new Error("Media could not be downloaded.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const moderation = await moderateImage(
      `data:${asset.content_type};base64,${btoa(binary)}`,
    );
    const status = moderation.flagged ? "rejected" : "accepted";
    await admin
      .from("media_assets")
      .update({ moderation_status: status })
      .eq("id", id);
    await admin
      .from("audit_events")
      .insert({
        id: auditEventId,
        workspace_id: input.workspaceId,
        actor_id: user.id,
        action: `media.${status}`,
        resource_type: "media_asset",
        resource_id: id,
        metadata: { operationId, categories: moderation.categories },
      });
    return Response.json({
      ok: true,
      data: { status },
      operationId,
      auditEventId,
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          ok: false,
          errors: error.issues.map((issue) => ({
            code: "validation",
            field: issue.path.join("."),
            message: issue.message,
            recoverable: true,
          })),
          operationId,
          auditEventId,
        },
        { status: 400 },
      );
    return authorizationErrorResponse(error);
  }
}
