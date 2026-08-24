import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getAppOrigin } from "@/lib/supabase/config";
import { randomUrlSafe, sha256 } from "@/server/v1/credentials";
import {
  authorizationErrorResponse,
  requireApiUser,
  requireWorkspaceRole,
} from "@/server/v1/auth";

const schema = z.object({
  workspaceId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["admin", "marketer", "reviewer", "viewer"]),
});
export async function POST(request: Request) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    const input = schema.parse(await request.json());
    await requireWorkspaceRole(user.id, input.workspaceId, ["owner", "admin"]);
    const admin = getSupabaseAdmin();
    const token = randomUrlSafe(32);
    const invitationId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const { error: recordError } = await admin
      .from("invitations")
      .insert({
        id: invitationId,
        workspace_id: input.workspaceId,
        email: input.email,
        role: input.role,
        invited_by: user.id,
        token_hash: await sha256(token),
        expires_at: expiresAt,
      });
    if (recordError) throw recordError;
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      input.email,
      {
        redirectTo: `${getAppOrigin()}/auth/callback`,
        data: {
          workspace_id: input.workspaceId,
          workspace_role: input.role,
          invitation_id: invitationId,
        },
      },
    );
    if (inviteError) {
      // Admin invitations cannot re-invite an existing Auth user. Send that
      // user a production magic link instead; claim_pending_invitations adds
      // the membership after authentication by verified email.
      const { error: magicLinkError } = await admin.auth.signInWithOtp({
        email: input.email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${getAppOrigin()}/auth/callback`,
        },
      });
      if (magicLinkError) {
        await admin.from("invitations").delete().eq("id", invitationId);
        throw inviteError;
      }
    }
    await admin
      .from("audit_events")
      .insert({
        id: auditEventId,
        workspace_id: input.workspaceId,
        actor_id: user.id,
        action: "team.invited",
        resource_type: "invitation",
        resource_id: invitationId,
        metadata: { operationId, email: input.email, role: input.role },
      });
    return Response.json({
      ok: true,
      data: { invitationId, email: input.email, role: input.role, expiresAt },
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
