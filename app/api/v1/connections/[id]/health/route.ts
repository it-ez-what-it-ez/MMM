import { z } from "zod";
import {
  authorizationErrorResponse,
  requireApiUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";
import { runConnectionHealth } from "@/server/v1/connection-health";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
    const connectionId = z.string().uuid().parse((await params).id);
    await requireWorkspaceRole(user.id, input.workspaceId, ["owner", "admin"]);
    const result = await runConnectionHealth({
      workspaceId: input.workspaceId,
      connectionId,
    });
    await getSupabaseAdmin().from("audit_events").insert({
      id: auditEventId,
      workspace_id: input.workspaceId,
      actor_id: user.id,
      action: "provider.health_checked",
      resource_type: "provider_connection",
      resource_id: connectionId,
      metadata: {
        operationId,
        provider: result.provider,
        healthy: result.healthy,
      },
    });
    return Response.json({
      ok: true,
      data: result,
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
