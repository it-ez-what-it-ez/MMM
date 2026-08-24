import { createClient, type User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";

export type WorkspaceRole =
  "owner" | "admin" | "marketer" | "reviewer" | "viewer";

export class ApiAuthorizationError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireApiUser(request: Request): Promise<User> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;
  if (!token) throw new ApiAuthorizationError(401, "Authentication required.");
  const { url, key } = getPublicSupabaseConfig();
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user)
    throw new ApiAuthorizationError(401, "Your session is invalid or expired.");
  return data.user;
}

export async function requireRouteUser(): Promise<User> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user)
    throw new ApiAuthorizationError(401, "Authentication required.");
  return data.user;
}

export async function requireWorkspaceRole(
  userId: string,
  workspaceId: string,
  roles: WorkspaceRole[],
) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error)
    throw new Error(`Unable to verify workspace membership: ${error.message}`);
  if (!data || !roles.includes(data.role as WorkspaceRole))
    throw new ApiAuthorizationError(
      403,
      "You do not have permission for this action.",
    );
  return data.role as WorkspaceRole;
}

export function authorizationErrorResponse(error: unknown) {
  if (error instanceof ApiAuthorizationError) {
    return Response.json(
      {
        ok: false,
        errors: [
          { code: "authorization", message: error.message, recoverable: true },
        ],
        operationId: crypto.randomUUID(),
        auditEventId: crypto.randomUUID(),
      },
      { status: error.status },
    );
  }
  const message =
    error instanceof Error ? error.message : "Unexpected server error.";
  return Response.json(
    {
      ok: false,
      errors: [{ code: "server_error", message, recoverable: false }],
      operationId: crypto.randomUUID(),
      auditEventId: crypto.randomUUID(),
    },
    { status: 500 },
  );
}
