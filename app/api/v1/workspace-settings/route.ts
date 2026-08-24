import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  authorizationErrorResponse,
  requireApiUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";

const schema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  timezone: z.string().min(1).max(80),
  currency: z.enum(["USD", "CAD"]),
  approvalMode: z.enum(["solo", "team"]),
  monthlySpendCeilingCents: z.number().int().positive().nullable(),
});
export async function PATCH(request: Request) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    const input = schema.parse(await request.json());
    await requireWorkspaceRole(user.id, input.workspaceId, ["owner", "admin"]);
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("workspaces")
      .update({
        name: input.name,
        timezone: input.timezone,
        currency: input.currency,
        approval_mode: input.approvalMode,
        monthly_spend_ceiling_cents: input.monthlySpendCeilingCents,
      })
      .eq("id", input.workspaceId);
    if (error) throw error;
    await admin
      .from("audit_events")
      .insert({
        id: auditEventId,
        workspace_id: input.workspaceId,
        actor_id: user.id,
        action: "workspace.settings_updated",
        resource_type: "workspace",
        resource_id: input.workspaceId,
        metadata: {
          operationId,
          approvalMode: input.approvalMode,
          currency: input.currency,
          monthlySpendCeilingCents: input.monthlySpendCeilingCents,
        },
      });
    return Response.json({
      ok: true,
      data: { workspaceId: input.workspaceId },
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
