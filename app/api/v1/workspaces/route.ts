import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { authorizationErrorResponse, requireApiUser } from "@/server/v1/auth";

const workspaceInput = z.object({
  name: z.string().trim().min(2).max(120),
  businessType: z.enum(["ecommerce", "service"]),
  timezone: z.string().min(1).max(80),
  currency: z.enum(["USD", "CAD"]),
  websiteUrl: z.union([z.string().url(), z.literal("")]).optional(),
});

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "workspace"
  );
}

export async function POST(request: Request) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    await requireApiUser(request);
    const input = workspaceInput.parse(await request.json());
    const slug = `${slugify(input.name)}-${crypto.randomUUID().slice(0, 6)}`;
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("The authenticated workspace session is missing.");
    const { url, key } = getPublicSupabaseConfig();
    const authenticated = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    // This database function creates the workspace, owner membership, brand
    // profile, and audit event in one transaction using auth.uid().
    const { data: workspaceId, error: workspaceError } = await authenticated.rpc(
      "create_workspace",
      {
        workspace_name: input.name,
        workspace_slug: slug,
        workspace_business_type: input.businessType,
        workspace_timezone: input.timezone,
        workspace_currency: input.currency,
        workspace_website_url: input.websiteUrl || null,
        workspace_audit_event_id: auditEventId,
        workspace_operation_id: operationId,
      },
    );
    if (workspaceError || !workspaceId)
      throw workspaceError ?? new Error("Workspace creation returned no ID.");
    return Response.json({
      ok: true,
      data: { id: workspaceId, name: input.name, slug },
      operationId,
      auditEventId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
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
    }
    return authorizationErrorResponse(error);
  }
}
