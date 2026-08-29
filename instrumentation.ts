import * as Sentry from "@sentry/cloudflare";

import { redactMonitoringEvent } from "@/lib/monitoring/redact";

function options() {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return null;
  return {
    dsn,
    environment: process.env.APP_ENV || "development",
    release: process.env.GROWTHOS_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.05),
    beforeSend: redactMonitoringEvent,
  };
}

export function register() {
  // The Cloudflare SDK is initialized inside the request wrapper because it
  // needs request-scoped execution context to flush events reliably.
}

export async function onRequestError(
  error: unknown,
  request: Readonly<{ path: string; method: string }>,
  context: Readonly<{ routeType: string; routePath: string }>,
) {
  const sentryOptions = options();
  if (!sentryOptions) return;
  const origin = process.env.APP_ORIGIN || "https://growthos.invalid";
  const safePath = request.path.startsWith("/") ? request.path : "/";
  await Sentry.wrapRequestHandler(
    {
      options: sentryOptions,
      request: new Request(new URL(safePath.split("?")[0], origin), {
        method: request.method,
      }),
      context: undefined,
    },
    async () => {
      Sentry.setTags({
        request_method: request.method,
        route_type: context.routeType,
        route_path: context.routePath,
      });
      throw error;
    },
  ).catch(() => undefined);
}
