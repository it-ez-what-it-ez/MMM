export type LaunchReadinessStatus = "pass" | "blocked" | "manual";

export type LaunchReadinessCheck = {
  id: string;
  label: string;
  detail: string;
  status: LaunchReadinessStatus;
  owner: "growthos" | "founder" | "provider";
};

function asserted(values: Record<string, string | undefined>, key: string) {
  return values[key]?.trim().toLowerCase() === "true";
}

export function configurationReadinessChecks(
  values: Record<string, string | undefined>,
): LaunchReadinessCheck[] {
  const origin =
    values.APP_ORIGIN?.trim() ||
    values.NEXT_PUBLIC_APP_ORIGIN?.trim() ||
    values.APP_BASE_URL?.trim() ||
    "";
  let secureProductionOrigin = false;
  try {
    secureProductionOrigin =
      values.APP_ENV === "production" && new URL(origin).protocol === "https:";
  } catch {
    secureProductionOrigin = false;
  }
  const checks: LaunchReadinessCheck[] = [
    {
      id: "production-origin",
      label: "Production callback origin",
      detail: secureProductionOrigin
        ? "OAuth, authentication, webhook, and unsubscribe links use a public HTTPS origin."
        : "Set APP_ENV=production and a public HTTPS APP_ORIGIN/NEXT_PUBLIC_APP_ORIGIN.",
      status: secureProductionOrigin ? "pass" : "blocked",
      owner: "growthos",
    },
    {
      id: "supabase-runtime",
      label: "Supabase application credentials",
      detail:
        values.NEXT_PUBLIC_SUPABASE_URL &&
        values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
        values.SUPABASE_SECRET_KEY
          ? "Browser and trusted server roles are configured."
          : "Configure the Supabase URL, publishable key, and server-only secret key.",
      status:
        values.NEXT_PUBLIC_SUPABASE_URL &&
        values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
        values.SUPABASE_SECRET_KEY
          ? "pass"
          : "blocked",
      owner: "growthos",
    },
    {
      id: "worker-secret",
      label: "Durable worker authentication",
      detail:
        (values.GROWTHOS_WORKER_SECRET?.trim().length ?? 0) >= 32
          ? "The application has a strong worker authentication secret."
          : "Set a random GROWTHOS_WORKER_SECRET of at least 32 characters in both runtimes.",
      status:
        (values.GROWTHOS_WORKER_SECRET?.trim().length ?? 0) >= 32
          ? "pass"
          : "blocked",
      owner: "growthos",
    },
    {
      id: "openai",
      label: "AI campaign generation",
      detail: values.OPENAI_API_KEY
        ? "The real OpenAI provider is configured; no mock fallback is used."
        : "Add an OpenAI API key before promising AI campaign generation.",
      status: values.OPENAI_API_KEY ? "pass" : "blocked",
      owner: "founder",
    },
    {
      id: "monitoring",
      label: "Production error monitoring",
      detail:
        values.SENTRY_DSN &&
        values.NEXT_PUBLIC_SENTRY_DSN &&
        asserted(values, "SENTRY_INSTRUMENTATION_VERIFIED")
          ? "Client and server monitoring delivered a verified production test event."
          : values.SENTRY_DSN || values.NEXT_PUBLIC_SENTRY_DSN
            ? "The Sentry SDK is configured, but both runtimes and a production test event must still be verified."
            : "Create and configure Sentry before onboarding a client.",
      status:
        values.SENTRY_DSN &&
        values.NEXT_PUBLIC_SENTRY_DSN &&
        asserted(values, "SENTRY_INSTRUMENTATION_VERIFIED")
          ? "pass"
          : values.SENTRY_DSN || values.NEXT_PUBLIC_SENTRY_DSN
            ? "manual"
            : "blocked",
      owner: "founder",
    },
  ];

  const manualEvidence: Array<{
    id: string;
    label: string;
    key: string;
    pending: string;
    complete: string;
  }> = [
    {
      id: "auth-urls",
      label: "Supabase Auth production URLs",
      key: "SUPABASE_AUTH_URLS_VERIFIED",
      pending:
        "Set the Supabase Site URL and redirect allowlist to the final production origin, then record verification.",
      complete:
        "The Supabase Site URL and redirect allowlist were manually verified.",
    },
    {
      id: "custom-smtp",
      label: "Authentication email delivery",
      key: "SUPABASE_CUSTOM_SMTP_VERIFIED",
      pending:
        "Configure a domain-authenticated custom SMTP provider and test signup, magic link, and invitation delivery.",
      complete:
        "Custom SMTP and all authentication email journeys were manually verified.",
    },
    {
      id: "backups",
      label: "Database backups and recovery",
      key: "SUPABASE_BACKUPS_VERIFIED",
      pending:
        "Upgrade the production project, configure backups, and perform a documented restore test.",
      complete:
        "Production backups and a restore procedure were manually verified.",
    },
    {
      id: "legal",
      label: "Customer-facing legal and support",
      key: "LEGAL_DOCUMENTS_APPROVED",
      pending:
        "Have counsel approve Terms, Privacy, data deletion, consent language, and support contacts.",
      complete:
        "Terms, Privacy, data deletion, consent language, and support contacts were approved.",
    },
  ];
  for (const evidence of manualEvidence) {
    const complete = asserted(values, evidence.key);
    checks.push({
      id: evidence.id,
      label: evidence.label,
      detail: complete ? evidence.complete : evidence.pending,
      status: complete ? "pass" : "manual",
      owner: "founder",
    });
  }
  return checks;
}

export function summarizeLaunchReadiness(checks: LaunchReadinessCheck[]) {
  return {
    passed: checks.filter((check) => check.status === "pass").length,
    blocked: checks.filter((check) => check.status === "blocked").length,
    manual: checks.filter((check) => check.status === "manual").length,
    ready: checks.every((check) => check.status === "pass"),
  };
}
