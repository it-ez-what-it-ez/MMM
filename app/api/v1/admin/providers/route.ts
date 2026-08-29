import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PROVIDER_KEYS } from "@/lib/v1/domain";
import {
  ApiAuthorizationError,
  authorizationErrorResponse,
  requireApiUser,
} from "@/server/v1/auth";
import { getProviderReadiness } from "@/server/v1/provider-platform";
import { providerRequiredScopes } from "@/lib/v1/provider-readiness";
import type { OAuthProviderKey } from "@/lib/v1/domain";

function assertPlatformAdmin(email?: string) {
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!email || !allowed.includes(email.toLowerCase()))
    throw new ApiAuthorizationError(403, "Platform administrator access required.");
}
export async function GET(request: Request) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    assertPlatformAdmin(user.email);
    const readiness = await Promise.all(
      PROVIDER_KEYS.map((provider) => getProviderReadiness(provider)),
    );
    const environment = process.env.APP_ENV?.trim() || "development";
    const admin = getSupabaseAdmin();
    const { data: records, error } = await admin
      .from("platform_provider_readiness")
      .select("*")
      .eq("environment", environment);
    if (error) throw error;
    const data = readiness.map((item) => {
      const record = records?.find(
        (candidate) => candidate.provider_key === item.provider,
      );
      return {
        ...item,
        environment,
        applicationId: record?.application_id ?? null,
        requiredScopes: record?.required_scopes?.length
          ? record.required_scopes
          : item.provider in providerRequiredScopes
            ? providerRequiredScopes[item.provider as OAuthProviderKey]
            : [],
        grantedScopes: record?.granted_scopes ?? [],
        apiVersion: record?.api_version ?? null,
        webhookVerified: record?.webhook_verified ?? false,
        lastSmokeTestAt: record?.last_smoke_test_at ?? null,
        lastSmokeTestStatus: record?.last_smoke_test_status ?? null,
        tokenRefreshHealthy: record?.token_refresh_healthy ?? false,
        webhookHealthy: record?.webhook_healthy ?? false,
      };
    });
    return Response.json({ ok: true, data, operationId, auditEventId });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
const patchSchema = z.object({
  provider: z.enum(PROVIDER_KEYS),
  environment: z.enum(["development", "staging", "production"]),
  applicationId: z.string().max(200).nullable(),
  configured: z.boolean(),
  reviewStatus: z.enum([
    "not_started",
    "submitted",
    "sandbox",
    "approved",
    "rejected",
  ]),
  requiredScopes: z.array(z.string()),
  grantedScopes: z.array(z.string()),
  apiVersion: z.string().max(40).nullable(),
  redirectVerified: z.boolean(),
  webhookVerified: z.boolean(),
  lastSmokeTestStatus: z.enum(["passed", "failed"]).nullable(),
  tokenRefreshHealthy: z.boolean(),
  webhookHealthy: z.boolean(),
  killSwitch: z.boolean(),
});
export async function PATCH(request: Request) {
  const operationId = crypto.randomUUID();
  const auditEventId = crypto.randomUUID();
  try {
    const user = await requireApiUser(request);
    assertPlatformAdmin(user.email);
    const input = patchSchema.parse(await request.json());
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("platform_provider_readiness")
      .upsert({
        provider_key: input.provider,
        environment: input.environment,
        application_id: input.applicationId,
        configured: input.configured,
        review_status: input.reviewStatus,
        required_scopes: input.requiredScopes,
        granted_scopes: input.grantedScopes,
        api_version: input.apiVersion,
        redirect_verified: input.redirectVerified,
        webhook_verified: input.webhookVerified,
        last_smoke_test_status: input.lastSmokeTestStatus,
        last_smoke_test_at: input.lastSmokeTestStatus
          ? new Date().toISOString()
          : null,
        token_refresh_healthy: input.tokenRefreshHealthy,
        webhook_healthy: input.webhookHealthy,
        kill_switch: input.killSwitch,
      });
    if (error) throw error;
    await admin
      .from("audit_events")
      .insert({
        id: auditEventId,
        actor_id: user.id,
        action: "platform.provider_readiness_updated",
        resource_type: "provider",
        resource_id: input.provider,
        metadata: {
          operationId,
          environment: input.environment,
          reviewStatus: input.reviewStatus,
          killSwitch: input.killSwitch,
        },
      });
    return Response.json({ ok: true, data: input, operationId, auditEventId });
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
