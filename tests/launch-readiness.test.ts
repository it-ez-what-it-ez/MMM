import { describe, expect, it } from "vitest";
import {
  configurationReadinessChecks,
  summarizeLaunchReadiness,
} from "@/lib/v1/launch-readiness";

describe("production launch readiness", () => {
  it("does not treat a configured runtime as fully launched without owner evidence", () => {
    const checks = configurationReadinessChecks({
      APP_ENV: "production",
      APP_ORIGIN: "https://app.example.com",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public",
      SUPABASE_SECRET_KEY: "secret",
      GROWTHOS_WORKER_SECRET: "x".repeat(32),
      OPENAI_API_KEY: "configured",
      SENTRY_DSN: "configured",
      NEXT_PUBLIC_SENTRY_DSN: "configured",
      SENTRY_INSTRUMENTATION_VERIFIED: "true",
    });
    const summary = summarizeLaunchReadiness(checks);
    expect(summary.blocked).toBe(0);
    expect(summary.manual).toBeGreaterThan(0);
    expect(summary.ready).toBe(false);
  });

  it("blocks localhost and missing trusted runtime secrets", () => {
    const checks = configurationReadinessChecks({
      APP_ENV: "production",
      APP_ORIGIN: "http://localhost:3000",
    });
    expect(
      checks.find((check) => check.id === "production-origin")?.status,
    ).toBe("blocked");
    expect(
      checks.find((check) => check.id === "supabase-runtime")?.status,
    ).toBe("blocked");
  });
});
