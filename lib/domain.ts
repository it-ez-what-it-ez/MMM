import type { IntegrationDefinition, Role } from "@/lib/types";

export function filterIntegrationCatalog(definitions: IntegrationDefinition[], search: string, category = "All") {
  const needle = search.trim().toLowerCase();
  return definitions.filter((item) => (category === "All" || item.category === category) && (!needle || `${item.name} ${item.description} ${item.capabilities.join(" ")}`.toLowerCase().includes(needle)));
}

const connectionTransitions: Record<string, string[]> = {
  NOT_CONNECTED: ["CONNECTING"], CONNECTING: ["CONNECTED", "ERROR"], CONNECTED: ["DEGRADED", "EXPIRED", "REVOKED"], DEGRADED: ["CONNECTED", "ERROR", "REVOKED"], EXPIRED: ["CONNECTING", "REVOKED"], ERROR: ["CONNECTING", "REVOKED"], REVOKED: ["CONNECTING"],
};
export function canTransitionConnection(from: string, to: string) { return connectionTransitions[from]?.includes(to) ?? false; }

export function canApprove(role: Role) { return role === "OWNER" || role === "ADMIN" || role === "REVIEWER"; }
export function canPublish(role: Role, contentState: string, approvalMode = true) { return ["OWNER", "ADMIN", "MARKETER"].includes(role) && (!approvalMode || ["APPROVED", "SCHEDULED", "PUBLISHED"].includes(contentState)); }

export function stableExternalId(prefix: string, idempotencyKey: string) {
  let hash = 2166136261;
  for (const char of idempotencyKey) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export type SyntheticCustomer = { id: string; emailConsent: boolean; adConsent: boolean; region: string; suppressed: boolean };
export function applyAudienceConsent(records: SyntheticCustomer[], destination: "EMAIL" | "ADVERTISING", allowedRegions = ["CA", "US"]) {
  const accepted: SyntheticCustomer[] = []; const rejected: SyntheticCustomer[] = [];
  for (const record of records) {
    const eligible = !record.suppressed && allowedRegions.includes(record.region) && (destination === "EMAIL" ? record.emailConsent : record.adConsent);
    (eligible ? accepted : rejected).push(record);
  }
  return { accepted, rejected };
}

export function adapterOutcome(operationKey: string, attempt: number) { return operationKey.includes("recoverable") && attempt === 1 ? { ok: false, recoverable: true, code: "RATE_LIMIT" } : { ok: true, recoverable: false, code: "OK" }; }

export function inferLearningPreference(before: string, after: string) {
  const removed = before.toLowerCase().split(/\W+/).filter((word) => word.length > 5 && !after.toLowerCase().includes(word));
  return removed.length ? { label: "Words repeatedly removed", value: [...new Set(removed)].join(", "), evidenceCount: removed.length, explicit: false } : null;
}

export function requiresConfirmation(action: string) { return ["publish_content", "activate_ad_campaign", "raise_budget", "delete_connection", "delete_campaign", "bulk_approval"].includes(action); }
