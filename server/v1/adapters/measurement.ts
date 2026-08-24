import "server-only";

import type { MetricSnapshot, ProviderKey } from "@/lib/v1/domain";
import type {
  MeasurementAdapter,
  ProviderAccountContext,
} from "./contracts";

async function ga4Json(
  context: ProviderAccountContext,
  path: string,
  init: RequestInit = {},
) {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${context.accessToken}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(25_000),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = payload.error as Record<string, unknown> | undefined;
    throw new Error(
      typeof error?.message === "string"
        ? error.message
        : `GA4 returned ${response.status}.`,
    );
  }
  return payload;
}

export class GA4MeasurementAdapter implements MeasurementAdapter {
  readonly provider = "ga4" as const;

  async discover(context: ProviderAccountContext) {
    return [
      await ga4Json(
        context,
        `/properties/${context.account.externalId}/metadata`,
      ),
    ];
  }

  async sync(
    context: ProviderAccountContext,
    range: { start: string; end: string },
  ): Promise<MetricSnapshot[]> {
    const report = await ga4Json(
      context,
      `/properties/${context.account.externalId}:runReport`,
      {
        method: "POST",
        body: JSON.stringify({
          dateRanges: [
            {
              startDate: range.start.slice(0, 10),
              endDate: range.end.slice(0, 10),
            },
          ],
          metrics: [
            { name: "sessions" },
            { name: "keyEvents" },
            { name: "totalRevenue" },
          ],
          limit: "1",
        }),
      },
    );
    const row = (
      (report.rows as Array<Record<string, unknown>> | undefined) ?? []
    )[0];
    const values =
      (row?.metricValues as Array<{ value?: string }> | undefined) ?? [];
    return [
      {
        provider: "ga4",
        sourceModel: "GA4 property reporting; separate from ad-provider attribution",
        periodStart: range.start,
        periodEnd: range.end,
        currency:
          context.account.currency === "USD" || context.account.currency === "CAD"
            ? context.account.currency
            : null,
        metrics: {
          sessions: Number(values[0]?.value ?? 0),
          keyEvents: Number(values[1]?.value ?? 0),
          totalRevenue: Number(values[2]?.value ?? 0),
        },
      },
    ];
  }
}

export function measurementAdapter(provider: ProviderKey): MeasurementAdapter {
  if (provider === "ga4") return new GA4MeasurementAdapter();
  throw new Error(`${provider} is not a V1 measurement provider.`);
}
