import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authorizationErrorResponse, requireApiUser, requireWorkspaceRole } from "@/server/v1/auth";

const rowSchema = z.object({
  email: z.string().email().nullable().optional(),
  phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/).nullable().optional(),
  firstName: z.string().max(100).nullable().optional(),
  lastName: z.string().max(100).nullable().optional(),
  country: z.enum(["US", "CA"]).nullable().optional(),
  timezone: z.string().max(100).nullable().optional(),
  attributes: z.record(z.unknown()).default({}),
  explicitConsent: z.literal(true),
  consentChannels: z.array(z.enum(["email", "sms"])).min(1).max(2),
  consentSource: z.string().min(1).max(200),
  consentTimestamp: z.string().datetime(),
  consentProof: z.record(z.unknown()).default({}),
}).superRefine((row, context) => {
  if (!row.email && !row.phone) context.addIssue({ code: "custom", message: "An email address or E.164 phone number is required." });
  if (row.consentChannels.includes("email") && !row.email) context.addIssue({ code: "custom", path: ["email"], message: "Email consent requires an email address." });
  if (row.consentChannels.includes("sms") && !row.phone) context.addIssue({ code: "custom", path: ["phone"], message: "SMS consent requires an E.164 phone number." });
  if (new Date(row.consentTimestamp).getTime() > Date.now()) context.addIssue({ code: "custom", path: ["consentTimestamp"], message: "Consent cannot be dated in the future." });
});

const schema = z.object({
  workspaceId: z.string().uuid(),
  listName: z.string().trim().min(1).max(120),
  contacts: z.array(rowSchema).min(1).max(10000),
  certification: z.literal(true),
});

export async function POST(request: Request) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    const input = schema.parse(await request.json());
    await requireWorkspaceRole(user.id, input.workspaceId, ["owner", "admin", "marketer"]);
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.schema("private").rpc("import_marketing_contacts", {
      target_workspace_id: input.workspaceId,
      target_user_id: user.id,
      list_name: input.listName,
      input_rows: input.contacts,
    });
    if (error) throw error;
    await admin.from("audit_events").insert({ id: auditEventId, workspace_id: input.workspaceId, actor_id: user.id, action: "contacts.imported", resource_type: "contact_list", resource_id: String((data as { listId?: string } | null)?.listId ?? ""), metadata: { operationId, importedCount: (data as { importedCount?: number } | null)?.importedCount, certifiedConsent: true } });
    return Response.json({ ok: true, data, operationId, auditEventId });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ ok: false, errors: error.issues.map((issue) => ({ code: "validation", field: issue.path.join("."), message: issue.message, recoverable: true })), operationId, auditEventId }, { status: 400 });
    return authorizationErrorResponse(error);
  }
}
