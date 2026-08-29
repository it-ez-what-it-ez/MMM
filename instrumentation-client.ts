import * as Sentry from "@sentry/browser";

import { redactMonitoringEvent } from "@/lib/monitoring/redact";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV || "production",
    release: process.env.NEXT_PUBLIC_GROWTHOS_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || 0.05,
    ),
    beforeSend: redactMonitoringEvent,
  });
}
