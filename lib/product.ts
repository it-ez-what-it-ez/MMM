export const product = {
  name: "GrowthOS",
  tagline: "Marketing, orchestrated.",
  description: "The AI marketing control plane for planning, creating, approving, activating, and learning across every channel.",
  workspace: "Northstar Analytics",
  accent: "#0f766e",
  aiAccent: "#7357d8",
} as const;

export const navigation = [
  { group: "", items: [["Home", "/app", "home"]] },
  { group: "Create", items: [["Campaigns", "/app/campaigns", "campaign"], ["Calendar", "/app/calendar", "calendar"], ["Approvals", "/app/approvals", "approval"]] },
  { group: "Brand", items: [["Brand Kit", "/app/brand-kit", "brand"], ["Media Library", "/app/brand-kit?tab=media", "media"]] },
  { group: "Activate", items: [["Audiences", "/app/audiences", "audience"], ["Integrations", "/app/integrations", "integration"], ["Syncs", "/app/syncs", "sync"]] },
  { group: "Measure", items: [["Insights", "/app/insights", "insights"], ["Paid Ads", "/app/paid-ads", "ads"]] },
  { group: "Workspace", items: [["Team", "/app/team", "team"], ["Audit Log", "/app/audit-log", "audit"], ["Settings", "/app/settings", "settings"]] },
] as const;
