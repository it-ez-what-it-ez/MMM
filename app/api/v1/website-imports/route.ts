import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  authorizationErrorResponse,
  requireApiUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";
import { importWebsite } from "@/server/v1/website-import";

const schema = z.object({
  workspaceId: z.string().uuid(),
  url: z.string().url().max(2048),
});
export async function POST(request: Request) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  let importId: string | null = null;
  try {
    const user = await requireApiUser(request);
    const input = schema.parse(await request.json());
    await requireWorkspaceRole(user.id, input.workspaceId, [
      "owner",
      "admin",
      "marketer",
    ]);
    const admin = getSupabaseAdmin();
    importId = crypto.randomUUID();
    await admin
      .from("website_imports")
      .insert({
        id: importId,
        workspace_id: input.workspaceId,
        requested_url: input.url,
        status: "crawling",
        created_by: user.id,
      });
    const suggestions = await importWebsite(input.url);
    await admin
      .from("website_imports")
      .update({
        status: "ready",
        suggestions,
        crawled_urls: suggestions.pages.map((page) => page.url),
        completed_at: new Date().toISOString(),
      })
      .eq("id", importId);
    await admin
      .from("audit_events")
      .insert({
        id: auditEventId,
        workspace_id: input.workspaceId,
        actor_id: user.id,
        action: "website_import.ready",
        resource_type: "website_import",
        resource_id: importId,
        metadata: {
          operationId,
          crawledUrls: suggestions.pages.map((page) => page.url),
        },
      });
    return Response.json({
      ok: true,
      data: { importId, suggestions },
      operationId,
      auditEventId,
    });
  } catch (error) {
    if (importId) {
      const admin = getSupabaseAdmin();
      await admin
        .from("website_imports")
        .update({
          status: "failed",
          error_code: "import_failed",
          error_message:
            error instanceof Error ? error.message : "Website import failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", importId);
    }
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
