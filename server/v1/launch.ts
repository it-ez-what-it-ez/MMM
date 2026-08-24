import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  approvalBlockers,
  campaignPlanSchema,
  channelLabels,
  type CampaignPlan,
  type ChannelKey,
  type ProviderKey,
} from "@/lib/v1/domain";
import { createProviderMediaUrls } from "./provider-media";
import { loadProviderAccountContext } from "./provider-context";
import { paidAdapter } from "./adapters/paid";
import type {
  PaidDeploymentInput,
  ProviderAccountContext,
} from "./adapters/contracts";
import { sha256 } from "./credentials";
import { getProviderReadiness } from "./provider-platform";

export const paidChannels = new Set<ChannelKey>([
  "meta_ads",
  "google_search",
  "google_display",
  "tiktok_ads",
  "reddit_ads",
  "chatgpt_ads",
]);

export async function campaignPlanHash(plan: CampaignPlan) {
  return sha256(JSON.stringify(plan));
}

export async function loadApprovedCampaign(
  workspaceId: string,
  campaignId: string,
) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("campaigns")
    .select(
      "id,name,status,plan,currency,daily_budget_cents,lifetime_budget_cents,starts_at,ends_at",
    )
    .eq("id", campaignId)
    .eq("workspace_id", workspaceId)
    .single();
  if (error || !data) throw new Error("Campaign not found.");
  if (data.status !== "approved")
    throw new Error(
      "The campaign must be approved before paid preflight or launch.",
    );
  const plan = campaignPlanSchema.parse(data.plan);
  const blockers = approvalBlockers(plan);
  if (blockers.length)
    throw new Error(`Campaign is no longer launchable: ${blockers.join("; ")}`);
  return { campaign: data, plan };
}

export async function buildPaidInput(
  workspaceId: string,
  plan: CampaignPlan,
  item: CampaignPlan["content"][number],
  context: ProviderAccountContext,
): Promise<PaidDeploymentInput> {
  const urls = await createProviderMediaUrls(
    workspaceId,
    item.mediaIds,
    context.provider,
  );
  return {
    campaignName: plan.name,
    channel: item.channel,
    objective: plan.objective,
    dailyBudgetCents: plan.dailyBudgetCents,
    lifetimeBudgetCents: plan.lifetimeBudgetCents,
    currency: plan.currency,
    startsAt: plan.startsAt,
    endsAt: plan.endsAt,
    targeting: item.targeting,
    creative: {
      headline: item.headline,
      body: item.body,
      cta: item.cta,
      destinationUrl: item.destinationUrl,
      mediaUrls: item.mediaIds.map((id) => urls.get(id)!).filter(Boolean),
      carousel: item.carouselSlides.map((slide) => ({
        headline: slide.headline,
        body: slide.body,
        mediaUrl: slide.mediaId ? (urls.get(slide.mediaId) ?? "") : "",
      })),
      searchHeadlines: item.searchHeadlines,
      searchDescriptions: item.searchDescriptions,
      searchKeywords: item.searchKeywords,
    },
    idempotencyKey: `${plan.name}:${item.id}`,
  };
}

export async function preflightPaidDestinations(
  workspaceId: string,
  plan: CampaignPlan,
) {
  const results: Array<{
    channel: ChannelKey;
    accountId: string;
    accountName: string;
    provider: ProviderKey;
    valid: boolean;
    errors: Array<{ code: string; message: string; field?: string }>;
  }> = [];
  for (const item of plan.content.filter((content) =>
    paidChannels.has(content.channel),
  )) {
    if (!item.accountId)
      throw new Error(
        `${channelLabels[item.channel]} has no destination account.`,
      );
    const context = await loadProviderAccountContext(
      workspaceId,
      item.accountId,
    );
    const readiness = await getProviderReadiness(context.provider);
    if (!readiness.ready) {
      results.push({
        channel: item.channel,
        accountId: item.accountId,
        accountName: context.account.name,
        provider: context.provider,
        valid: false,
        errors: [
          {
            code: "provider_unavailable",
            message: readiness.reason ?? "Provider is unavailable.",
          },
        ],
      });
      continue;
    }
    const input = await buildPaidInput(workspaceId, plan, item, context);
    const validation = await paidAdapter(context.provider).validate(
      context,
      input,
    );
    results.push({
      channel: item.channel,
      accountId: item.accountId,
      accountName: context.account.name,
      provider: context.provider,
      valid: validation.valid,
      errors: validation.errors,
    });
  }
  return results;
}
