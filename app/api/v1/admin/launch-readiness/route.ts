import {
  ApiAuthorizationError,
  authorizationErrorResponse,
  requireApiUser,
} from "@/server/v1/auth";
import { getProductionReadiness } from "@/server/v1/production-readiness";

function assertPlatformAdmin(email?: string) {
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!email || !allowed.includes(email.toLowerCase()))
    throw new ApiAuthorizationError(
      403,
      "Platform administrator access required.",
    );
}

export async function GET(request: Request) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    assertPlatformAdmin(user.email);
    return Response.json({
      ok: true,
      data: await getProductionReadiness(),
      operationId,
      auditEventId,
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
