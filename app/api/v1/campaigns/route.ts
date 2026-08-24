import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { campaignPlanSchema } from "@/lib/v1/domain";
import { getTemplate } from "@/lib/v1/templates";
import {
  authorizationErrorResponse,
  requireApiUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";

const inputSchema = z.object({
  workspaceId: z.string().uuid(),
  plan: campaignPlanSchema,
});

export async function POST(request: Request) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    const input = inputSchema.parse(await request.json());
    await requireWorkspaceRole(user.id, input.workspaceId, [
      "owner",
      "admin",
      "marketer",
    ]);
    const selectedTemplate = input.plan.template
      ? getTemplate(input.plan.template.id, input.plan.template.version)
      : null;
    if (input.plan.template && !selectedTemplate) {
      return Response.json(
        {
          ok: false,
          errors: [
            {
              code: "template_missing",
              field: "plan.template",
              message: "This template version is no longer available.",
              recoverable: true,
            },
          ],
          operationId,
          auditEventId,
        },
        { status: 409 },
      );
    }

    const admin = getSupabaseAdmin();
    if (selectedTemplate) {
      const { error: templateError } = await admin
        .from("campaign_templates")
        .upsert({
          id: selectedTemplate.id,
          version: selectedTemplate.version,
          name: selectedTemplate.name,
          business_types: selectedTemplate.businessTypes,
          goals: selectedTemplate.goals,
          channels: selectedTemplate.channels,
          manifest: selectedTemplate,
          active: true,
        });
      if (templateError) throw templateError;
    }
    const campaignId = crypto.randomUUID();
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("The authenticated campaign session is missing.");
    const { url, key } = getPublicSupabaseConfig();
    const authenticated = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { error: campaignError } = await authenticated.rpc(
      "create_campaign_bundle",
      {
        target_workspace_id: input.workspaceId,
        campaign_id: campaignId,
        campaign_plan: input.plan,
        campaign_source: input.plan.template ? "template" : "ai",
        campaign_template_id: input.plan.template?.id ?? null,
        campaign_template_version: input.plan.template?.version ?? null,
        operation_id: operationId,
        audit_event_id: auditEventId,
      },
    );
    if (campaignError) throw campaignError;
    return Response.json({
      ok: true,
      data: { campaignId },
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
