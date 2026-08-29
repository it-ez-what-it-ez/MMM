import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { PROVIDER_KEYS } from "@/lib/v1/domain";
import {
  configurationReadinessChecks,
  summarizeLaunchReadiness,
  type LaunchReadinessCheck,
} from "@/lib/v1/launch-readiness";
import { providerCredentialEncryptionReady } from "./credentials";
import { getProviderReadiness } from "./provider-platform";

const workerFunctions = [
  "publish-due",
  "send-messages",
  "sync-results",
  "refresh-tokens",
  "reconcile-organic",
] as const;

async function edgeFunctionIsDeployed(name: string) {
  const { url, key } = getPublicSupabaseConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${url}/functions/v1/${name}`, {
      method: "GET",
      headers: { apikey: key },
      cache: "no-store",
      signal: controller.signal,
    });
    return response.status !== 404;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getProductionReadiness() {
  const checks = configurationReadinessChecks(process.env);
  checks.push({
    id: "credential-encryption",
    label: "Provider credential encryption",
    detail: providerCredentialEncryptionReady()
      ? "Provider tokens and API keys can be encrypted with a valid AES-256 key."
      : "Configure a valid 32-byte PROVIDER_TOKEN_ENCRYPTION_KEY.",
    status: providerCredentialEncryptionReady() ? "pass" : "blocked",
    owner: "growthos",
  });

  try {
    const admin = getSupabaseAdmin();
    const [{ error: databaseError }, { data: bucket, error: bucketError }] =
      await Promise.all([
        admin.from("workspaces").select("id", { head: true, count: "exact" }),
        admin.storage.getBucket("growthos-private-media"),
      ]);
    checks.push({
      id: "database-schema",
      label: "Production database schema",
      detail: databaseError
        ? "The application cannot verify the production schema."
        : "The production schema and trusted server access are reachable.",
      status: databaseError ? "blocked" : "pass",
      owner: "growthos",
    });
    checks.push({
      id: "private-media",
      label: "Private media storage",
      detail:
        !bucketError && bucket && bucket.public === false
          ? "The private media bucket exists and is not public."
          : "Create or repair the private growthos-private-media bucket and policies.",
      status:
        !bucketError && bucket && bucket.public === false ? "pass" : "blocked",
      owner: "growthos",
    });
  } catch {
    checks.push(
      {
        id: "database-schema",
        label: "Production database schema",
        detail:
          "The application cannot reach the production database with its trusted server role.",
        status: "blocked",
        owner: "growthos",
      },
      {
        id: "private-media",
        label: "Private media storage",
        detail: "Private media storage could not be verified.",
        status: "blocked",
        owner: "growthos",
      },
    );
  }

  const deployed = await Promise.all(
    workerFunctions.map(edgeFunctionIsDeployed),
  );
  const missingWorkers = workerFunctions.filter((_, index) => !deployed[index]);
  checks.push({
    id: "durable-workers",
    label: "Scheduled publishing and reporting workers",
    detail: missingWorkers.length
      ? `Deploy and schedule: ${missingWorkers.join(", ")}.`
      : "All five worker entry points are deployed. Cron schedules and worker secrets still require a live smoke test.",
    status: missingWorkers.length ? "blocked" : "pass",
    owner: "growthos",
  });

  const providerReadiness = await Promise.all(
    PROVIDER_KEYS.map(getProviderReadiness),
  );
  const readyProviders = providerReadiness
    .filter((provider) => provider.ready)
    .map((provider) => provider.provider);
  const requiredBetaProviders = [
    "meta_business",
    "google_ads",
    "twilio_messaging",
    "sendgrid_email",
  ];
  const missingRequiredProviders = requiredBetaProviders.filter(
    (provider) =>
      !readyProviders.includes(provider as (typeof readyProviders)[number]),
  );
  const providerCheck: LaunchReadinessCheck = {
    id: "launch-providers",
    label: "First-client delivery channels",
    detail: missingRequiredProviders.length
      ? `No customer access yet for: ${missingRequiredProviders.join(", ")}. Each needs credentials, approval, scopes, a fresh smoke test, and its kill switch disabled.`
      : "Meta, Google Ads, Twilio, and SendGrid passed every production readiness gate.",
    status: missingRequiredProviders.length ? "blocked" : "pass",
    owner: "provider",
  };
  checks.push(providerCheck);

  return {
    generatedAt: new Date().toISOString(),
    summary: summarizeLaunchReadiness(checks),
    checks,
    readyProviders,
  };
}
