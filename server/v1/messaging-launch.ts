import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { channelLabels, type CampaignPlan, type ChannelKey, type ProviderKey } from "@/lib/v1/domain";
import { getProviderReadiness } from "@/server/v1/provider-platform";

export const messagingChannels = new Set<ChannelKey>(["email", "sms"]);

export async function preflightMessagingDestinations(workspaceId: string, plan: CampaignPlan) {
  const admin = getSupabaseAdmin();
  const results: Array<{ channel: ChannelKey; accountId: string; accountName: string; provider: ProviderKey; audienceId: string; eligibleRecipients: number; valid: boolean; errors: Array<{ code: string; message: string; field?: string }> }> = [];
  for (const item of plan.content.filter((entry) => messagingChannels.has(entry.channel))) {
    const errors: Array<{ code: string; message: string; field?: string }> = [];
    if (!item.accountId || !item.messaging?.audienceId) throw new Error(`${channelLabels[item.channel]} has no provider account or audience.`);
    const { data: account } = await admin.from("provider_accounts").select("id,name,provider_key,capabilities,connection_id,selected").eq("id", item.accountId).eq("workspace_id", workspaceId).single();
    const expectedProvider = item.channel === "email" ? "sendgrid_email" : "twilio_messaging";
    if (!account || !account.selected || account.provider_key !== expectedProvider) throw new Error(`${channelLabels[item.channel]} is assigned to the wrong provider account.`);
    const readiness = await getProviderReadiness(expectedProvider);
    if (!readiness.ready) errors.push({ code: "provider_unavailable", message: readiness.reason ?? "Provider is unavailable." });
    const { data: settings } = await admin.from("messaging_settings").select("legal_business_name,physical_address").eq("workspace_id", workspaceId).maybeSingle();
    if (!settings?.legal_business_name || !settings.physical_address) errors.push({ code: "sender_identity_missing", message: "Add the legal sender name and physical address in Contacts & consent." });
    const { data: members } = await admin.from("contact_list_members").select("contact_id,contacts(country)").eq("workspace_id", workspaceId).eq("list_id", item.messaging.audienceId).limit(10000);
    const contactIds = (members ?? []).map((member) => member.contact_id);
    const [{ data: consents }, { data: suppressions }] = contactIds.length ? await Promise.all([
      admin.from("communication_consents").select("contact_id").eq("workspace_id", workspaceId).eq("channel", item.channel).eq("status", "subscribed").in("contact_id", contactIds),
      admin.from("suppressions").select("contact_id").eq("workspace_id", workspaceId).eq("channel", item.channel).in("contact_id", contactIds),
    ]) : [{ data: [] }, { data: [] }];
    const suppressed = new Set((suppressions ?? []).map((entry) => entry.contact_id));
    const eligibleRecipients = (consents ?? []).filter((entry) => !suppressed.has(entry.contact_id)).length;
    if (!eligibleRecipients) errors.push({ code: "audience_empty", message: "This list has no eligible recipients with explicit channel consent." });
    if (eligibleRecipients !== item.messaging.estimatedRecipients) errors.push({ code: "audience_changed", message: `The audience changed after approval (${item.messaging.estimatedRecipients} reviewed, ${eligibleRecipients} eligible now). Review and approve again.` });
    const capabilities = (account.capabilities ?? {}) as Record<string, unknown>;
    const hasUsRecipients = (members ?? []).some((member) => {
      const contact = Array.isArray(member.contacts) ? member.contacts[0] : member.contacts;
      return (contact as { country?: string } | null)?.country === "US";
    });
    if (item.channel === "sms" && hasUsRecipients && capabilities.usa2pCampaignStatus !== "VERIFIED") errors.push({ code: "usa2p_not_verified", message: "US SMS delivery is blocked until this Messaging Service has a VERIFIED A2P 10DLC campaign." });
    if (item.channel === "email" && (capabilities.domainAuthenticated !== true || capabilities.signedEventWebhook !== true)) errors.push({ code: "email_sender_not_ready", message: "The SendGrid domain and signed Event Webhook must be verified." });
    results.push({ channel: item.channel, accountId: item.accountId, accountName: account.name, provider: expectedProvider, audienceId: item.messaging.audienceId, eligibleRecipients, valid: errors.length === 0, errors });
  }
  return results;
}
