import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  authorizationErrorResponse,
  requireApiUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";

const schema = z.object({
  workspaceId: z.string().uuid(),
  brandSummary: z.string().max(1000),
  colors: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).max(8),
  products: z
    .array(
      z.object({
        name: z.string().min(1).max(160),
        description: z.string().max(2000),
        landingUrl: z.string().url(),
        kind: z.enum(["ecommerce", "service"]),
      }),
    )
    .max(30),
});
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
    const { data: record } = await admin
      .from("website_imports")
      .select("id,status")
      .eq("id", id)
      .eq("workspace_id", input.workspaceId)
      .single();
    if (!record || record.status !== "ready")
      return Response.json(
        {
          ok: false,
          errors: [
            {
              code: "import_not_ready",
              message:
                "Website suggestions are unavailable or already confirmed.",
              recoverable: true,
            },
          ],
          operationId,
          auditEventId,
        },
        { status: 409 },
      );
    await admin
      .from("brand_profiles")
      .update({
        summary: input.brandSummary,
        colors: input.colors,
        confirmed_at: new Date().toISOString(),
      })
      .eq("workspace_id", input.workspaceId);
    if (input.products.length)
      await admin
        .from("products_services")
        .insert(
          input.products.map((product) => ({
            workspace_id: input.workspaceId,
            kind: product.kind,
            name: product.name,
            description: product.description,
            landing_url: product.landingUrl,
          })),
        );
    await admin
      .from("website_imports")
      .update({ status: "confirmed" })
      .eq("id", id);
    await admin
      .from("audit_events")
      .insert({
        id: auditEventId,
        workspace_id: input.workspaceId,
        actor_id: user.id,
        action: "website_import.confirmed",
        resource_type: "website_import",
        resource_id: id,
        metadata: { operationId, productsAccepted: input.products.length },
      });
    return Response.json({
      ok: true,
      data: { importId: id, productsCreated: input.products.length },
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
