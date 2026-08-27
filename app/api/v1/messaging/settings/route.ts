import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authorizationErrorResponse, requireApiUser, requireWorkspaceRole } from "@/server/v1/auth";

const schema = z.object({
  workspaceId: z.string().uuid(),
  legalBusinessName: z.string().trim().min(1).max(160),
  physicalAddress: z.string().trim().min(5).max(500),
  defaultCountry: z.enum(["US", "CA"]),
  quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

export async function POST(request: Request) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    const input = schema.parse(await request.json());
    await requireWorkspaceRole(user.id, input.workspaceId, ["owner", "admin", "marketer"]);
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("messaging_settings").upsert({ workspace_id: input.workspaceId, legal_business_name: input.legalBusinessName, physical_address: input.physicalAddress, default_country: input.defaultCountry, quiet_hours_start: input.quietHoursStart, quiet_hours_end: input.quietHoursEnd, updated_at: new Date().toISOString() });
    if (error) throw error;
    await admin.from("audit_events").insert({ id: auditEventId, workspace_id: input.workspaceId, actor_id: user.id, action: "messaging.settings_updated", resource_type: "workspace", resource_id: input.workspaceId, metadata: { operationId } });
    return Response.json({ ok: true, data: { workspaceId: input.workspaceId }, operationId, auditEventId });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ ok: false, errors: error.issues.map((issue) => ({ code: "validation", field: issue.path.join("."), message: issue.message, recoverable: true })), operationId, auditEventId }, { status: 400 });
    return authorizationErrorResponse(error);
  }
}
