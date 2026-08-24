import { PROVIDER_KEYS } from "@/lib/v1/domain";
import { authorizationErrorResponse, requireApiUser } from "@/server/v1/auth";
import { getProviderReadiness } from "@/server/v1/provider-platform";

export async function GET(request: Request) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    await requireApiUser(request);
    const readiness = await Promise.all(
      PROVIDER_KEYS.map((provider) => getProviderReadiness(provider)),
    );
    return Response.json({
      ok: true,
      data: readiness,
      operationId,
      auditEventId,
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
