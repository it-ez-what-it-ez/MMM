"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  FileImage,
  Home,
  ImagePlus,
  Layers3,
  Link2,
  Loader2,
  LogOut,
  Megaphone,
  Menu,
  MoreHorizontal,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/client";
import {
  approvalBlockers,
  channelLabels,
  type CampaignPlan,
  type ChannelKey,
  CHANNEL_KEYS,
  providerCapabilities,
  type ProviderKey,
  type TacticDesign,
} from "@/lib/v1/domain";
import {
  campaignTemplates,
  getTemplate,
  resolveTemplateText,
} from "@/lib/v1/templates";
import { buildCampaignEmailHtml, smsSegmentCount } from "@/lib/v1/messaging";
import { deriveProviderSetup } from "@/lib/v1/connection-onboarding";
import {
  isIntegrationCategory,
  type IntegrationCategoryKey,
} from "@/lib/v1/integration-catalog";
import { TacticEditor } from "./TacticEditor";
import {
  ConnectionsSetupCenter,
  ProviderSetupPage,
  isSetupProvider,
} from "./ConnectionOnboarding";

type Workspace = {
  id: string;
  name: string;
  slug: string;
  business_type: "ecommerce" | "service";
  timezone: string;
  currency: "USD" | "CAD";
  approval_mode: "solo" | "team";
  website_url: string | null;
  monthly_spend_ceiling_cents: number | null;
};
type ProductService = {
  id: string;
  name: string;
  description: string | null;
  kind: "ecommerce" | "service";
  landing_url: string | null;
  price_cents: number | null;
  currency: string | null;
};
type MediaAsset = {
  id: string;
  product_service_id: string | null;
  storage_path: string;
  filename: string;
  kind: string;
  content_type: string;
  width: number | null;
  height: number | null;
  url?: string;
};
type Campaign = {
  id: string;
  name: string;
  status: string;
  source: "template" | "ai";
  plan: CampaignPlan;
  starts_at: string | null;
  created_at: string;
  updated_at: string;
};
type ProviderConnection = {
  id: string;
  provider_key: ProviderKey;
  status: string;
  health_checked_at: string | null;
  health_error: Record<string, unknown> | null;
  granted_scopes: string[];
  token_expires_at: string | null;
};
type ProviderAccount = {
  id: string;
  provider_key: ProviderKey;
  external_id: string;
  name: string;
  account_type: string;
  currency: string | null;
  timezone: string | null;
  billing_status: string | null;
  selected: boolean;
  capabilities: Record<string, unknown>;
};
type ProviderReadiness = {
  provider: ProviderKey;
  ready: boolean;
  implementationReady?: boolean;
  configured: boolean;
  reviewStatus: string;
  redirectVerified: boolean;
  smokeTestPassed: boolean;
  killSwitch: boolean;
  reason: string | null;
};
type PlatformProviderRecord = ProviderReadiness & {
  environment: "development" | "staging" | "production";
  applicationId: string | null;
  requiredScopes: string[];
  grantedScopes: string[];
  apiVersion: string | null;
  webhookVerified: boolean;
  lastSmokeTestAt: string | null;
  lastSmokeTestStatus: "passed" | "failed" | null;
  tokenRefreshHealthy: boolean;
  webhookHealthy: boolean;
};
type MembershipRow = {
  role: string;
  workspaces: Workspace | Workspace[] | null;
};
type MetricRow = {
  id: string;
  campaign_id: string | null;
  provider_key: ProviderKey;
  source_model: string;
  period_start: string;
  period_end: string;
  currency: string | null;
  metrics: Record<string, number>;
};
type MessagingAudience = {
  id: string;
  name: string;
  description: string | null;
  totalContacts: number;
  eligible: { email: number; sms: number };
};
type MessagingSettings = {
  legal_business_name: string;
  physical_address: string;
  default_country: "US" | "CA";
  quiet_hours_start: string;
  quiet_hours_end: string;
};
type MessageBatchRow = {
  id: string;
  campaign_id: string;
  channel: "email" | "sms";
  status: string;
  eligible_count: number;
  accepted_count: number;
  delivered_count: number;
  failed_count: number;
  suppressed_count: number;
  scheduled_for: string;
};

async function loadCanvasImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error(
          "The selected image could not be rendered. Upload it again or choose another image.",
        ),
      );
    image.src = url;
  });
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
) {
  const lines: string[] = [];
  let line = "";
  for (const word of value.trim().split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

async function renderCreativeBlob(input: {
  sourceUrl: string;
  width: number;
  height: number;
  headline: string;
  body: string;
  design?: CampaignPlan["content"][number]["design"];
}) {
  const canvas = document.createElement("canvas");
  canvas.width = input.width;
  canvas.height = input.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser cannot render campaign assets.");
  const design = input.design;
  const background = design?.background ?? "#F3F1E8";
  const surface = design?.surface ?? "#FFFFFF";
  const accent = design?.accent ?? "#087F72";
  const textColor = design?.textColor ?? "#102822";
  context.fillStyle = background;
  context.fillRect(0, 0, input.width, input.height);
  const image = await loadCanvasImage(input.sourceUrl);
  const split = design?.layout === "split";
  const subjectTop = Math.round(input.height * (split ? 0.12 : 0.3));
  const subjectHeight = Math.round(input.height * (split ? 0.76 : 0.63));
  const subjectWidth = Math.round(input.width * (split ? 0.44 : 0.82));
  const subjectLeft = split ? input.width * 0.52 : input.width * 0.09;
  context.fillStyle = surface;
  context.roundRect(
    subjectLeft,
    subjectTop,
    subjectWidth,
    subjectHeight,
    Math.round(input.width * 0.025),
  );
  context.fill();
  const scale = Math.min(
    (subjectWidth * 0.9) / image.naturalWidth,
    (subjectHeight * 0.9) / image.naturalHeight,
  );
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    subjectLeft + (subjectWidth - drawWidth) / 2,
    subjectTop + (subjectHeight - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  context.fillStyle = textColor;
  context.font = `700 ${Math.max(36, Math.round(input.width * (split ? 0.048 : 0.055)))}px Arial, sans-serif`;
  context.textBaseline = "top";
  const lineHeight = Math.max(42, Math.round(input.width * 0.063));
  const copyLeft = input.width * 0.08;
  const copyWidth = input.width * (split ? 0.38 : 0.84);
  wrapCanvasText(context, input.headline, copyWidth).forEach(
    (line, index) =>
      context.fillText(
        line,
        copyLeft,
        input.height * 0.055 + index * lineHeight,
      ),
  );
  context.font = `500 ${Math.max(22, Math.round(input.width * 0.023))}px Arial, sans-serif`;
  context.fillStyle = textColor;
  wrapCanvasText(context, input.body, copyWidth)
    .slice(0, 2)
    .forEach((line, index) =>
      context.fillText(
        line,
        copyLeft,
        input.height * (split ? 0.42 : 0.2) + index * Math.round(input.width * 0.03),
      ),
    );
  const offer = design?.blocks.find(
    (block) => block.kind === "discount" && block.visible,
  )?.text;
  if (offer) {
    context.fillStyle = accent;
    context.font = `700 ${Math.max(22, Math.round(input.width * 0.025))}px Arial, sans-serif`;
    context.fillText(
      offer,
      copyLeft,
      input.height * (split ? 0.68 : 0.245),
    );
  }
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Campaign asset export failed.")),
      "image/png",
      1,
    ),
  );
}

const NAV = [
  { label: "Home", href: "/app", icon: Home },
  { label: "Campaigns", href: "/app/campaigns", icon: Megaphone },
  { label: "Calendar", href: "/app/calendar", icon: CalendarDays },
  { label: "Results", href: "/app/results", icon: BarChart3 },
  { label: "Integrations", href: "/app/integrations", icon: Link2 },
  { label: "Manage", href: "/app/manage", icon: Settings },
];

const MOBILE_NAV = NAV.filter((item) =>
  ["Home", "Campaigns", "Calendar", "Integrations", "Manage"].includes(
    item.label,
  ),
);

const PAID_CHANNELS = new Set<ChannelKey>([
  "meta_ads",
  "google_search",
  "google_display",
  "tiktok_ads",
  "reddit_ads",
  "chatgpt_ads",
]);

function tacticDate(startDate: string, dayOffset: number, sendTime: string) {
  const [hours, minutes] = sendTime.split(":").map(Number);
  const date = new Date(`${startDate}T00:00:00`);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function resolveTacticDesign(
  design: TacticDesign,
  variables: Parameters<typeof resolveTemplateText>[1],
): TacticDesign {
  return {
    ...design,
    blocks: design.blocks.map((block) => ({
      ...block,
      text: resolveTemplateText(block.text, variables),
    })),
  };
}

async function authenticatedFetch(path: string, init: RequestInit = {}) {
  const { data } = await getBrowserSupabase().auth.getSession();
  if (!data.session) throw new Error("Your session expired. Sign in again.");
  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
      ...init.headers,
    },
  });
}

async function uploadRenderedAsset(input: {
  workspaceId: string;
  productServiceId: string;
  blob: Blob;
  label: string;
  width: number;
  height: number;
}) {
  const bytes = await input.blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const assetId = crypto.randomUUID();
  const safeLabel = input.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const path = `${input.workspaceId}/rendered/${input.productServiceId}/${assetId}.png`;
  const supabase = getBrowserSupabase();
  const { error: uploadError } = await supabase.storage
    .from("growthos-private-media")
    .upload(path, input.blob, { contentType: "image/png", upsert: false });
  if (uploadError) throw uploadError;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Your session expired. Sign in again.");
  const { error: recordError } = await supabase.from("media_assets").insert({
    id: assetId,
    workspace_id: input.workspaceId,
    product_service_id: input.productServiceId,
    storage_path: path,
    kind: "rendered_creative",
    filename: `${safeLabel}.png`,
    content_type: "image/png",
    byte_size: input.blob.size,
    width: input.width,
    height: input.height,
    sha256: sha,
    moderation_status: "pending",
    created_by: userData.user.id,
  });
  if (recordError) {
    await supabase.storage.from("growthos-private-media").remove([path]);
    throw recordError;
  }
  const response = await authenticatedFetch(`/api/v1/media/${assetId}/moderate`, {
    method: "POST",
    body: JSON.stringify({ workspaceId: input.workspaceId }),
  });
  const moderation = (await response.json()) as {
    ok: boolean;
    data?: { status: string };
    errors?: Array<{ message: string }>;
  };
  if (!moderation.ok || moderation.data?.status !== "accepted")
    throw new Error(
      moderation.errors?.[0]?.message ??
        "A rendered campaign frame did not pass moderation.",
    );
  return {
    id: assetId,
    product_service_id: input.productServiceId,
    storage_path: path,
    filename: `${safeLabel}.png`,
    kind: "rendered_creative",
    content_type: "image/png",
    width: input.width,
    height: input.height,
    url: URL.createObjectURL(input.blob),
  } satisfies MediaAsset;
}

function routeTitle(path: string) {
  if (path.includes("campaigns/new")) return "Create campaign";
  if (/\/campaigns\/[^/]+/.test(path)) return "Campaign";
  if (path.startsWith("/app/campaigns")) return "Campaigns";
  if (path.startsWith("/app/calendar")) return "Calendar";
  if (path.startsWith("/app/results")) return "Results";
  if (path.startsWith("/app/integrations")) return "Integrations";
  if (path.startsWith("/app/manage/connections")) return "Integrations";
  if (path.startsWith("/app/manage")) return "Manage";
  return "Home";
}

export function GrowthOSApp({
  initialPath,
  initialUser,
  initialConnectionNotice,
}: {
  initialPath: string;
  initialUser: Pick<User, "id" | "email" | "user_metadata">;
  initialConnectionNotice?: { type: "success" | "error"; message: string };
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [role, setRole] = useState<string>("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [products, setProducts] = useState<ProductService[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [accounts, setAccounts] = useState<ProviderAccount[]>([]);
  const [readiness, setReadiness] = useState<ProviderReadiness[]>([]);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [messagingAudiences, setMessagingAudiences] = useState<MessagingAudience[]>([]);
  const [messagingSettings, setMessagingSettings] = useState<MessagingSettings | null>(null);
  const [messageBatches, setMessageBatches] = useState<MessageBatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const supabase = getBrowserSupabase();
    const { error: claimError } = await supabase.rpc(
      "claim_pending_invitations",
    );
    if (claimError) {
      setLoadError(claimError.message);
      setLoading(false);
      return;
    }
    const { data: membershipData, error } = await supabase
      .from("memberships")
      .select("role, workspaces(*)")
      .eq("user_id", initialUser.id)
      .limit(1);
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    const membership = (membershipData?.[0] ?? null) as MembershipRow | null;
    const joined = Array.isArray(membership?.workspaces)
      ? membership?.workspaces[0]
      : membership?.workspaces;
    if (!membership || !joined) {
      setWorkspace(null);
      setLoading(false);
      return;
    }
    setWorkspace(joined);
    setRole(membership.role);
    const [
      campaignResult,
      productsResult,
      mediaResult,
      connectionsResult,
      accountsResult,
      metricsResult,
      readinessResponse,
      messagingResponse,
      messageBatchesResult,
    ] = await Promise.all([
      supabase
        .from("campaigns")
        .select("id,name,status,source,plan,starts_at,created_at,updated_at")
        .eq("workspace_id", joined.id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("products_services")
        .select("id,name,description,kind,landing_url,price_cents,currency")
        .eq("workspace_id", joined.id)
        .is("archived_at", null)
        .order("created_at"),
      supabase
        .from("media_assets")
        .select(
          "id,product_service_id,storage_path,filename,kind,content_type,width,height",
        )
        .eq("workspace_id", joined.id)
        .order("created_at"),
      supabase
        .from("provider_connections")
        .select("id,provider_key,status,health_checked_at,health_error,granted_scopes,token_expires_at")
        .eq("workspace_id", joined.id),
      supabase
        .from("provider_accounts")
        .select(
          "id,provider_key,external_id,name,account_type,currency,timezone,billing_status,selected,capabilities",
        )
        .eq("workspace_id", joined.id),
      supabase
        .from("metric_snapshots")
        .select(
          "id,campaign_id,provider_key,source_model,period_start,period_end,currency,metrics",
        )
        .eq("workspace_id", joined.id)
        .order("period_end", { ascending: false })
        .limit(100),
      authenticatedFetch("/api/v1/providers/readiness"),
      authenticatedFetch(`/api/v1/messaging/audiences?workspaceId=${joined.id}`),
      supabase.from("message_batches").select("id,campaign_id,channel,status,eligible_count,accepted_count,delivered_count,failed_count,suppressed_count,scheduled_for").eq("workspace_id", joined.id).order("scheduled_for", { ascending: false }).limit(100),
    ]);
    const firstError = [
      campaignResult.error,
      productsResult.error,
      mediaResult.error,
      connectionsResult.error,
      accountsResult.error,
      metricsResult.error,
      messageBatchesResult.error,
    ].find(Boolean);
    if (firstError) setLoadError(firstError.message);
    setCampaigns((campaignResult.data ?? []) as Campaign[]);
    setProducts((productsResult.data ?? []) as ProductService[]);
    const mediaRows = (mediaResult.data ?? []) as MediaAsset[];
    const withUrls = await Promise.all(
      mediaRows.map(async (asset) => {
        const { data } = await supabase.storage
          .from("growthos-private-media")
          .createSignedUrl(asset.storage_path, 3600);
        return { ...asset, url: data?.signedUrl };
      }),
    );
    setMedia(withUrls);
    setConnections((connectionsResult.data ?? []) as ProviderConnection[]);
    setAccounts((accountsResult.data ?? []) as ProviderAccount[]);
    setMetrics((metricsResult.data ?? []) as MetricRow[]);
    setMessageBatches((messageBatchesResult.data ?? []) as MessageBatchRow[]);
    if (readinessResponse.ok) {
      const result = (await readinessResponse.json()) as {
        ok: boolean;
        data?: ProviderReadiness[];
      };
      setReadiness(result.data ?? []);
    }
    if (messagingResponse.ok) {
      const result = (await messagingResponse.json()) as { ok: boolean; data?: { lists: MessagingAudience[]; settings: MessagingSettings | null } };
      setMessagingAudiences(result.data?.lists ?? []);
      setMessagingSettings(result.data?.settings ?? null);
    }
    if (["owner", "admin"].includes(membership.role)) {
      const adminResponse = await authenticatedFetch("/api/v1/admin/providers");
      setPlatformAdmin(adminResponse.ok);
    }
    setLoading(false);
  }, [initialUser.id]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  async function signOut() {
    await getBrowserSupabase().auth.signOut();
    window.location.assign("/");
  }

  if (loading) return <AppLoading />;
  if (!workspace)
    return <WorkspaceOnboarding user={initialUser} error={loadError} />;

  const content = (() => {
    if (initialPath === "/app/campaigns/new")
      return (
        <CampaignCreator
          workspace={workspace}
          products={products}
          media={media}
          accounts={accounts.filter((account) => account.selected)}
          messagingAudiences={messagingAudiences}
          messagingSettings={messagingSettings}
          onCreated={(id) => window.location.assign(`/app/campaigns/${id}`)}
        />
      );
    const campaignMatch = initialPath.match(
      /^\/app\/campaigns\/([^/]+)(?:\/(review|schedule|delivery|results))?$/,
    );
    if (campaignMatch) {
      const campaign = campaigns.find((item) => item.id === campaignMatch[1]);
      return campaign ? (
        <CampaignWorkspace
          campaign={campaign}
          workspace={workspace}
          tab={campaignMatch[2] ?? "review"}
          media={media}
          accounts={accounts}
          metrics={metrics.filter(
            (metric) => metric.campaign_id === campaign.id,
          )}
          messageBatches={messageBatches.filter((batch) => batch.campaign_id === campaign.id)}
          onRefresh={loadWorkspace}
        />
      ) : (
        <EmptyPage
          title="Campaign not found"
          detail="This campaign may have been removed or you may no longer have access."
        />
      );
    }
    if (initialPath.startsWith("/app/campaigns"))
      return <CampaignsPage campaigns={campaigns} />;
    if (initialPath.startsWith("/app/calendar"))
      return <CalendarPage campaigns={campaigns} />;
    if (initialPath.startsWith("/app/results"))
      return <ResultsPage campaigns={campaigns} metrics={metrics} messageBatches={messageBatches} />;
    if (initialPath.startsWith("/app/manage/brand"))
      return (
        <BrandAssetsPage
          workspace={workspace}
          products={products}
          media={media}
          onRefresh={loadWorkspace}
        />
      );
    if (initialPath.startsWith("/app/manage/contacts"))
      return <ContactsConsentPage workspace={workspace} audiences={messagingAudiences} settings={messagingSettings} onRefresh={loadWorkspace} />;
    if (initialPath.startsWith("/app/manage/platform"))
      return <PlatformReadinessPage />;
    const integrationProviderMatch = initialPath.match(
      /^\/app\/integrations\/([^/]+)$/,
    );
    const legacyConnectionMatch = initialPath.match(
      /^\/app\/manage\/connections\/([^/]+)$/,
    );
    const providerPathKey =
      integrationProviderMatch?.[1] ?? legacyConnectionMatch?.[1];
    if (providerPathKey && isSetupProvider(providerPathKey))
      return (
        <ProviderSetupPage
          workspace={workspace}
          provider={providerPathKey}
          connections={connections}
          accounts={accounts}
          readiness={readiness}
          messagingIdentityComplete={Boolean(
            messagingSettings?.legal_business_name &&
              messagingSettings.physical_address,
          )}
          smsRequiresUsA2p={
            (messagingSettings?.default_country ??
              (workspace.currency === "CAD" ? "CA" : "US")) === "US"
          }
          canManage={["owner", "admin"].includes(role)}
          connectionNotice={initialConnectionNotice}
          onRefresh={loadWorkspace}
        />
      );
    const integrationCategoryPath = initialPath.match(
      /^\/app\/integrations(?:\/([^/]+))?$/,
    )?.[1];
    if (
      initialPath === "/app/integrations" ||
      isIntegrationCategory(integrationCategoryPath) ||
      initialPath.startsWith("/app/manage/connections")
    )
      return (
        <ConnectionsSetupCenter
          workspace={workspace}
          connections={connections}
          accounts={accounts}
          readiness={readiness}
          messagingIdentityComplete={Boolean(
            messagingSettings?.legal_business_name &&
              messagingSettings.physical_address,
          )}
          smsRequiresUsA2p={
            (messagingSettings?.default_country ??
              (workspace.currency === "CAD" ? "CA" : "US")) === "US"
          }
          canManage={["owner", "admin"].includes(role)}
          connectionNotice={initialConnectionNotice}
          initialCategory={
            (isIntegrationCategory(integrationCategoryPath)
              ? integrationCategoryPath
              : "data") as IntegrationCategoryKey
          }
        />
      );
    if (initialPath.startsWith("/app/manage/team"))
      return <TeamPage workspace={workspace} role={role} />;
    if (initialPath.startsWith("/app/manage/settings"))
      return <WorkspaceSettings workspace={workspace} />;
    if (initialPath.startsWith("/app/manage"))
      return (
        <ManagePage
          products={products}
          media={media}
          connections={connections}
          platformAdmin={platformAdmin}
        />
      );
    return (
      <HomePage
        workspace={workspace}
        campaigns={campaigns}
        products={products}
        connections={connections}
        accounts={accounts}
        readiness={readiness}
        messagingSettings={messagingSettings}
      />
    );
  })();

  return (
    <div className={`app-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="sidebar-top">
          <a className="wordmark" href="/app">
            <span>G</span>
            <b>GrowthOS</b>
          </a>
          <button
            className="icon-button desktop-only"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? (
              <PanelLeftClose size={18} />
            ) : (
              <PanelLeftOpen size={18} />
            )}
          </button>
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-pill">
          <span>{workspace.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{workspace.name}</strong>
            <small>{role}</small>
          </div>
        </div>
        <a className="button primary create-button" href="/app/campaigns/new">
          <Plus size={18} />
          <b>New campaign</b>
        </a>
        <nav className="main-nav" aria-label="Primary navigation">
          {NAV.map((item) => {
            const active =
              item.href === "/app"
                ? initialPath === "/app"
                : initialPath.startsWith(item.href);
            return (
              <a
                key={item.href}
                className={active ? "active" : ""}
                href={item.href}
                aria-current={active ? "page" : undefined}
              >
                <item.icon size={19} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="small-status">
            <span className={connections.length ? "dot good" : "dot"} />
            {connections.length
              ? `${connections.length} real connection${connections.length === 1 ? "" : "s"}`
              : "No destinations connected"}
          </div>
          <button className="nav-signout" onClick={signOut}>
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <section className="app-main">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            aria-label="Open navigation"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={20} />
          </button>
          <div className="topbar-context">
            <span>{workspace.name}</span>
            <b>{routeTitle(initialPath)}</b>
          </div>
          <div className="topbar-actions">
            <span className="avatar" title={initialUser.email ?? "Account"}>
              {(initialUser.user_metadata.full_name ?? initialUser.email ?? "U")
                .slice(0, 1)
                .toUpperCase()}
            </span>
          </div>
        </header>
        {loadError && (
          <div className="global-error">
            <CircleAlert size={18} /> Some workspace data could not be loaded:{" "}
            {loadError}
          </div>
        )}
        <main className="page-content">{content}</main>
      </section>
      <nav className="mobile-bottom" aria-label="Mobile navigation">
        {MOBILE_NAV.map((item) => (
          <a key={item.href} href={item.href}>
            <item.icon size={20} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

function AppLoading() {
  return (
    <div className="app-loading">
      <div className="wordmark">
        <span>G</span>
        <b>GrowthOS</b>
      </div>
      <Loader2 className="spin" size={24} />
      <p>Loading your workspace…</p>
    </div>
  );
}

function WorkspaceOnboarding({
  user,
  error,
}: {
  user: Pick<User, "id" | "email" | "user_metadata">;
  error: string;
}) {
  const [values, setValues] = useState({
    name: "",
    businessType: "ecommerce" as "ecommerce" | "service",
    websiteUrl: "",
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto",
    currency: "CAD" as "CAD" | "USD",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(error);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      const response = await authenticatedFetch("/api/v1/workspaces", {
        method: "POST",
        body: JSON.stringify(values),
      });
      const result = (await response.json()) as {
        ok: boolean;
        errors?: Array<{ message: string }>;
      };
      if (!result.ok)
        throw new Error(
          result.errors?.[0]?.message ?? "Workspace creation failed.",
        );
      window.location.assign("/app/manage/brand?welcome=1");
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "Workspace creation failed.",
      );
      setSubmitting(false);
    }
  }
  return (
    <main className="onboarding-page">
      <div className="onboarding-logo wordmark">
        <span>G</span>
        <b>GrowthOS</b>
      </div>
      <div className="onboarding-card">
        <div className="steps">
          <span className="active">1</span>
          <i />
          <span>2</span>
          <i />
          <span>3</span>
        </div>
        <p className="kicker">Create your real workspace</p>
        <h1>Tell us about your business</h1>
        <p className="muted">
          Nothing is pre-filled with demo data. We’ll use this to tailor
          templates and provider requirements.
        </p>
        {formError && <div className="notice error">{formError}</div>}
        <form className="form-grid" onSubmit={submit}>
          <label className="span-2">
            Business name
            <input
              required
              value={values.name}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
              placeholder="Your business"
            />
          </label>
          <fieldset className="span-2 choice-row">
            <legend>What do you sell?</legend>
            <label
              className={values.businessType === "ecommerce" ? "selected" : ""}
            >
              <input
                type="radio"
                name="type"
                checked={values.businessType === "ecommerce"}
                onChange={() =>
                  setValues({ ...values, businessType: "ecommerce" })
                }
              />{" "}
              <Package size={20} />
              <span>
                <b>Products</b>
                <small>Physical or digital goods</small>
              </span>
            </label>
            <label
              className={values.businessType === "service" ? "selected" : ""}
            >
              <input
                type="radio"
                name="type"
                checked={values.businessType === "service"}
                onChange={() =>
                  setValues({ ...values, businessType: "service" })
                }
              />{" "}
              <Users size={20} />
              <span>
                <b>Services</b>
                <small>Bookings or consultations</small>
              </span>
            </label>
          </fieldset>
          <label className="span-2">
            Website <em>Optional</em>
            <input
              type="url"
              value={values.websiteUrl}
              onChange={(e) =>
                setValues({ ...values, websiteUrl: e.target.value })
              }
              placeholder="https://yourbusiness.com"
            />
          </label>
          <label>
            Currency
            <select
              value={values.currency}
              onChange={(e) =>
                setValues({
                  ...values,
                  currency: e.target.value as "CAD" | "USD",
                })
              }
            >
              <option>CAD</option>
              <option>USD</option>
            </select>
          </label>
          <label>
            Timezone
            <input
              value={values.timezone}
              onChange={(e) =>
                setValues({ ...values, timezone: e.target.value })
              }
            />
          </label>
          <button className="button primary span-2" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="spin" size={18} />
                Creating…
              </>
            ) : (
              <>
                Create workspace <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
        <p className="fine-print">Signed in as {user.email}</p>
      </div>
    </main>
  );
}

function PageHeader({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{detail}</p>
      </div>
      {action}
    </header>
  );
}

function HomePage({
  workspace,
  campaigns,
  products,
  connections,
  accounts,
  readiness,
  messagingSettings,
}: {
  workspace: Workspace;
  campaigns: Campaign[];
  products: ProductService[];
  connections: ProviderConnection[];
  accounts: ProviderAccount[];
  readiness: ProviderReadiness[];
  messagingSettings: MessagingSettings | null;
}) {
  const readyProviders = Object.keys(providerCapabilities).filter((value) => {
    const provider = value as ProviderKey;
    const connection = connections.find((item) => item.provider_key === provider);
    const platform = readiness.find((item) => item.provider === provider);
    return deriveProviderSetup({
      provider,
      platformReady: Boolean(platform?.ready),
      platformReason: platform?.reason,
      connection: connection
        ? { status: connection.status, healthError: connection.health_error }
        : null,
      accounts: accounts
        .filter((account) => account.provider_key === provider)
        .map((account) => ({
          accountType: account.account_type,
          selected: account.selected,
          billingStatus: account.billing_status,
          capabilities: account.capabilities,
        })),
      messagingIdentityComplete: Boolean(
        messagingSettings?.legal_business_name &&
          messagingSettings.physical_address,
      ),
      smsRequiresUsA2p:
        (messagingSettings?.default_country ??
          (workspace.currency === "CAD" ? "CA" : "US")) === "US",
    }).status === "ready";
  });
  const attention = !products.length
    ? {
        title: `Add your first ${workspace.business_type === "ecommerce" ? "product" : "service"}`,
        detail: "Campaign previews need a real image and landing page.",
        href: "/app/manage/brand",
        action: "Add brand & assets",
      }
    : !readyProviders.length
      ? {
          title: accounts.some((account) => account.selected)
            ? "Finish channel setup"
            : "Connect your first channel",
          detail:
            "Authorize the real provider account, choose destinations, and pass a live readiness check.",
          href: "/app/integrations",
          action: "Open integrations",
        }
      : !campaigns.length
        ? {
            title: "Create your first campaign",
            detail:
              "Start from a channel-accurate template or describe your objective.",
            href: "/app/campaigns/new",
            action: "Create campaign",
          }
        : {
            title: "Review your latest campaign",
            detail: "Check every creative and delivery detail before approval.",
            href: `/app/campaigns/${campaigns[0].id}`,
            action: "Continue review",
          };
  const next = campaigns
    .filter((c) => c.starts_at && new Date(c.starts_at) >= new Date())
    .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""))[0];
  return (
    <>
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}`}
        detail="Here’s the one thing that will move your marketing forward."
        action={
          <a className="button primary" href="/app/campaigns/new">
            <Plus size={18} /> Create campaign
          </a>
        }
      />
      <section className="recommendation-card">
        <div className="recommendation-icon">
          <ArrowRight size={22} />
        </div>
        <div>
          <p className="kicker">Recommended next</p>
          <h2>{attention.title}</h2>
          <p>{attention.detail}</p>
        </div>
        <a className="button primary" href={attention.href}>
          {attention.action}
        </a>
      </section>
      <div className="home-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Work in progress</h2>
            <a href="/app/campaigns">View all</a>
          </div>
          {campaigns.slice(0, 3).length ? (
            campaigns
              .slice(0, 3)
              .map((campaign) => (
                <CampaignRow key={campaign.id} campaign={campaign} />
              ))
          ) : (
            <CompactEmpty
              icon={<Megaphone size={20} />}
              text="No campaigns yet"
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Next scheduled</h2>
            <a href="/app/calendar">Calendar</a>
          </div>
          {next ? (
            <div className="next-campaign">
              <div className="date-tile">
                <b>{new Date(next.starts_at!).getDate()}</b>
                <span>
                  {new Date(next.starts_at!).toLocaleString("en", {
                    month: "short",
                  })}
                </span>
              </div>
              <div>
                <strong>{next.name}</strong>
                <p>{new Date(next.starts_at!).toLocaleString()}</p>
              </div>
            </div>
          ) : (
            <CompactEmpty
              icon={<CalendarDays size={20} />}
              text="Nothing scheduled"
            />
          )}
        </section>
      </div>
      <section className="metric-strip">
        <div>
          <span>Campaigns</span>
          <b>{campaigns.length}</b>
          <small>Real workspace records</small>
        </div>
        <div>
          <span>Ready channels</span>
          <b>{readyProviders.length}</b>
          <small>Verified for use</small>
        </div>
        <div>
          <span>Connection health</span>
          <b>
            {connections.filter((c) => c.status === "connected").length}/
            {connections.length || 0}
          </b>
          <small>No simulated status</small>
        </div>
      </section>
    </>
  );
}

function CampaignsPage({ campaigns }: { campaigns: Campaign[] }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const shown = campaigns.filter(
    (campaign) =>
      (filter === "all" ||
        (filter === "active"
          ? ["scheduled", "live", "approved"].includes(campaign.status)
          : campaign.status === filter)) &&
      (!query.trim() ||
        campaign.name.toLowerCase().includes(query.trim().toLowerCase()) ||
        campaign.plan.channels.some((channel) =>
          channelLabels[channel]
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )),
  );
  return (
    <>
      <PageHeader
        title="Campaigns"
        detail="Draft, review, launch, and measure every channel together."
        action={
          <a className="button primary" href="/app/campaigns/new">
            <Plus size={18} /> Create campaign
          </a>
        }
      />
      <div className="filter-bar">
        <div className="segmented">
          {[
            ["all", "All"],
            ["active", "Active"],
            ["draft", "Drafts"],
            ["completed", "Completed"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={filter === key ? "active" : ""}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={17} />
          <input
            aria-label="Search campaigns"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <section className="comfortable-list">
        {shown.length ? (
          shown.map((campaign) => (
            <CampaignRow campaign={campaign} key={campaign.id} />
          ))
        ) : (
          <EmptyPage
            title="No campaigns here"
            detail="Create a campaign from a template or an AI objective."
            inline
          />
        )}
      </section>
    </>
  );
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  return (
    <a className="campaign-row" href={`/app/campaigns/${campaign.id}`}>
      <div className="campaign-icon">
        <Megaphone size={18} />
      </div>
      <div className="campaign-name">
        <strong>{campaign.name}</strong>
        <span>
          {campaign.plan.channels
            .map((channel) => channelLabels[channel])
            .join(" · ")}
        </span>
      </div>
      <StatusPill status={campaign.status} />
      <div className="campaign-date">
        <span>Updated</span>
        {new Date(campaign.updated_at).toLocaleDateString()}
      </div>
      <ArrowRight size={18} />
    </a>
  );
}

function CampaignCreator({
  workspace,
  products,
  media,
  accounts,
  messagingAudiences,
  messagingSettings,
  onCreated,
}: {
  workspace: Workspace;
  products: ProductService[];
  media: MediaAsset[];
  accounts: ProviderAccount[];
  messagingAudiences: MessagingAudience[];
  messagingSettings: MessagingSettings | null;
  onCreated: (id: string) => void;
}) {
  const [mode, setMode] = useState<"template" | "ai">("template");
  const [step, setStep] = useState(1);
  const [templateId, setTemplateId] = useState("bfcm");
  const [objective, setObjective] = useState("");
  const [name, setName] = useState("");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [offer, setOffer] = useState("");
  const [landingUrl, setLandingUrl] = useState(
    products[0]?.landing_url ?? workspace.website_url ?? "",
  );
  const [startDate, setStartDate] = useState(() =>
    new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  );
  const [channels, setChannels] = useState<ChannelKey[]>(
    getTemplate("bfcm")?.channels ?? ["instagram"],
  );
  const [dailyBudget, setDailyBudget] = useState("");
  const [targetCountries, setTargetCountries] = useState<Array<"US" | "CA">>(
    [workspace.currency === "CAD" ? "CA" : "US"],
  );
  const [tiktokPrivacy, setTiktokPrivacy] = useState("");
  const [tiktokCommentsEnabled, setTiktokCommentsEnabled] = useState(
    () =>
      !accounts.find(
        (account) => account.provider_key === "tiktok_organic",
      )?.capabilities.commentsDisabled,
  );
  const [messagingAudienceId, setMessagingAudienceId] = useState(messagingAudiences[0]?.id ?? "");
  const [advanced, setAdvanced] = useState(false);
  const [plan, setPlan] = useState<CampaignPlan | null>(null);
  const [renderedMedia, setRenderedMedia] = useState<MediaAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const availableTemplates = campaignTemplates.filter((template) =>
    template.businessTypes.includes(workspace.business_type),
  );
  const selectedTemplate = getTemplate(templateId);
  const product = products.find((item) => item.id === productId);
  const messagingAudience = messagingAudiences.find((item) => item.id === messagingAudienceId);
  const productMedia = media.filter(
    (item) =>
      item.product_service_id === productId &&
      ["product", "service", "brand"].includes(item.kind),
  );
  const tiktokAccount = accounts.find(
    (account) =>
      account.provider_key === "tiktok_organic" &&
      account.account_type === "creator",
  );
  const tiktokPrivacyOptions = Array.isArray(
    tiktokAccount?.capabilities.privacyOptions,
  )
    ? tiktokAccount.capabilities.privacyOptions.filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  const accountForChannel = useCallback(
    (channel: ChannelKey) => {
      const provider =
        channel === "meta_ads" ||
        channel === "facebook" ||
        channel === "instagram"
          ? "meta_business"
          : channel === "google_search" || channel === "google_display"
            ? "google_ads"
            : channel === "tiktok_ads"
              ? "tiktok_ads"
              : channel === "tiktok"
                ? "tiktok_organic"
                : channel === "reddit_ads"
                  ? "reddit_ads"
              : channel === "linkedin"
                ? "linkedin_pages"
                : channel === "email"
                  ? "sendgrid_email"
                  : channel === "sms"
                    ? "twilio_messaging"
                    : "chatgpt_ads";
      return (
        accounts.find(
          (account) =>
            account.provider_key === provider &&
            account.account_type ===
              (channel === "meta_ads" ||
              channel === "google_search" ||
              channel === "google_display" ||
              channel === "tiktok_ads" ||
              channel === "reddit_ads" ||
              channel === "chatgpt_ads"
                ? "ad_account"
                : channel === "facebook"
                  ? "facebook_page"
                  : channel === "instagram"
                    ? "instagram_professional"
                    : channel === "tiktok"
                      ? "creator"
                      : channel === "email"
                        ? "email_sender"
                        : channel === "sms"
                          ? "messaging_service"
                      : "organization_page"),
        )?.id ??
        null
      );
    },
    [accounts],
  );

  function buildTemplatePlan() {
    if (!selectedTemplate || !product)
      throw new Error(
        `Add and choose a real ${workspace.business_type === "ecommerce" ? "product" : "service"} first.`,
      );
    if (!offer.trim())
      throw new Error(
        "Add the real offer or value proposition for this campaign.",
      );
    new URL(landingUrl);
    const mediaId = productMedia[0]?.id ?? null;
    const templateVariables = {
      business: workspace.name,
      product: product.name,
      offer: offer.trim(),
      description:
        product.description ??
        `${product.name} from ${workspace.name}`,
    };
    const paidSelected = channels.some((channel) => PAID_CHANNELS.has(channel));
    const result: CampaignPlan = {
      name: name.trim() || `${product.name} — ${selectedTemplate.name}`,
      objective: `${selectedTemplate.outcome} Offer: ${offer.trim()}`,
      productServiceId: product.id,
      landingUrl,
      currency: workspace.currency,
      startsAt: new Date(`${startDate}T14:00:00.000Z`).toISOString(),
      endsAt: new Date(
        new Date(`${startDate}T14:00:00.000Z`).getTime() +
          selectedTemplate.durationDays * 86400000,
      ).toISOString(),
      dailyBudgetCents:
        paidSelected && dailyBudget
          ? Math.round(Number(dailyBudget) * 100)
          : null,
      lifetimeBudgetCents: null,
      channels,
      template: { id: selectedTemplate.id, version: selectedTemplate.version },
      content: selectedTemplate.assets
        .filter((asset) => channels.includes(asset.channel))
        .map((asset) => {
          const accountId = accountForChannel(asset.channel);
          const unresolvedFields: string[] = [];
          if (!["google_search", "sms"].includes(asset.channel) && !mediaId)
            unresolvedFields.push(`Upload a real image for ${product.name}`);
          if (PAID_CHANNELS.has(asset.channel) && !accountId)
            unresolvedFields.push("Select a real ad account");
          if (PAID_CHANNELS.has(asset.channel) && !dailyBudget)
            unresolvedFields.push("Set a paid budget");
          if (PAID_CHANNELS.has(asset.channel) && !targetCountries.length)
            unresolvedFields.push("Choose at least one target country");
          if (asset.channel === "tiktok" && !tiktokPrivacy)
            unresolvedFields.push("Choose a current creator privacy option");
          if (["email", "sms"].includes(asset.channel) && !messagingAudience)
            unresolvedFields.push("Choose a consented audience");
          if (["email", "sms"].includes(asset.channel) && !messagingSettings)
            unresolvedFields.push("Complete the legal sender identity");
          const headline = resolveTemplateText(
            asset.exampleHeadline,
            templateVariables,
          );
          const body = resolveTemplateText(
            asset.exampleBody,
            templateVariables,
          );
          const cta = resolveTemplateText(asset.cta, templateVariables);
          const design = resolveTacticDesign(asset.design, templateVariables);
          const messageBody = asset.channel === "sms"
            ? `${body} ${landingUrl} Reply STOP to unsubscribe.`.slice(0, 480)
            : body;
          const senderAccount = accounts.find((entry) => entry.id === accountId);
          const messaging = messagingAudience && messagingSettings && (asset.channel === "email" || asset.channel === "sms")
            ? {
                audienceId: messagingAudience.id,
                estimatedRecipients: messagingAudience.eligible[asset.channel],
                fromName: asset.channel === "email" ? String(senderAccount?.capabilities.fromName ?? messagingSettings.legal_business_name) : messagingSettings.legal_business_name,
                fromAddress: asset.channel === "email" ? String(senderAccount?.capabilities.fromAddress ?? "") || null : null,
                replyToAddress: asset.channel === "email" ? String(senderAccount?.capabilities.replyToAddress ?? "") || null : null,
                subject: asset.channel === "email" ? headline : null,
                preheader: asset.channel === "email" ? body.slice(0, 150) : null,
                html: asset.channel === "email" ? buildCampaignEmailHtml({ businessName: messagingSettings.legal_business_name, preheader: body.slice(0, 150), headline, body, cta, destinationUrl: landingUrl, physicalAddress: messagingSettings.physical_address, includeHeroImage: Boolean(mediaId), design }) : null,
                physicalAddress: asset.channel === "email" ? messagingSettings.physical_address : null,
                smsOptOutText: asset.channel === "sms" ? "Reply STOP to unsubscribe." : null,
              }
            : null;
          const slides =
            asset.slideCount > 1
              ? Array.from({ length: asset.slideCount }, (_, index) => ({
                  headline:
                    index === 0
                      ? headline
                      : index === asset.slideCount - 1
                        ? offer.trim()
                        : `${product.name} · ${index + 1}`,
                  body:
                    index === asset.slideCount - 1
                      ? `Learn more at ${new URL(landingUrl).hostname}`
                      : (product.description ?? body),
                  mediaId,
                }))
              : [];
          return {
            id: crypto.randomUUID(),
            templateStepId: asset.id,
            stepLabel: asset.stepLabel,
            tacticStage: asset.stage,
            channel: asset.channel,
            format: asset.format,
            headline,
            body: messageBody,
            cta,
            destinationUrl: landingUrl,
            carouselSlides: slides,
            searchHeadlines:
              asset.channel === "google_search"
                ? [
                    headline.slice(0, 30),
                    `${product.name} Official`.slice(0, 30),
                    `${offer.trim()} Today`.slice(0, 30),
                  ]
                : undefined,
            searchDescriptions:
              asset.channel === "google_search"
                ? [
                    body.slice(0, 90),
                    `${product.description ?? product.name}. ${asset.cta}.`.slice(0, 90),
                ]
                : undefined,
            searchKeywords:
              asset.channel === "google_search"
                ? [product.name, `${product.name} ${offer.trim()}`]
                : undefined,
            mediaIds: mediaId ? [mediaId] : [],
            accountId,
            targeting: PAID_CHANNELS.has(asset.channel)
              ? { countries: targetCountries }
              : {},
            publishingOptions:
              asset.channel === "tiktok"
                ? {
                    privacy: tiktokPrivacy || null,
                    commentsEnabled: tiktokCommentsEnabled,
                  }
                : null,
            messaging,
            scheduledFor: tacticDate(
              startDate,
              asset.dayOffset,
              asset.sendTime,
            ),
            unresolvedFields,
            design,
            scene: mediaId && asset.channel !== "sms"
              ? {
                  width: asset.aspectRatio === "1.91:1" ? 1200 : 1080,
                  height:
                    asset.aspectRatio === "1.91:1"
                      ? 628
                      : asset.aspectRatio === "4:5"
                        ? 1350
                        : 1080,
                  layers: [
                    { kind: "background" as const, color: design.background },
                    {
                      kind: "subject" as const,
                      mediaId,
                      x: 80,
                      y: 190,
                      width: 920,
                      height: 740,
                      preserveOriginal: true as const,
                    },
                    {
                      kind: "text" as const,
                      text: headline,
                      role: "headline" as const,
                      x: 72,
                      y: 70,
                      width: 936,
                      color: design.textColor,
                      align: "left" as const,
                    },
                  ],
                }
              : null,
          };
        }),
    };
    return result;
  }

  async function storeRenderedFrame(
    blob: Blob,
    label: string,
    width: number,
    height: number,
  ) {
    if (!product)
      throw new Error("Choose a product or service before rendering.");
    return uploadRenderedAsset({
      workspaceId: workspace.id,
      productServiceId: product.id,
      blob,
      label,
      width,
      height,
    });
  }

  async function prepareRenderedPlan(draft: CampaignPlan) {
    const source = productMedia[0];
    if (!source?.url) return draft;
    const created: MediaAsset[] = [];
    const content: CampaignPlan["content"] = [];
    for (const item of draft.content) {
      if (item.channel === "google_search" || item.channel === "sms" || item.channel === "email") {
        content.push(item);
        continue;
      }
      const width = item.scene?.width ?? 1080;
      const height = item.scene?.height ?? 1080;
      const frames = item.channel === "google_display"
        ? [
            { headline: item.headline, body: item.body, label: "google-display-landscape", width: 1200, height: 628 },
            { headline: item.headline, body: item.body, label: "google-display-square", width: 1200, height: 1200 },
          ]
        : item.carouselSlides.length
          ? item.carouselSlides.map((slide, index) => ({
            headline: slide.headline,
            body: slide.body,
            label: `${item.channel}-slide-${index + 1}`,
            width,
            height,
          }))
          : [
              {
                headline: item.headline,
                body: item.body,
                label: `${item.channel}-creative`,
                width,
                height,
              },
            ];
      const assets: MediaAsset[] = [];
      for (const frame of frames) {
        const blob = await renderCreativeBlob({
          sourceUrl: source.url,
          width: frame.width,
          height: frame.height,
          headline: frame.headline,
          body: frame.body,
          design: item.design,
        });
        assets.push(
          await storeRenderedFrame(
            blob,
            frame.label,
            frame.width,
            frame.height,
          ),
        );
      }
      created.push(...assets);
      content.push({
        ...item,
        mediaIds: assets.map((asset) => asset.id),
        carouselSlides: item.carouselSlides.map((slide, index) => ({
          ...slide,
          mediaId: assets[index]?.id ?? null,
        })),
        unresolvedFields: item.unresolvedFields.filter(
          (field) => !field.toLowerCase().includes("image"),
        ),
      });
    }
    setRenderedMedia((current) => [...current, ...created]);
    return { ...draft, content };
  }

  async function buildAiPlan() {
    if (!product)
      throw new Error(
        `Add and choose a real ${workspace.business_type === "ecommerce" ? "product" : "service"} first.`,
      );
    if (objective.trim().length < 10)
      throw new Error(
        "Describe the campaign objective in at least 10 characters.",
      );
    new URL(landingUrl);
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/v1/ai/campaign", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: workspace.id,
          objective,
          businessName: workspace.name,
          brandSummary: "",
          brandVoice: {},
          product: {
            id: product.id,
            name: product.name,
            description: product.description ?? "",
            mediaIds: productMedia.map((item) => item.id),
          },
          channels,
          landingUrl,
          startsAt: new Date(`${startDate}T14:00:00.000Z`).toISOString(),
          endsAt: null,
          currency: workspace.currency,
          dailyBudgetCents: dailyBudget
            ? Math.round(Number(dailyBudget) * 100)
            : null,
          lifetimeBudgetCents: null,
          accountIds: Object.fromEntries(
            channels
              .map((channel) => [channel, accountForChannel(channel)])
              .filter((entry) => entry[1]),
          ),
          targetCountries,
          tiktokPublishingOptions: {
            privacy: tiktokPrivacy || null,
            commentsEnabled: tiktokCommentsEnabled,
          },
          messaging: messagingAudience && messagingSettings ? {
            audienceId: messagingAudience.id,
            eligible: messagingAudience.eligible,
            legalBusinessName: messagingSettings.legal_business_name,
            physicalAddress: messagingSettings.physical_address,
            fromName: String(accounts.find((entry) => entry.id === accountForChannel("email"))?.capabilities.fromName ?? messagingSettings.legal_business_name),
            fromAddress: String(accounts.find((entry) => entry.id === accountForChannel("email"))?.capabilities.fromAddress ?? "") || null,
            replyToAddress: String(accounts.find((entry) => entry.id === accountForChannel("email"))?.capabilities.replyToAddress ?? "") || null,
          } : null,
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        data?: { plan: CampaignPlan };
        errors?: Array<{ message: string }>;
      };
      if (!result.ok || !result.data)
        throw new Error(result.errors?.[0]?.message ?? "AI generation failed.");
      const rendered = await prepareRenderedPlan(result.data.plan);
      setPlan(rendered);
      setName(rendered.name);
      setStep(3);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "AI generation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function review() {
    setError("");
    setBusy(true);
    try {
      if (mode === "template") {
        setPlan(buildTemplatePlan());
        setStep(3);
      } else await buildAiPlan();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not build campaign.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!plan) return;
    setBusy(true);
    setError("");
    try {
      const prepared = await prepareRenderedPlan({
        ...plan,
        content: plan.content.map((item) =>
          item.channel === "email" && item.messaging?.physicalAddress
            ? {
                ...item,
                messaging: {
                  ...item.messaging,
                  subject: item.headline,
                  preheader: item.body.slice(0, 150),
                  html: buildCampaignEmailHtml({
                    businessName: item.messaging.fromName ?? workspace.name,
                    preheader: item.body.slice(0, 150),
                    headline: item.headline,
                    body: item.body,
                    cta: item.cta,
                    destinationUrl: item.destinationUrl,
                    physicalAddress: item.messaging.physicalAddress,
                    includeHeroImage: item.mediaIds.length > 0,
                    design: item.design,
                  }),
                },
              }
            : item,
        ),
      });
      const response = await authenticatedFetch("/api/v1/campaigns", {
        method: "POST",
        body: JSON.stringify({ workspaceId: workspace.id, plan: prepared }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        data?: { campaignId: string };
        errors?: Array<{ message: string }>;
      };
      if (!result.ok || !result.data)
        throw new Error(
          result.errors?.[0]?.message ?? "Campaign could not be created.",
        );
      onCreated(result.data.campaignId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Campaign could not be created.",
      );
      setBusy(false);
    }
  }
  function selectTemplate(id: string) {
    const selected = getTemplate(id);
    setTemplateId(id);
    if (selected) setChannels(selected.channels);
  }
  function toggleChannel(channel: ChannelKey) {
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel],
    );
  }

  return (
    <div className="creator">
      <a className="back-link" href="/app/campaigns">
        <ArrowLeft size={17} /> Campaigns
      </a>
      <div className="creator-heading">
        <div>
          <p className="kicker">Step {step} of 3</p>
          <h1>
            {step === 1
              ? "How do you want to start?"
              : step === 2
                ? "Add the campaign essentials"
                : "Edit every step before you say yes"}
          </h1>
        </div>
        <div className="step-dots">
          <span className={step >= 1 ? "done" : ""} />
          <span className={step >= 2 ? "done" : ""} />
          <span className={step >= 3 ? "done" : ""} />
        </div>
      </div>
      {error && (
        <div className="notice error">
          <CircleAlert size={18} />
          {error}
        </div>
      )}
      {step === 1 && (
        <>
          <div className="creator-mode">
            <button
              className={mode === "template" ? "active" : ""}
              onClick={() => setMode("template")}
            >
              <Layers3 size={19} />
              <span>
                <b>Start with a template</b>
                <small>
                  Professionally planned bundles with real channel previews
                </small>
              </span>
            </button>
            <button
              className={mode === "ai" ? "active" : ""}
              onClick={() => setMode("ai")}
            >
              <WandSparkles size={19} />
              <span>
                <b>Create a custom campaign with AI</b>
                <small>
                  One objective becomes an editable, never auto-approved draft
                </small>
              </span>
            </button>
          </div>
          {mode === "template" ? (
            <>
              <div className="template-grid">
                {availableTemplates.map((template) => (
                  <button
                    key={template.id}
                    className={`template-card ${templateId === template.id ? "selected" : ""}`}
                    onClick={() => selectTemplate(template.id)}
                  >
                    <TemplatePreview templateId={template.id} />
                    <div className="template-card-copy">
                      <span className="template-check">
                        {templateId === template.id && <Check size={15} />}
                      </span>
                      <h3>{template.name}</h3>
                      <p>{template.summary}</p>
                      <div>
                        <span>{template.durationDays} days</span>
                        <span>{template.assets.length} timed steps</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {selectedTemplate && (
                <TemplateSequencePreview template={selectedTemplate} />
              )}
            </>
          ) : (
            <div className="objective-card">
              <Sparkles size={22} />
              <label>
                What should this campaign accomplish?
                <textarea
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="Example: Introduce our new winter skincare set to Canadian customers and drive first purchases without discounting the brand."
                  rows={5}
                />
              </label>
              <p>
                AI uses your confirmed brand, real product details, selected
                channels, and account capabilities. It cannot publish or change
                budgets.
              </p>
            </div>
          )}
          <div className="creator-actions">
            <span />
            <button className="button primary" onClick={() => setStep(2)}>
              Customize <ArrowRight size={18} />
            </button>
          </div>
        </>
      )}
      {step === 2 && (
        <div className="essentials-layout">
          <section className="form-panel">
            <div className="form-grid">
              <label className="span-2">
                Campaign name <em>Optional</em>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={selectedTemplate?.name ?? "AI campaign"}
                />
              </label>
              {mode === "ai" && (
                <label className="span-2">
                  Objective
                  <textarea
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    rows={4}
                  />
                </label>
              )}
              <label className="span-2">
                {workspace.business_type === "ecommerce"
                  ? "Product"
                  : "Service"}
                <select
                  value={productId}
                  onChange={(e) => {
                    setProductId(e.target.value);
                    const selected = products.find(
                      (item) => item.id === e.target.value,
                    );
                    if (selected?.landing_url)
                      setLandingUrl(selected.landing_url);
                  }}
                  required
                >
                  <option value="">Choose one</option>
                  {products.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {!products.length && (
                  <a className="field-link" href="/app/manage/brand">
                    Add your first{" "}
                    {workspace.business_type === "ecommerce"
                      ? "product"
                      : "service"}
                  </a>
                )}
              </label>
              {mode === "template" && (
                <label className="span-2">
                  Offer or value proposition
                  <input
                    value={offer}
                    onChange={(e) => setOffer(e.target.value)}
                    placeholder="25% off through Sunday, or Free 30-minute consultation"
                    required
                  />
                </label>
              )}
              <label className="span-2">
                Landing URL
                <input
                  type="url"
                  value={landingUrl}
                  onChange={(e) => setLandingUrl(e.target.value)}
                  placeholder="https://yourbusiness.com/offer"
                  required
                />
              </label>
              <label>
                Start date
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </label>
              <div />
              <fieldset className="span-2 channel-picker">
                <legend>Channels</legend>
                {(mode === "template"
                  ? selectedTemplate?.channels ?? []
                  : CHANNEL_KEYS
                ).map((channel) => (
                  <label
                    key={channel}
                    className={channels.includes(channel) ? "selected" : ""}
                  >
                    <input
                      type="checkbox"
                      checked={channels.includes(channel)}
                      onChange={() => toggleChannel(channel)}
                    />
                    <span>{channelLabels[channel]}</span>
                    {PAID_CHANNELS.has(channel) && <small>Paid</small>}
                  </label>
                ))}
              </fieldset>
              {channels.some((channel) => channel === "email" || channel === "sms") && (
                <fieldset className="span-2 tiktok-publishing-options">
                  <legend>Email & SMS audience</legend>
                  {messagingAudiences.length ? (
                    <label>
                      Consented contact list
                      <select value={messagingAudienceId} onChange={(event) => setMessagingAudienceId(event.target.value)} required>
                        <option value="">Choose a list</option>
                        {messagingAudiences.map((audience) => (
                          <option value={audience.id} key={audience.id}>
                            {audience.name} · {audience.eligible.email} email · {audience.eligible.sms} SMS
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div className="notice warning">
                      Import contacts with explicit consent before adding email or SMS. <a href="/app/manage/contacts">Manage contacts</a>
                    </div>
                  )}
                  {!messagingSettings && (
                    <p>Add your legal sender name, physical address, and quiet hours under Contacts & consent.</p>
                  )}
                </fieldset>
              )}
              {channels.includes("tiktok") && (
                <fieldset className="span-2 tiktok-publishing-options">
                  <legend>TikTok publishing consent</legend>
                  {tiktokPrivacyOptions.length ? (
                    <>
                      <label>
                        Who can view this post?
                        <select
                          value={tiktokPrivacy}
                          onChange={(event) =>
                            setTiktokPrivacy(event.target.value)
                          }
                          required
                        >
                          <option value="">Choose the creator’s current option</option>
                          {tiktokPrivacyOptions.map((option) => (
                            <option value={option} key={option}>
                              {option.replaceAll("_", " ").toLowerCase()}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="inline-check">
                        <input
                          type="checkbox"
                          checked={tiktokCommentsEnabled}
                          disabled={Boolean(
                            tiktokAccount?.capabilities.commentsDisabled,
                          )}
                          onChange={(event) =>
                            setTiktokCommentsEnabled(event.target.checked)
                          }
                        />
                        Allow comments on this post
                      </label>
                      <p>
                        These settings came from the connected creator and are
                        validated again immediately before publishing.
                      </p>
                    </>
                  ) : (
                    <div className="notice warning">
                      Reconnect TikTok to load the creator’s current privacy
                      choices. Approval stays blocked until one is selected.
                    </div>
                  )}
                </fieldset>
              )}
              <div className="span-2 advanced">
                <button type="button" onClick={() => setAdvanced(!advanced)}>
                  Advanced settings{" "}
                  <ChevronDown size={17} className={advanced ? "rotate" : ""} />
                </button>
                {advanced && (
                  <div className="advanced-fields">
                    <label>
                      Daily paid budget ({workspace.currency})
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={dailyBudget}
                        onChange={(e) => setDailyBudget(e.target.value)}
                        placeholder="50"
                      />
                    </label>
                    <fieldset className="country-targeting">
                      <legend>Paid audience countries</legend>
                      {(["US", "CA"] as const).map((country) => (
                        <label key={country}>
                          <input
                            type="checkbox"
                            checked={targetCountries.includes(country)}
                            onChange={() =>
                              setTargetCountries((current) =>
                                current.includes(country)
                                  ? current.filter((entry) => entry !== country)
                                  : [...current, country],
                              )
                            }
                          />
                          {country === "US" ? "United States" : "Canada"}
                        </label>
                      ))}
                    </fieldset>
                    <div className="account-summary">
                      <b>Destination accounts</b>
                      <p>
                        {channels
                          .filter((c) => PAID_CHANNELS.has(c))
                          .map(
                            (channel) =>
                              `${channelLabels[channel]}: ${accounts.find((a) => a.id === accountForChannel(channel))?.name ?? "Not connected"}`,
                          )
                          .join(" · ") || "No paid channels selected"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
          <aside className="product-preview-panel">
            <h3>Selected creative subject</h3>
            {product && productMedia[0]?.url ? (
              <img src={productMedia[0].url} alt={product.name} />
            ) : (
              <div className="missing-media">
                <ImagePlus size={28} />
                <b>No real image selected</b>
                <p>Approval will remain blocked until you upload one.</p>
                <a href="/app/manage/brand">Add image</a>
              </div>
            )}
            <p>
              The subject image is preserved. AI can create an optional
              background, but it cannot redraw the product.
            </p>
          </aside>
          <div className="creator-actions span-all">
            <button className="button secondary" onClick={() => setStep(1)}>
              <ArrowLeft size={17} /> Back
            </button>
            <button
              className="button primary"
              disabled={busy || !channels.length}
              onClick={() => void review()}
            >
              {busy ? (
                <>
                  <Loader2 className="spin" size={18} />
                  Generating real draft…
                </>
              ) : (
                <>
                  Review campaign <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </div>
      )}
      {step === 3 && plan && (
        <div>
          <TacticEditor
            plan={plan}
            media={[...media, ...renderedMedia]}
            accounts={accounts}
            onChange={setPlan}
          />
          <div className="creator-actions">
            <button className="button secondary" onClick={() => setStep(2)}>
              <ArrowLeft size={17} /> Edit essentials
            </button>
            <button
              className="button primary"
              onClick={() => void save()}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="spin" size={18} />
                  Saving…
                </>
              ) : (
                <>
                  Create draft campaign <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplatePreview({ templateId }: { templateId: string }) {
  const colors: Record<string, string[]> = {
    bfcm: ["#111", "#E9D7A1"],
    halloween: ["#261342", "#FF8A3D"],
    holiday: ["#173E36", "#EED8B3"],
    "product-launch": ["#E8E5DE", "#145B55"],
    "service-launch": ["#E9EEF7", "#244F84"],
    "limited-offer": ["#F4CEC4", "#8D2F24"],
    consultation: ["#E8F0EA", "#225845"],
    "local-awareness": ["#E9DAB8", "#2C4D3F"],
    testimonial: ["#F3EFE8", "#5B4636"],
    "event-webinar": ["#DBE4F5", "#283C65"],
    "educational-carousel": ["#E1E9DF", "#173C32"],
    "evergreen-traffic": ["#E9E6DC", "#23433A"],
  };
  const [bg, ink] = colors[templateId] ?? ["#eee", "#222"];
  const template = getTemplate(templateId);
  const example = template?.assets[0];
  if (!template || !example) return null;
  return (
    <div className="template-visual" style={{ background: bg, color: ink }}>
      <div className="template-platform-row">
        <span className="mini-avatar" />
        <div>
          <b>Your business</b>
          <small>{channelLabels[example.channel]}</small>
        </div>
        <MoreHorizontal size={14} />
      </div>
      <div className="template-subject-slot">
        <ImagePlus size={20} />
        <b>Your product or service</b>
        <small>Replaced with your uploaded image</small>
      </div>
      <div className="template-example-copy">
        <b>{example.exampleHeadline}</b>
        <p>{example.exampleBody}</p>
        <span>{example.cta}</span>
      </div>
      {example.slideCount > 1 && (
        <div className="template-carousel-count">1 / {example.slideCount}</div>
      )}
    </div>
  );
}

function TemplateSequencePreview({
  template,
}: {
  template: NonNullable<ReturnType<typeof getTemplate>>;
}) {
  return (
    <section className="template-sequence-preview">
      <header>
        <div>
          <p className="kicker">Ready-to-edit tactic</p>
          <h2>See the full {template.name} campaign</h2>
          <p>{template.sequenceSummary}</p>
        </div>
        <span>{template.assets.length} coordinated steps</span>
      </header>
      <div className="template-sequence-track">
        {template.assets.map((asset, index) => {
          const design = asset.design;
          const isEmail = asset.channel === "email";
          const isSms = asset.channel === "sms";
          const isSearch = asset.channel === "google_search";
          return (
            <article key={asset.id}>
              <div className="template-sequence-meta">
                <b>{index + 1}. {asset.stepLabel}</b>
                <span>Day {asset.dayOffset + 1} · {asset.sendTime} · {channelLabels[asset.channel]}</span>
              </div>
              {isSms ? (
                <div className="template-sms-mini">
                  <span>SMS</span>
                  <p>{asset.exampleBody}</p>
                  <small>Reply STOP to unsubscribe</small>
                </div>
              ) : isSearch ? (
                <div className="template-search-mini">
                  <small>Sponsored · yourbusiness.com</small>
                  <b>{asset.exampleHeadline}</b>
                  <p>{asset.exampleBody}</p>
                </div>
              ) : (
                <div
                  className={`template-creative-mini ${isEmail ? "is-email" : ""}`}
                  style={{ background: design.background, color: design.textColor }}
                >
                  {isEmail && <div className="template-email-meta"><span>Subject</span><b>{asset.exampleHeadline}</b></div>}
                  <div className="template-mini-copy">
                    <small style={{ color: design.accent }}>{asset.stepLabel}</small>
                    <b>{asset.exampleHeadline}</b>
                    <p>{asset.exampleBody}</p>
                    <span style={{ background: design.accent }}>{asset.cta}</span>
                  </div>
                  <div className="template-mini-product" style={{ background: design.surface }}>
                    <ImagePlus size={22} />
                    <small>Your uploaded image</small>
                  </div>
                  {asset.slideCount > 1 && <em>1 / {asset.slideCount} slides</em>}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <footer>
        <Check size={16} />
        <span>Your product image, offer, links, sender, accounts, and dates replace every placeholder before approval.</span>
      </footer>
    </section>
  );
}

function ReviewSummary({
  plan,
  media,
  accounts,
  onEdit,
  onDecision,
}: {
  plan: CampaignPlan;
  media: MediaAsset[];
  accounts: ProviderAccount[];
  onEdit?: (item: CampaignPlan["content"][number]) => void;
  onDecision?: (item: CampaignPlan["content"][number]) => void;
}) {
  const blockers = approvalBlockers(plan);
  return (
    <>
      <section className="review-overview">
        <div>
          <p className="kicker">Campaign bundle</p>
          <h2>{plan.name}</h2>
          <p>{plan.objective}</p>
        </div>
        <div className="review-counts">
          <span>
            <b>{plan.content.length}</b> channel items
          </span>
          <span>
            <b>
              {plan.content.reduce(
                (sum, item) => sum + Math.max(1, item.carouselSlides.length),
                0,
              )}
            </b>{" "}
            final frames
          </span>
          <span>
            <b>
              {plan.currency}{" "}
              {plan.dailyBudgetCents
                ? (plan.dailyBudgetCents / 100).toFixed(0) + "/day"
                : "No paid budget"}
            </b>{" "}
            budget
          </span>
        </div>
      </section>
      {blockers.length > 0 && (
        <div className="notice warning">
          <CircleAlert size={19} />
          <div>
            <strong>
              Approval will be blocked until {blockers.length} item
              {blockers.length === 1 ? " is" : "s are"} resolved
            </strong>
            <ul>
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="channel-review-list">
        {plan.content.map((item) => (
          <ChannelPreview
            key={item.id}
            item={item}
            media={media}
            account={accounts.find((account) => account.id === item.accountId)}
            currency={plan.currency}
            budget={plan.dailyBudgetCents}
            onEdit={onEdit ? () => onEdit(item) : undefined}
            onDecision={onDecision ? () => onDecision(item) : undefined}
          />
        ))}
      </div>
    </>
  );
}

function ChannelPreview({
  item,
  media,
  account,
  currency,
  budget,
  onEdit,
  onDecision,
}: {
  item: CampaignPlan["content"][number];
  media: MediaAsset[];
  account?: ProviderAccount;
  currency: string;
  budget: number | null;
  onEdit?: () => void;
  onDecision?: () => void;
}) {
  const asset = media.find((entry) => item.mediaIds.includes(entry.id));
  const isSearch = item.channel === "google_search";
  const isEmail = item.channel === "email";
  const isSms = item.channel === "sms";
  const smsInfo = isSms ? smsSegmentCount(item.body) : null;
  return (
    <article className="channel-review">
      <header>
        <div>
          <span className="channel-mark">
            {channelLabels[item.channel].slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h3>{channelLabels[item.channel]}</h3>
            <p>{item.format.replaceAll("_", " ")}</p>
          </div>
        </div>
        <div className="preview-actions">
          {item.unresolvedFields.length ? (
            <span className="status warning">Needs details</span>
          ) : (
            <span className="status ready">
              <Check size={14} /> Ready for approval
            </span>
          )}
          {onEdit && (
            <button className="button secondary compact" onClick={onEdit}>
              Edit
            </button>
          )}
          {onDecision && (
            <button
              className="button secondary compact"
              onClick={onDecision}
            >
              Decide
            </button>
          )}
        </div>
      </header>
      <div className="preview-and-details">
        <div className={`publication-preview ${isSearch ? "search-ad" : isEmail ? "email-preview" : isSms ? "sms-preview" : ""}`}>
          {isEmail ? (
            <div className="email-client-preview">
              <div className="email-inbox-line"><b>From</b> {item.messaging?.fromName ?? "Sender"} &lt;{item.messaging?.fromAddress ?? "verified sender required"}&gt;</div>
              <div className="email-inbox-line"><b>Subject</b> {item.messaging?.subject ?? item.headline}</div>
              <div className="email-message">
                {asset?.url ? <img src={asset.url} alt="Selected campaign product or service" /> : <div className="asset-placeholder">Real image required</div>}
                <h4>{item.headline}</h4>
                <p>{item.body}</p>
                <a href={item.destinationUrl}>{item.cta}</a>
                <small>{item.messaging?.physicalAddress}<br />Unsubscribe</small>
              </div>
            </div>
          ) : isSms ? (
            <div className="phone-message-preview">
              <div className="phone-top">SMS preview</div>
              <div className="message-bubble">{item.body}</div>
              <small>{smsInfo?.characters} characters · {smsInfo?.segments} segment{smsInfo?.segments === 1 ? "" : "s"} · {smsInfo?.encoding}</small>
            </div>
          ) : isSearch ? (
            <>
              <small>Sponsored · {new URL(item.destinationUrl).hostname}</small>
              <h4>{(item.searchHeadlines ?? [item.headline]).join(" | ")}</h4>
              {(item.searchDescriptions ?? [item.body]).map((description) => (
                <p key={description}>{description}</p>
              ))}
              <div className="search-keywords">
                {(item.searchKeywords ?? []).map((keyword) => (
                  <span key={keyword}>{keyword}</span>
                ))}
              </div>
              <div className="search-links">
                <span>{item.cta}</span>
                <span>Learn more</span>
              </div>
            </>
          ) : (
            <>
              <div className="social-chrome">
                <span className="mini-avatar" />
                <b>{channelLabels[item.channel]} preview</b>
                <MoreHorizontal size={16} />
              </div>
              {asset?.url ? (
                <img
                  src={asset.url}
                  alt="Selected campaign product or service"
                />
              ) : (
                <div className="asset-placeholder">
                  <ImagePlus size={28} />
                  <span>Real image required</span>
                </div>
              )}
              <div className="social-copy">
                <b>{item.headline}</b>
                <p>{item.body}</p>
                <button>{item.cta}</button>
              </div>
              {item.carouselSlides.length > 1 && (
                <div className="carousel-strip">
                  {item.carouselSlides.map((slide, index) => (
                    <div
                      key={`${item.id}-${index}`}
                      className={index === 0 ? "current" : ""}
                    >
                      <b>{index + 1}</b>
                      <span>{slide.headline}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <dl className="delivery-facts">
          <div>
            <dt>Account</dt>
            <dd>{account?.name ?? "Not selected"}</dd>
          </div>
          {(isEmail || isSms) && (
            <div>
              <dt>Audience</dt>
              <dd>{item.messaging?.estimatedRecipients ?? 0} eligible recipient{item.messaging?.estimatedRecipients === 1 ? "" : "s"}</dd>
            </div>
          )}
          <div>
            <dt>Destination</dt>
            <dd>
              <a href={item.destinationUrl} target="_blank" rel="noreferrer">
                {new URL(item.destinationUrl).hostname} <Link2 size={13} />
              </a>
            </dd>
          </div>
          {PAID_CHANNELS.has(item.channel) && (
            <>
              <div>
                <dt>Budget</dt>
                <dd>
                  {budget
                    ? `${currency} ${(budget / 100).toFixed(2)} / day`
                    : "Not set"}
                </dd>
              </div>
              <div>
                <dt>Targeting</dt>
                <dd>
                  {Array.isArray(item.targeting.countries)
                    ? item.targeting.countries
                        .map((country) =>
                          country === "US"
                            ? "United States"
                            : country === "CA"
                              ? "Canada"
                              : String(country),
                        )
                        .join(", ")
                    : "Not configured"}
                </dd>
              </div>
            </>
          )}
          {item.channel === "tiktok" && (
            <>
              <div>
                <dt>Privacy</dt>
                <dd>
                  {item.publishingOptions?.privacy
                    ?.replaceAll("_", " ")
                    .toLowerCase() ?? "Not selected"}
                </dd>
              </div>
              <div>
                <dt>Comments</dt>
                <dd>
                  {item.publishingOptions?.commentsEnabled
                    ? "Allowed"
                    : "Disabled"}
                </dd>
              </div>
            </>
          )}
          <div>
            <dt>Schedule</dt>
            <dd>
              {item.scheduledFor
                ? new Date(item.scheduledFor).toLocaleString()
                : "Uses campaign dates"}
            </dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

function ContentEditor({
  campaign,
  workspace,
  item,
  media,
  accounts,
  onClose,
  onSaved,
}: {
  campaign: Campaign;
  workspace: Workspace;
  item: CampaignPlan["content"][number];
  media: MediaAsset[];
  accounts: ProviderAccount[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [headline, setHeadline] = useState(item.headline);
  const [body, setBody] = useState(item.body);
  const [cta, setCta] = useState(item.cta);
  const [destinationUrl, setDestinationUrl] = useState(item.destinationUrl);
  const [slides, setSlides] = useState(item.carouselSlides);
  const [searchHeadlines, setSearchHeadlines] = useState(
    item.searchHeadlines ?? [],
  );
  const [searchDescriptions, setSearchDescriptions] = useState(
    item.searchDescriptions ?? [],
  );
  const [searchKeywords, setSearchKeywords] = useState(
    item.searchKeywords ?? [],
  );
  const [scheduledFor, setScheduledFor] = useState(() => {
    if (!item.scheduledFor) return "";
    const date = new Date(item.scheduledFor);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  });
  const [targetCountries, setTargetCountries] = useState<Array<"US" | "CA">>(
    Array.isArray(item.targeting.countries)
      ? item.targeting.countries.filter(
          (country): country is "US" | "CA" =>
            country === "US" || country === "CA",
        )
      : [],
  );
  const [tiktokPrivacy, setTiktokPrivacy] = useState(
    item.publishingOptions?.privacy ?? "",
  );
  const [tiktokCommentsEnabled, setTiktokCommentsEnabled] = useState(
    (item.publishingOptions?.commentsEnabled ?? true) &&
      !accounts.find((account) => account.id === item.accountId)?.capabilities
        .commentsDisabled,
  );
  const tiktokAccount = accounts.find(
    (account) => account.id === item.accountId,
  );
  const tiktokPrivacyOptions = Array.isArray(
    tiktokAccount?.capabilities.privacyOptions,
  )
    ? tiktokAccount.capabilities.privacyOptions.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [aiInstruction, setAiInstruction] = useState("");
  const [acceptedAiRunId, setAcceptedAiRunId] = useState<string | null>(null);

  async function refine() {
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/v1/ai/refine", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: workspace.id,
          campaignId: campaign.id,
          contentItemId: item.id,
          channel: item.channel,
          instruction: aiInstruction,
          current: { headline, body, cta },
          brandSummary: "",
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        data?: { headline: string; body: string; cta: string; aiRunId: string };
        errors?: Array<{ message: string }>;
      };
      if (!result.ok || !result.data)
        throw new Error(result.errors?.[0]?.message ?? "AI refinement failed.");
      setHeadline(result.data.headline);
      setBody(result.data.body);
      setCta(result.data.cta);
      setAcceptedAiRunId(result.data.aiRunId);
      if (item.channel === "google_search") {
        setSearchHeadlines((current) =>
          current.map((entry, index) =>
            index === 0 ? result.data!.headline.slice(0, 30) : entry,
          ),
        );
        setSearchDescriptions((current) =>
          current.map((entry, index) =>
            index === 0 ? result.data!.body.slice(0, 90) : entry,
          ),
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI refinement failed.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      new URL(destinationUrl);
      const nextDesign = item.design
        ? {
            ...item.design,
            blocks: item.design.blocks.map((block) =>
              block.kind === "headline"
                ? { ...block, text: headline.trim() }
                : block.kind === "body"
                  ? { ...block, text: body.trim() }
                  : block.kind === "button"
                    ? { ...block, text: cta.trim() }
                    : block,
            ),
          }
        : item.design;
      let nextMediaIds = item.mediaIds;
      let nextSlides = slides;
      if (!["google_search", "email", "sms"].includes(item.channel)) {
        const subjectId = item.scene?.layers.find(
          (layer) => layer.kind === "subject",
        )?.mediaId;
        const source =
          media.find((asset) => asset.id === subjectId) ??
          media.find(
            (asset) =>
              asset.product_service_id === campaign.plan.productServiceId &&
              ["product", "service", "brand"].includes(asset.kind),
          );
        if (!source?.url)
          throw new Error(
            "The original product or service image is unavailable. Upload it again before editing this creative.",
          );
        const width = item.scene?.width ?? 1080;
        const height = item.scene?.height ?? 1080;
        const frames = item.channel === "google_display"
          ? [
              { headline, body, label: `google-display-v-${Date.now()}-landscape`, width: 1200, height: 628 },
              { headline, body, label: `google-display-v-${Date.now()}-square`, width: 1200, height: 1200 },
            ]
          : slides.length
            ? slides.map((slide, index) => ({
              headline: slide.headline,
              body: slide.body,
              label: `${item.channel}-v-${Date.now()}-${index + 1}`,
              width,
              height,
            }))
            : [
                {
                  headline,
                  body,
                  label: `${item.channel}-v-${Date.now()}`,
                  width,
                  height,
                },
              ];
        const assets: MediaAsset[] = [];
        for (const frame of frames) {
          const blob = await renderCreativeBlob({
            sourceUrl: source.url,
            width: frame.width,
            height: frame.height,
            headline: frame.headline,
            body: frame.body,
            design: nextDesign,
          });
          assets.push(
            await uploadRenderedAsset({
              workspaceId: workspace.id,
              productServiceId: campaign.plan.productServiceId,
              blob,
              label: frame.label,
              width: frame.width,
              height: frame.height,
            }),
          );
        }
        nextMediaIds = assets.map((asset) => asset.id);
        nextSlides = slides.map((slide, index) => ({
          ...slide,
          mediaId: assets[index]?.id ?? null,
        }));
      }
      const nextItem: CampaignPlan["content"][number] = {
        ...item,
        headline: headline.trim(),
        body: body.trim(),
        cta: cta.trim(),
        destinationUrl,
        scheduledFor: scheduledFor
          ? new Date(scheduledFor).toISOString()
          : null,
        carouselSlides: nextSlides,
        searchHeadlines:
          item.channel === "google_search" ? searchHeadlines : undefined,
        searchDescriptions:
          item.channel === "google_search" ? searchDescriptions : undefined,
        searchKeywords:
          item.channel === "google_search" ? searchKeywords : undefined,
        mediaIds: nextMediaIds,
        targeting: PAID_CHANNELS.has(item.channel)
          ? { ...item.targeting, countries: targetCountries }
          : item.targeting,
        publishingOptions:
          item.channel === "tiktok"
            ? {
                privacy: tiktokPrivacy || null,
                commentsEnabled: tiktokCommentsEnabled,
              }
            : item.publishingOptions,
        messaging: item.messaging
          ? {
              ...item.messaging,
              subject: item.channel === "email" ? headline.trim() : item.messaging.subject,
              preheader: item.channel === "email" ? body.trim().slice(0, 150) : item.messaging.preheader,
              html: item.channel === "email" && item.messaging.physicalAddress
                ? buildCampaignEmailHtml({
                    businessName: item.messaging.fromName ?? workspace.name,
                    preheader: body.trim().slice(0, 150),
                    headline: headline.trim(),
                    body: body.trim(),
                    cta: cta.trim(),
                    destinationUrl,
                    physicalAddress: item.messaging.physicalAddress,
                    includeHeroImage: nextMediaIds.length > 0,
                    design: nextDesign,
                  })
                : item.messaging.html,
            }
          : null,
        scene: item.scene
          ? {
              ...item.scene,
              layers: item.scene.layers.map((layer) =>
                layer.kind === "text" && layer.role === "headline"
                  ? { ...layer, text: headline.trim() }
                  : layer,
              ),
            }
          : null,
        design: nextDesign,
      };
      const response = await authenticatedFetch(
        `/api/v1/campaigns/${campaign.id}/content/${item.id}`,
        {
          method: "POST",
          body: JSON.stringify({
            workspaceId: workspace.id,
            content: nextItem,
            aiRunId: acceptedAiRunId,
          }),
        },
      );
      const result = (await response.json()) as {
        ok: boolean;
        errors?: Array<{ message: string }>;
      };
      if (!result.ok)
        throw new Error(
          result.errors?.map((entry) => entry.message).join(" · ") ??
            "The new version could not be saved.",
        );
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The edit failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="content-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-editor-title"
      >
        <header>
          <div>
            <p className="kicker">New immutable version</p>
            <h2 id="content-editor-title">
              Edit {channelLabels[item.channel]}
            </h2>
          </div>
          <button className="icon-button" aria-label="Close editor" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        <p className="muted">
          Saving creates and moderates new final assets. Any prior approval and
          pending schedule are invalidated.
        </p>
        {error && <div className="notice error"><CircleAlert size={18} />{error}</div>}
        <div className="ai-refine-row">
          <label>
            Optional AI refinement
            <input
              value={aiInstruction}
              onChange={(event) => setAiInstruction(event.target.value)}
              placeholder="Make it clearer and less promotional"
            />
          </label>
          <button
            className="button secondary"
            disabled={busy || aiInstruction.trim().length < 3}
            onClick={() => void refine()}
          >
            {busy ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
            Refine draft
          </button>
        </div>
        <div className="editor-fields">
          <label>
            Headline
            <input value={headline} onChange={(event) => setHeadline(event.target.value)} />
          </label>
          <label>
            Post or ad copy
            <textarea rows={5} value={body} onChange={(event) => setBody(event.target.value)} />
          </label>
          <div className="form-grid">
            <label>
              Call to action
              <input value={cta} onChange={(event) => setCta(event.target.value)} />
            </label>
            <label>
              Destination URL
              <input type="url" value={destinationUrl} onChange={(event) => setDestinationUrl(event.target.value)} />
            </label>
            {!PAID_CHANNELS.has(item.channel) && (
              <label>
                Publish time
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                />
              </label>
            )}
            {PAID_CHANNELS.has(item.channel) && (
              <fieldset className="country-targeting span-2">
                <legend>Paid audience countries</legend>
                {(["US", "CA"] as const).map((country) => (
                  <label key={country}>
                    <input
                      type="checkbox"
                      checked={targetCountries.includes(country)}
                      onChange={() =>
                        setTargetCountries((current) =>
                          current.includes(country)
                            ? current.filter((entry) => entry !== country)
                            : [...current, country],
                        )
                      }
                    />
                    {country === "US" ? "United States" : "Canada"}
                  </label>
                ))}
              </fieldset>
            )}
            {item.channel === "tiktok" && (
              <fieldset className="tiktok-publishing-options span-2">
                <legend>TikTok publishing consent</legend>
                <label>
                  Who can view this post?
                  <select
                    value={tiktokPrivacy}
                    onChange={(event) => setTiktokPrivacy(event.target.value)}
                  >
                    <option value="">Choose a current privacy option</option>
                    {tiktokPrivacyOptions.map((option) => (
                      <option value={option} key={option}>
                        {option.replaceAll("_", " ").toLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={tiktokCommentsEnabled}
                    disabled={Boolean(
                      tiktokAccount?.capabilities.commentsDisabled,
                    )}
                    onChange={(event) =>
                      setTiktokCommentsEnabled(event.target.checked)
                    }
                  />
                  Allow comments
                </label>
              </fieldset>
            )}
          </div>
          {slides.length > 0 && (
            <div className="slide-editor">
              <h3>Carousel slides</h3>
              {slides.map((slide, index) => (
                <div key={`${item.id}-edit-${index}`}>
                  <b>Slide {index + 1}</b>
                  <input
                    aria-label={`Slide ${index + 1} headline`}
                    value={slide.headline}
                    onChange={(event) =>
                      setSlides((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, headline: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                  <textarea
                    rows={2}
                    aria-label={`Slide ${index + 1} body`}
                    value={slide.body}
                    onChange={(event) =>
                      setSlides((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, body: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          )}
          {item.channel === "google_search" && (
            <div className="slide-editor search-asset-editor">
              <h3>Responsive Search assets</h3>
              <p className="muted">
                Google mixes these assets. Review every headline and description.
              </p>
              {searchHeadlines.map((value, index) => (
                <label key={`headline-${index}`}>
                  Headline {index + 1} · {value.length}/30
                  <input
                    maxLength={30}
                    value={value}
                    onChange={(event) =>
                      setSearchHeadlines((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index ? event.target.value : entry,
                        ),
                      )
                    }
                  />
                </label>
              ))}
              {searchDescriptions.map((value, index) => (
                <label key={`description-${index}`}>
                  Description {index + 1} · {value.length}/90
                  <textarea
                    rows={2}
                    maxLength={90}
                    value={value}
                    onChange={(event) =>
                      setSearchDescriptions((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index ? event.target.value : entry,
                        ),
                      )
                    }
                  />
                </label>
              ))}
              <label>
                Keywords · one per line
                <textarea
                  rows={5}
                  value={searchKeywords.join("\n")}
                  onChange={(event) =>
                    setSearchKeywords(
                      event.target.value
                        .split("\n")
                        .map((keyword) => keyword.trim())
                        .filter(Boolean),
                    )
                  }
                />
              </label>
            </div>
          )}
        </div>
        <footer>
          <button className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={busy || !headline.trim() || !body.trim() || !cta.trim() || (PAID_CHANNELS.has(item.channel) && !targetCountries.length) || (item.channel === "tiktok" && !tiktokPrivacy) || (item.channel === "google_search" && !searchKeywords.length)} onClick={() => void save()}>
            {busy ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            Save new version
          </button>
        </footer>
      </section>
    </div>
  );
}

function ContentDecisionModal({
  campaign,
  workspace,
  item,
  onClose,
  onSaved,
}: {
  campaign: Campaign;
  workspace: Workspace;
  item: CampaignPlan["content"][number];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [decision, setDecision] = useState<
    "approved" | "changes_requested" | "rejected"
  >("approved");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch(
        `/api/v1/campaigns/${campaign.id}/content/${item.id}/decision`,
        {
          method: "POST",
          body: JSON.stringify({
            workspaceId: workspace.id,
            decision,
            comment: comment.trim() || null,
          }),
        },
      );
      const result = (await response.json()) as {
        ok?: boolean;
        errors?: Array<{ message: string }>;
      };
      if (!response.ok || !result.ok)
        throw new Error(
          result.errors?.map((entry) => entry.message).join(" · ") ??
            "The decision could not be saved.",
        );
      await onSaved();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The decision failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="decision-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="decision-title"
      >
        <header>
          <div>
            <p className="kicker">Content decision</p>
            <h2 id="decision-title">{channelLabels[item.channel]}</h2>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        {error && (
          <div className="notice error">
            <CircleAlert size={18} /> {error}
          </div>
        )}
        <fieldset className="decision-options">
          <legend>What is your decision?</legend>
          {[
            ["approved", "Approve", "This exact immutable version may be delivered."],
            [
              "changes_requested",
              "Request changes",
              "Return this item for editing and cancel pending schedules.",
            ],
            [
              "rejected",
              "Reject",
              "Reject this version and cancel pending schedules.",
            ],
          ].map(([value, label, detail]) => (
            <label
              key={value}
              className={decision === value ? "selected" : ""}
            >
              <input
                type="radio"
                name="decision"
                checked={decision === value}
                onChange={() =>
                  setDecision(
                    value as "approved" | "changes_requested" | "rejected",
                  )
                }
              />
              <span>
                <b>{label}</b>
                <small>{detail}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <label>
          Comment {decision === "approved" ? "(optional)" : "(required)"}
          <textarea
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Give the marketer a clear, actionable reason."
          />
        </label>
        <footer>
          <button className="button secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            disabled={busy || (decision !== "approved" && !comment.trim())}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            Save decision
          </button>
        </footer>
      </section>
    </div>
  );
}

function CampaignWorkspace({
  campaign,
  workspace,
  tab,
  media,
  accounts,
  metrics,
  messageBatches,
  onRefresh,
}: {
  campaign: Campaign;
  workspace: Workspace;
  tab: string;
  media: MediaAsset[];
  accounts: ProviderAccount[];
  metrics: MetricRow[];
  messageBatches: MessageBatchRow[];
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<
    CampaignPlan["content"][number] | null
  >(null);
  const [deciding, setDeciding] = useState<
    CampaignPlan["content"][number] | null
  >(null);
  const tabs = ["review", "schedule", "delivery", "results"];
  async function approve() {
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch(
        `/api/v1/campaigns/${campaign.id}/approve`,
        { method: "POST", body: JSON.stringify({ workspaceId: workspace.id }) },
      );
      const result = (await response.json()) as {
        ok: boolean;
        errors?: Array<{ message: string }>;
      };
      if (!result.ok)
        throw new Error(result.errors?.[0]?.message ?? "Approval failed.");
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Approval failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <a className="back-link" href="/app/campaigns">
        <ArrowLeft size={17} /> Campaigns
      </a>
      <PageHeader
        title={campaign.name}
        detail={`${campaign.source === "ai" ? "AI-generated" : "Template"} campaign · ${campaign.plan.channels.length} channels`}
        action={
          tab === "review" ? (
            <button
              className="button primary"
              disabled={busy || campaign.status === "approved"}
              onClick={() => void approve()}
            >
              {busy ? (
                <Loader2 className="spin" size={18} />
              ) : (
                <ShieldCheck size={18} />
              )}
              {campaign.status === "approved" ? "Approved" : "Approve campaign"}
            </button>
          ) : undefined
        }
      />
      <div className="workspace-tabs" role="tablist">
        {tabs.map((name) => (
          <a
            key={name}
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? "active" : ""}
            href={`/app/campaigns/${campaign.id}/${name}`}
          >
            {name[0].toUpperCase() + name.slice(1)}
          </a>
        ))}
      </div>
      {error && (
        <div className="notice error">
          <CircleAlert size={18} />
          {error}
        </div>
      )}
      {tab === "review" && (
        <ReviewSummary
          plan={campaign.plan}
          media={media}
          accounts={accounts}
          onEdit={setEditing}
          onDecision={setDeciding}
        />
      )}
      {tab === "schedule" && (
        <ScheduleTab campaign={campaign} onEdit={setEditing} />
      )}
      {tab === "delivery" && (
        <DeliveryTab
          campaign={campaign}
          workspace={workspace}
          accounts={accounts}
          onRefresh={onRefresh}
        />
      )}
      {tab === "results" && (
        <CampaignResultsTab campaign={campaign} metrics={metrics} messageBatches={messageBatches} />
      )}
      {editing && (
        <ContentEditor
          campaign={campaign}
          workspace={workspace}
          item={editing}
          media={media}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSaved={onRefresh}
        />
      )}
      {deciding && (
        <ContentDecisionModal
          campaign={campaign}
          workspace={workspace}
          item={deciding}
          onClose={() => setDeciding(null)}
          onSaved={onRefresh}
        />
      )}
    </>
  );
}

function ScheduleTab({
  campaign,
  onEdit,
}: {
  campaign: Campaign;
  onEdit: (item: CampaignPlan["content"][number]) => void;
}) {
  return (
    <section className="panel detail-panel">
      <div className="panel-heading">
        <div>
          <h2>Organic publishing schedule</h2>
          <p>
            Only approved versions can be scheduled. Rejected versions are
            automatically unscheduled.
          </p>
        </div>
      </div>
      <div className="timeline-list">
        {campaign.plan.content
          .filter((item) => !PAID_CHANNELS.has(item.channel))
          .map((item) => (
            <div key={item.id}>
              <span className="timeline-dot" />
              <div>
                <b>{channelLabels[item.channel]}</b>
                <p>
                  {item.scheduledFor
                    ? new Date(item.scheduledFor).toLocaleString()
                    : "No publish time selected"}
                </p>
              </div>
              <button
                className="button secondary"
                onClick={() => onEdit(item)}
              >
                {item.scheduledFor ? "Change time" : "Choose time"}
              </button>
            </div>
          ))}
      </div>
      {!campaign.plan.content.some(
        (item) => !PAID_CHANNELS.has(item.channel),
      ) && (
        <CompactEmpty
          icon={<CalendarDays size={20} />}
          text="This campaign has no organic posts."
        />
      )}
    </section>
  );
}
function DeliveryTab({
  campaign,
  workspace,
  accounts,
  onRefresh,
}: {
  campaign: Campaign;
  workspace: Workspace;
  accounts: ProviderAccount[];
  onRefresh: () => Promise<void>;
}) {
  type Proposal = {
    proposalOperationId: string;
    summary: {
      campaignName: string;
      accounts: Array<{
        channel: ChannelKey;
        accountName: string;
        provider: ProviderKey;
      }>;
      budget: {
        dailyCents: number | null;
        lifetimeCents: number | null;
        currency: string;
      };
      startsAt: string;
      endsAt: string | null;
      destinations: string[];
      messaging?: Array<{ channel: ChannelKey; audienceId: string; eligibleRecipients: number }>;
    };
  };
  const deliveryItems = campaign.plan.content.filter((item) =>
    PAID_CHANNELS.has(item.channel) || item.channel === "email" || item.channel === "sms",
  );
  const hasPaid = campaign.plan.content.some((item) => PAID_CHANNELS.has(item.channel));
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function preflight() {
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch(
        `/api/v1/campaigns/${campaign.id}/preflight`,
        { method: "POST", body: JSON.stringify({ workspaceId: workspace.id }) },
      );
      const result = (await response.json()) as {
        ok: boolean;
        data?: Proposal;
        errors?: Array<{ message: string }>;
      };
      if (!result.ok || !result.data)
        throw new Error(
          result.errors?.map((item) => item.message).join(" · ") ??
            "Preflight failed.",
        );
      setProposal(result.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Preflight failed.");
    } finally {
      setBusy(false);
    }
  }
  async function launch() {
    if (!proposal || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch(
        `/api/v1/campaigns/${campaign.id}/launch`,
        {
          method: "POST",
          body: JSON.stringify({
            workspaceId: workspace.id,
            proposalOperationId: proposal.proposalOperationId,
            confirmed: true,
          }),
        },
      );
      const result = (await response.json()) as {
        ok: boolean;
        data?: { status: string };
        errors?: Array<{ message: string }>;
      };
      if (!result.ok)
        throw new Error(
          result.errors?.map((item) => item.message).join(" · ") ??
            "Launch failed.",
        );
      setSuccess(
        `Campaign is ${result.data?.status ?? "launched"}. Provider IDs and statuses are saved.`,
      );
      setProposal(null);
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Launch failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="launch-safety">
        <ShieldCheck size={22} />
        <div>
          <h2>Every destination is preflighted before launch</h2>
          <p>
            Paid resources are created paused. Email and SMS require current consent,
            suppression, sender, and compliance checks before they enter the delivery queue.
          </p>
        </div>
      </section>
      {error && (
        <div className="notice error">
          <CircleAlert size={18} />
          {error}
        </div>
      )}
      {success && (
        <div className="notice info">
          <Check size={18} />
          {success}
        </div>
      )}
      <section className="panel detail-panel">
        <div className="panel-heading">
          <h2>Destinations</h2>
          {campaign.status === "approved" && !proposal && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void preflight()}
            >
              {busy ? (
                <Loader2 className="spin" size={18} />
              ) : (
                <ShieldCheck size={18} />
              )}{" "}
              Run real preflight
            </button>
          )}
        </div>
        {deliveryItems.map((item) => (
          <div className="delivery-row" key={item.id}>
            <div className="channel-mark">
              {channelLabels[item.channel].slice(0, 2).toUpperCase()}
            </div>
            <div>
              <b>{channelLabels[item.channel]}</b>
              <p>
                {accounts.find((account) => account.id === item.accountId)
                  ?.name ?? "No account selected"}
              </p>
            </div>
            <StatusPill
              status={
                campaign.status === "approved"
                  ? "ready for preflight"
                  : campaign.status
              }
            />
          </div>
        ))}
        {!deliveryItems.length && (
          <CompactEmpty
            icon={<Megaphone size={20} />}
            text="This campaign has no paid or messaging destinations."
          />
        )}
      </section>
      {proposal && (
        <section className="launch-confirmation">
          <div className="panel-heading">
            <div>
              <p className="kicker">Final confirmation</p>
              <h2>Launch {proposal.summary.campaignName}?</h2>
            </div>
          </div>
          <dl>
            {proposal.summary.accounts.map((account) => (
              <div key={`${account.channel}-${account.accountName}`}>
                <dt>{channelLabels[account.channel]}</dt>
                <dd>
                  {account.accountName} ·{" "}
                  {providerCapabilities[account.provider].label}
                </dd>
              </div>
            ))}
            {hasPaid && <div>
              <dt>Budget</dt>
              <dd>{proposal.summary.budget.dailyCents ? `${proposal.summary.budget.currency} ${(proposal.summary.budget.dailyCents / 100).toFixed(2)} per day` : `${proposal.summary.budget.currency} ${((proposal.summary.budget.lifetimeCents ?? 0) / 100).toFixed(2)} lifetime`}</dd>
            </div>}
            {(proposal.summary.messaging ?? []).map((message) => <div key={`${message.channel}-${message.audienceId}`}><dt>{channelLabels[message.channel]} audience</dt><dd>{message.eligibleRecipients} currently eligible recipients</dd></div>)}
            <div>
              <dt>Dates</dt>
              <dd>
                {new Date(proposal.summary.startsAt).toLocaleString()} →{" "}
                {proposal.summary.endsAt
                  ? new Date(proposal.summary.endsAt).toLocaleString()
                  : "No end date"}
              </dd>
            </div>
            <div>
              <dt>Destinations</dt>
              <dd>{proposal.summary.destinations.join(" · ")}</dd>
            </div>
          </dl>
          <label className="confirmation-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              I confirm these accounts, dates, destinations, recipient counts
              {hasPaid ? `, and the exact ${proposal.summary.budget.currency} budget` : ""}.
            </span>
          </label>
          <button
            className="button primary launch-button"
            disabled={!confirmed || busy}
            onClick={() => void launch()}
          >
            {busy ? (
              <Loader2 className="spin" size={18} />
            ) : (
              <Megaphone size={18} />
            )}{" "}
            Launch campaign
          </button>
        </section>
      )}
    </>
  );
}
function CampaignResultsTab({
  campaign,
  metrics,
  messageBatches,
}: {
  campaign: Campaign;
  metrics: MetricRow[];
  messageBatches: MessageBatchRow[];
}) {
  if (metrics.length || messageBatches.length)
    return (
      <section className="panel result-sources">
        <div className="panel-heading">
          <div>
            <h2>Provider-reported results</h2>
            <p>Each row keeps its native source and attribution label.</p>
          </div>
        </div>
        {messageBatches.map((batch) => (
          <div key={batch.id}>
            <div><strong>{batch.channel === "email" ? "Twilio SendGrid" : "Twilio Messaging"}</strong><small>{batch.status}</small></div>
            <span>{batch.delivered_count.toLocaleString()} delivered</span>
            <span>{batch.failed_count.toLocaleString()} failed · {batch.suppressed_count.toLocaleString()} suppressed</span>
            <span>{new Date(batch.scheduled_for).toLocaleDateString()}</span>
          </div>
        ))}
        {metrics.map((row) => (
          <div key={row.id}>
            <div>
              <strong>{providerCapabilities[row.provider_key].label}</strong>
              <small>{row.source_model}</small>
            </div>
            <span>
              {Number(
                row.metrics.impressions ?? row.metrics.views ?? 0,
              ).toLocaleString()} views/impressions
            </span>
            <span>
              {Number(row.metrics.clicks ?? 0).toLocaleString()} clicks
            </span>
            <span>{new Date(row.period_end).toLocaleDateString()}</span>
          </div>
        ))}
      </section>
    );
  return (
    <EmptyPage
      title="Results begin after launch"
      detail={`GrowthOS will show provider-native metrics for ${campaign.name}. It will never invent performance or merge incompatible attribution models.`}
      inline
    />
  );
}

function CalendarPage({ campaigns }: { campaigns: Campaign[] }) {
  const [view, setView] = useState<"list" | "month">("list");
  const scheduled = campaigns
    .filter((c) => c.starts_at)
    .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""));
  return (
    <>
      <PageHeader
        title="Calendar"
        detail="Organic publish times and paid campaign dates in one simple list."
      />
      <div className="calendar-toolbar">
        <div className="segmented">
          <button
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            List
          </button>
          <button
            className={view === "month" ? "active" : ""}
            onClick={() => setView("month")}
          >
            Month
          </button>
        </div>
      </div>
      {view === "list" ? (
      <section className="panel calendar-list">
        {scheduled.map((campaign) => (
          <a href={`/app/campaigns/${campaign.id}/schedule`} key={campaign.id}>
            <div className="date-tile">
              <b>{new Date(campaign.starts_at!).getDate()}</b>
              <span>
                {new Date(campaign.starts_at!).toLocaleString("en", {
                  month: "short",
                })}
              </span>
            </div>
            <div>
              <strong>{campaign.name}</strong>
              <p>
                {campaign.plan.channels
                  .map((channel) => channelLabels[channel])
                  .join(" · ")}
              </p>
            </div>
            <StatusPill status={campaign.status} />
          </a>
        ))}
        {!scheduled.length && (
          <CompactEmpty
            icon={<CalendarDays size={20} />}
            text="No campaigns have dates yet."
          />
        )}
      </section>
      ) : (
        <MonthCalendar campaigns={scheduled} />
      )}
    </>
  );
}

function MonthCalendar({ campaigns }: { campaigns: Campaign[] }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const days = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const leading = month.getDay();
  const cells = Array.from({ length: leading + days }, (_, index) =>
    index < leading ? null : index - leading + 1,
  );
  return (
    <section className="panel month-calendar">
      <header>
        <button
          className="icon-button"
          aria-label="Previous month"
          onClick={() =>
            setMonth(
              new Date(month.getFullYear(), month.getMonth() - 1, 1),
            )
          }
        >
          <ArrowLeft size={17} />
        </button>
        <h2>
          {month.toLocaleString("en", { month: "long", year: "numeric" })}
        </h2>
        <button
          className="icon-button"
          aria-label="Next month"
          onClick={() =>
            setMonth(
              new Date(month.getFullYear(), month.getMonth() + 1, 1),
            )
          }
        >
          <ArrowRight size={17} />
        </button>
      </header>
      <div className="month-weekdays">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
          (day) => <span key={day}>{day}</span>,
        )}
      </div>
      <div className="month-grid">
        {cells.map((day, index) => {
          const onDay = day
            ? campaigns.filter((campaign) => {
                const date = new Date(campaign.starts_at!);
                return (
                  date.getFullYear() === month.getFullYear() &&
                  date.getMonth() === month.getMonth() &&
                  date.getDate() === day
                );
              })
            : [];
          return (
            <div
              className={day ? "month-day" : "month-day empty"}
              key={`${month.toISOString()}-${index}`}
            >
              {day && <b>{day}</b>}
              {onDay.slice(0, 3).map((campaign) => (
                <a
                  href={`/app/campaigns/${campaign.id}/schedule`}
                  key={campaign.id}
                >
                  {campaign.name}
                </a>
              ))}
              {onDay.length > 3 && <small>+{onDay.length - 3} more</small>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
function ResultsPage({
  campaigns,
  metrics,
  messageBatches,
}: {
  campaigns: Campaign[];
  metrics: MetricRow[];
  messageBatches: MessageBatchRow[];
}) {
  const live = campaigns.filter((c) =>
    ["live", "completed"].includes(c.status),
  );
  const latestBySource = new Map<string, MetricRow>();
  for (const row of metrics) {
    const key = `${row.campaign_id ?? "workspace"}:${row.provider_key}:${row.source_model}`;
    if (!latestBySource.has(key)) latestBySource.set(key, row);
  }
  const latest = [...latestBySource.values()];
  const totals = latest.reduce(
    (result, row) => ({
      impressions: result.impressions + Number(row.metrics.impressions ?? 0),
      clicks: result.clicks + Number(row.metrics.clicks ?? 0),
      conversions: result.conversions + Number(row.metrics.conversions ?? 0),
    }),
    { impressions: 0, clicks: 0, conversions: 0 },
  );
  const clickRate = totals.impressions
    ? (totals.clicks / totals.impressions) * 100
    : 0;
  const recommendations = [
    ...(totals.impressions > 100 && clickRate < 0.5
      ? [
          `Review the creative and destination: the latest provider snapshots show ${totals.impressions.toLocaleString()} impressions and ${totals.clicks.toLocaleString()} clicks (${clickRate.toFixed(2)}% click rate).`,
        ]
      : []),
    ...(live.length && !latest.length
      ? [
          "A campaign is live but no provider snapshot has arrived. Check connection health and the reporting worker before changing creative or budget.",
        ]
      : []),
    ...(latest.length
      ? [
          `Use the strongest verified message in a follow-up draft; GrowthOS will preserve the source labels from ${new Set(latest.map((row) => row.provider_key)).size} reporting source${new Set(latest.map((row) => row.provider_key)).size === 1 ? "" : "s"}.`,
        ]
      : []),
  ].slice(0, 3);
  return (
    <>
      <PageHeader
        title="Results"
        detail="Provider-reported performance, labeled by source and attribution model."
      />
      <section className="metric-strip">
        <div>
          <span>Live campaigns</span>
          <b>{live.filter((c) => c.status === "live").length}</b>
          <small>Provider status</small>
        </div>
        <div>
          <span>Delivered messages</span>
          <b>{messageBatches.reduce((total, batch) => total + batch.delivered_count, 0).toLocaleString()}</b>
          <small>Twilio &amp; SendGrid callbacks</small>
        </div>
        <div>
          <span>Clicks</span>
          <b>{totals.clicks.toLocaleString()}</b>
          <small>Latest provider snapshots</small>
        </div>
      </section>
      {latest.length || messageBatches.length ? (
        <section className="panel result-sources">
          <div className="panel-heading">
            <h2>Source details</h2>
          </div>
          {messageBatches.slice(0, 12).map((batch) => (
            <div key={batch.id}>
              <div><strong>{batch.channel === "email" ? "Twilio SendGrid" : "Twilio Messaging"}</strong><small>{batch.status}</small></div>
              <span>{batch.delivered_count.toLocaleString()} delivered</span>
              <span>{batch.failed_count.toLocaleString()} failed</span>
              <span>{batch.suppressed_count.toLocaleString()} suppressed</span>
            </div>
          ))}
          {latest.slice(0, 12).map((row) => (
            <div key={row.id}>
              <div>
                <strong>{providerCapabilities[row.provider_key].label}</strong>
                <small>{row.source_model}</small>
              </div>
              <span>
                {Number(row.metrics.impressions ?? 0).toLocaleString()}{" "}
                impressions
              </span>
              <span>
                {Number(row.metrics.clicks ?? 0).toLocaleString()} clicks
              </span>
              <span>{row.currency ?? "No currency"}</span>
            </div>
          ))}
        </section>
      ) : (
        <EmptyPage
          title="Real reporting starts after launch"
          detail="Connect a provider and launch a campaign. GrowthOS will synchronize metrics without inventing sample performance."
          inline
        />
      )}
      {recommendations.length > 0 && (
        <section className="panel results-recommendations">
          <div className="panel-heading">
            <div>
              <h2>Evidence-backed next steps</h2>
              <p>No live campaign or budget is changed automatically.</p>
            </div>
            <a className="button secondary" href="/app/campaigns/new">
              Create follow-up draft
            </a>
          </div>
          {recommendations.map((recommendation) => (
            <div key={recommendation}>
              <Sparkles size={17} />
              <p>{recommendation}</p>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function parseCsvRows(value: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"' && quoted && value[index + 1] === '"') { field += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(field.trim()); field = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && value[index + 1] === "\n") index += 1;
      row.push(field.trim()); field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += character;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function ContactsConsentPage({ workspace, audiences, settings, onRefresh }: { workspace: Workspace; audiences: MessagingAudience[]; settings: MessagingSettings | null; onRefresh: () => Promise<void> }) {
  const [sender, setSender] = useState({
    legalBusinessName: settings?.legal_business_name ?? workspace.name,
    physicalAddress: settings?.physical_address ?? "",
    defaultCountry: settings?.default_country ?? (workspace.currency === "CAD" ? "CA" : "US") as "US" | "CA",
    quietHoursStart: String(settings?.quiet_hours_start ?? "20:00").slice(0, 5),
    quietHoursEnd: String(settings?.quiet_hours_end ?? "09:00").slice(0, 5),
  });
  const [listName, setListName] = useState("");
  const [csv, setCsv] = useState("");
  const [certified, setCertified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function saveSender(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await authenticatedFetch("/api/v1/messaging/settings", { method: "POST", body: JSON.stringify({ workspaceId: workspace.id, ...sender }) });
      const result = await response.json() as { ok: boolean; errors?: Array<{ message: string }> };
      if (!result.ok) throw new Error(result.errors?.[0]?.message ?? "Sender settings could not be saved.");
      setMessage("Sender identity and quiet hours saved."); await onRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Sender settings could not be saved."); }
    finally { setBusy(false); }
  }
  async function importContacts(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const rows = parseCsvRows(csv);
      const headers = rows.shift()?.map((header) => header.toLowerCase()) ?? [];
      const required = ["consent_channels", "consent_source", "consent_timestamp"];
      if (!required.every((header) => headers.includes(header))) throw new Error(`CSV must include ${required.join(", ")}.`);
      const at = (row: string[], key: string) => row[headers.indexOf(key)] || null;
      const contacts = rows.map((row) => ({
        email: at(row, "email"), phone: at(row, "phone"), firstName: at(row, "first_name"), lastName: at(row, "last_name"),
        country: at(row, "country") || null, timezone: at(row, "timezone") || null, attributes: {}, explicitConsent: true,
        consentChannels: String(at(row, "consent_channels") ?? "").split("|").map((channel) => channel.trim().toLowerCase()).filter(Boolean),
        consentSource: at(row, "consent_source"), consentTimestamp: at(row, "consent_timestamp"), consentProof: { importedFile: true },
      }));
      const response = await authenticatedFetch("/api/v1/contacts/import", { method: "POST", body: JSON.stringify({ workspaceId: workspace.id, listName, contacts, certification: certified }) });
      const result = await response.json() as { ok: boolean; data?: { importedCount?: number }; errors?: Array<{ message: string }> };
      if (!result.ok) throw new Error(result.errors?.map((entry) => entry.message).join(" · ") ?? "Import failed.");
      setMessage(`${result.data?.importedCount ?? contacts.length} contact rows imported with their consent records.`); setCsv(""); setListName(""); setCertified(false); await onRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import failed."); }
    finally { setBusy(false); }
  }
  return <>
    <a className="back-link" href="/app/manage"><ArrowLeft size={17} /> Manage</a>
    <PageHeader title="Contacts & Consent" detail="Only recipients with explicit, recorded channel consent can enter a campaign." />
    {error && <div className="notice error"><CircleAlert size={18} />{error}</div>}
    {message && <div className="notice info"><Check size={18} />{message}</div>}
    <div className="home-grid">
      <section className="panel">
        <div className="panel-heading"><div><h2>Legal sender identity</h2><p>Required in marketing email and used for compliance checks.</p></div></div>
        <form className="form-grid" onSubmit={saveSender}>
          <label className="span-2">Legal business name<input value={sender.legalBusinessName} onChange={(event) => setSender({ ...sender, legalBusinessName: event.target.value })} required /></label>
          <label className="span-2">Physical mailing address<textarea value={sender.physicalAddress} onChange={(event) => setSender({ ...sender, physicalAddress: event.target.value })} required rows={3} /></label>
          <label>Default country<select value={sender.defaultCountry} onChange={(event) => setSender({ ...sender, defaultCountry: event.target.value as "US" | "CA" })}><option value="US">United States</option><option value="CA">Canada</option></select></label>
          <div />
          <label>Quiet hours start<input type="time" value={sender.quietHoursStart} onChange={(event) => setSender({ ...sender, quietHoursStart: event.target.value })} /></label>
          <label>Quiet hours end<input type="time" value={sender.quietHoursEnd} onChange={(event) => setSender({ ...sender, quietHoursEnd: event.target.value })} /></label>
          <button className="button primary span-2" disabled={busy}>Save sender identity</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h2>Audiences</h2><p>Counts exclude unsubscribed and suppressed contacts.</p></div></div>
        {audiences.length ? audiences.map((audience) => <div className="selected-account" key={audience.id}><Users size={16} /><div><b>{audience.name}</b><p>{audience.totalContacts} contacts · {audience.eligible.email} email eligible · {audience.eligible.sms} SMS eligible</p></div></div>) : <CompactEmpty icon={<Users size={20} />} text="No contact lists yet" />}
      </section>
    </div>
    <section className="panel">
      <div className="panel-heading"><div><h2>Import consented contacts</h2><p>CSV columns: email, phone, first_name, last_name, country, timezone, consent_channels, consent_source, consent_timestamp. Use email|sms for both channels.</p></div></div>
      <form className="form-grid" onSubmit={importContacts}>
        <label className="span-2">List name<input value={listName} onChange={(event) => setListName(event.target.value)} placeholder="Holiday customers" required /></label>
        <label className="span-2">CSV file<input type="file" accept=".csv,text/csv" onChange={async (event) => setCsv(await event.target.files?.[0]?.text() ?? "")} required /></label>
        <label className="span-2 inline-check"><input type="checkbox" checked={certified} onChange={(event) => setCertified(event.target.checked)} required />I certify that these people gave this business explicit permission for every selected channel. This is not a purchased or scraped list.</label>
        <button className="button primary span-2" disabled={busy || !certified || !csv || !listName}>Import contacts and consent</button>
      </form>
    </section>
  </>;
}

function ManagePage({
  products,
  media,
  connections,
  platformAdmin,
}: {
  products: ProductService[];
  media: MediaAsset[];
  connections: ProviderConnection[];
  platformAdmin: boolean;
}) {
  const cards = [
    {
      href: "/app/manage/brand",
      icon: Package,
      title: "Brand & Assets",
      detail: `${products.length} products or services · ${media.length} assets`,
      action: "Manage brand",
    },
    {
      href: "/app/integrations",
      icon: Link2,
      title: "Integrations",
      detail: `${connections.length} authorized · data, ads, messaging, and social`,
      action: "Open integration catalog",
    },
    {
      href: "/app/manage/contacts",
      icon: Users,
      title: "Contacts & Consent",
      detail: "Lists, consent proof, sender identity, and suppressions",
      action: "Manage audiences",
    },
    {
      href: "/app/manage/team",
      icon: Users,
      title: "Team",
      detail: "Invitations, roles, and approval mode",
      action: "Manage team",
    },
    {
      href: "/app/manage/settings",
      icon: Settings,
      title: "Workspace Settings",
      detail: "Currency, timezone, spend limits, and data controls",
      action: "Open settings",
    },
    ...(platformAdmin
      ? [
          {
            href: "/app/manage/platform",
            icon: ShieldCheck,
            title: "Provider Readiness",
            detail: "Platform reviews, smoke tests, webhooks, and kill switches",
            action: "Review platform gates",
          },
        ]
      : []),
  ];
  return (
    <>
      <PageHeader
        title="Manage"
        detail="The setup tools you need occasionally, kept out of the daily workflow."
      />
      <div className="manage-grid">
        {cards.map((card) => (
          <a href={card.href} key={card.href}>
            <div className="manage-icon">
              <card.icon size={22} />
            </div>
            <h2>{card.title}</h2>
            <p>{card.detail}</p>
            <span>
              {card.action} <ArrowRight size={15} />
            </span>
          </a>
        ))}
      </div>
    </>
  );
}

function BrandAssetsPage({
  workspace,
  products,
  media,
  onRefresh,
}: {
  workspace: Workspace;
  products: ProductService[];
  media: MediaAsset[];
  onRefresh: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [importUrl, setImportUrl] = useState(workspace.website_url ?? "");
  const [websiteImport, setWebsiteImport] = useState<{
    importId: string;
    suggestions: {
      summary: string;
      colors: string[];
      products: Array<{
        name: string;
        description: string;
        landingUrl: string;
        kind: "ecommerce" | "service";
      }>;
      pages: Array<{ url: string; title: string }>;
    };
  } | null>(null);
  async function addProduct(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const supabase = getBrowserSupabase();
    const { error: insertError } = await supabase
      .from("products_services")
      .insert({
        workspace_id: workspace.id,
        kind: workspace.business_type,
        name,
        description,
        landing_url: url || null,
        currency: workspace.currency,
      });
    if (insertError) setError(insertError.message);
    else {
      setAdding(false);
      setName("");
      setDescription("");
      setUrl("");
      await onRefresh();
    }
    setBusy(false);
  }
  async function upload(productId: string, file: File) {
    setBusy(true);
    setError("");
    try {
      if (!file.type.startsWith("image/"))
        throw new Error("V1 accepts image files only.");
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Images must be 20 MB or smaller.");
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const sha = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const extension =
        file.name
          .split(".")
          .pop()
          ?.replace(/[^a-z0-9]/gi, "")
          .toLowerCase() || "bin";
      const path = `${workspace.id}/${productId}/${crypto.randomUUID()}.${extension}`;
      const supabase = getBrowserSupabase();
      const { error: uploadError } = await supabase.storage
        .from("growthos-private-media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data: record, error: recordError } = await supabase
        .from("media_assets")
        .insert({
          workspace_id: workspace.id,
          product_service_id: productId,
          storage_path: path,
          kind: workspace.business_type === "ecommerce" ? "product" : "service",
          filename: file.name,
          content_type: file.type,
          byte_size: file.size,
          sha256: sha,
          moderation_status: "pending",
          created_by: (await supabase.auth.getUser()).data.user!.id,
        })
        .select("id")
        .single();
      if (recordError || !record) {
        await supabase.storage.from("growthos-private-media").remove([path]);
        throw recordError ?? new Error("Media record could not be created.");
      }
      const moderationResponse = await authenticatedFetch(
        `/api/v1/media/${record.id}/moderate`,
        { method: "POST", body: JSON.stringify({ workspaceId: workspace.id }) },
      );
      const moderationResult = (await moderationResponse.json()) as {
        ok: boolean;
        data?: { status: string };
        errors?: Array<{ message: string }>;
      };
      if (!moderationResult.ok)
        throw new Error(
          moderationResult.errors?.[0]?.message ??
            "Media moderation failed; the image remains unavailable for campaigns.",
        );
      if (moderationResult.data?.status === "rejected")
        throw new Error(
          "The image could not be accepted for campaign generation or publishing.",
        );
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  async function runImport() {
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/v1/website-imports", {
        method: "POST",
        body: JSON.stringify({ workspaceId: workspace.id, url: importUrl }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        data?: typeof websiteImport;
        errors?: Array<{ message: string }>;
      };
      if (!result.ok || !result.data)
        throw new Error(
          result.errors?.[0]?.message ?? "Website import failed.",
        );
      setWebsiteImport(result.data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Website import failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirmImport() {
    if (!websiteImport) return;
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch(
        `/api/v1/website-imports/${websiteImport.importId}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({
            workspaceId: workspace.id,
            brandSummary: websiteImport.suggestions.summary,
            colors: websiteImport.suggestions.colors,
            products: websiteImport.suggestions.products,
          }),
        },
      );
      const result = (await response.json()) as {
        ok: boolean;
        errors?: Array<{ message: string }>;
      };
      if (!result.ok)
        throw new Error(
          result.errors?.[0]?.message ?? "Suggestions could not be confirmed.",
        );
      setWebsiteImport(null);
      await onRefresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Suggestions could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <a className="back-link" href="/app/manage">
        <ArrowLeft size={17} /> Manage
      </a>
      <PageHeader
        title="Brand & Assets"
        detail="Real product or service details and imagery used in every campaign preview."
        action={
          <button className="button primary" onClick={() => setAdding(true)}>
            <Plus size={18} /> Add{" "}
            {workspace.business_type === "ecommerce" ? "product" : "service"}
          </button>
        }
      />
      {error && (
        <div className="notice error">
          <CircleAlert size={18} />
          {error}
        </div>
      )}
      <section className="panel website-import-panel">
        <div>
          <h2>Import suggestions from your website</h2>
          <p>
            GrowthOS safely scans up to five same-site HTML pages. Nothing
            replaces your confirmed brand until you review it.
          </p>
        </div>
        <label>
          Website URL
          <input
            type="url"
            value={importUrl}
            onChange={(event) => setImportUrl(event.target.value)}
            placeholder="https://yourbusiness.com"
          />
        </label>
        <button
          className="button secondary"
          disabled={busy || !importUrl}
          onClick={() => void runImport()}
        >
          {busy ? <Loader2 className="spin" size={17} /> : <Search size={17} />}{" "}
          Scan website
        </button>
      </section>
      {websiteImport && (
        <section className="panel import-review">
          <div className="panel-heading">
            <div>
              <p className="kicker">Suggestions only</p>
              <h2>Review before applying</h2>
            </div>
          </div>
          <div className="import-review-body">
            <label>
              Brand summary
              <textarea
                value={websiteImport.suggestions.summary}
                onChange={(event) =>
                  setWebsiteImport({
                    ...websiteImport,
                    suggestions: {
                      ...websiteImport.suggestions,
                      summary: event.target.value,
                    },
                  })
                }
                rows={3}
              />
            </label>
            <div>
              <b>Suggested colors</b>
              <div className="color-suggestions">
                {websiteImport.suggestions.colors.map((color) => (
                  <span
                    key={color}
                    style={{ background: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
            <div>
              <b>
                {websiteImport.suggestions.products.length} products or services
                found
              </b>
              <ul>
                {websiteImport.suggestions.products.map((product) => (
                  <li key={`${product.kind}-${product.name}`}>
                    {product.name}
                  </li>
                ))}
              </ul>
            </div>
            <div className="creator-actions">
              <button
                className="button secondary"
                onClick={() => setWebsiteImport(null)}
              >
                Discard
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void confirmImport()}
              >
                <Check size={17} />
                Confirm suggestions
              </button>
            </div>
          </div>
        </section>
      )}
      {adding && (
        <form className="panel inline-form" onSubmit={addProduct}>
          <div className="panel-heading">
            <h2>
              New{" "}
              {workspace.business_type === "ecommerce" ? "product" : "service"}
            </h2>
            <button
              type="button"
              className="icon-button"
              onClick={() => setAdding(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="form-grid">
            <label>
              Name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Landing URL
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <label className="span-2">
              Description
              <textarea
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={busy}>
              Save
            </button>
          </div>
        </form>
      )}
      <div className="asset-product-list">
        {products.map((product) => {
          const images = media.filter(
            (item) => item.product_service_id === product.id,
          );
          return (
            <article className="product-card" key={product.id}>
              <div className="product-images">
                {images.length ? (
                  images.map((image) => (
                    <img src={image.url} alt={image.filename} key={image.id} />
                  ))
                ) : (
                  <div>
                    <FileImage size={28} />
                    <span>No image</span>
                  </div>
                )}
              </div>
              <div className="product-card-copy">
                <h2>{product.name}</h2>
                <p>{product.description}</p>
                <a href={product.landing_url ?? "#"}>
                  {product.landing_url ?? "No landing URL"}
                </a>
              </div>
              <label className="button secondary upload-button">
                <Upload size={17} /> Upload image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(product.id, file);
                  }}
                />
              </label>
            </article>
          );
        })}
        {!products.length && (
          <EmptyPage
            title={`Add your first ${workspace.business_type === "ecommerce" ? "product" : "service"}`}
            detail="Campaigns cannot be approved with a generic placeholder. Add the real item, landing page, and at least one image."
            inline
          />
        )}
      </div>
      {products.some((product) =>
        media.some((asset) => asset.product_service_id === product.id),
      ) && (
        <section className="setup-next-card">
          <span><Check size={20} /></span>
          <div>
            <p className="kicker">Brand step complete</p>
            <h2>Connect the first channel</h2>
            <p>
              Next, authorize a real provider account, choose the destination,
              and run its live readiness check.
            </p>
          </div>
          <a className="button primary" href="/app/integrations">
            Continue setup <ArrowRight size={17} />
          </a>
        </section>
      )}
    </>
  );
}

function PlatformReadinessPage() {
  const [records, setRecords] = useState<PlatformProviderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ProviderKey | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/v1/admin/providers");
      const result = (await response.json()) as {
        ok?: boolean;
        data?: PlatformProviderRecord[];
        error?: string;
      };
      if (!response.ok || !result.data)
        throw new Error(
          result.error ?? "Platform administrator access is required.",
        );
      setRecords(result.data);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Provider readiness could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update(
    provider: ProviderKey,
    values: Partial<PlatformProviderRecord>,
  ) {
    setRecords((current) =>
      current.map((record) =>
        record.provider === provider ? { ...record, ...values } : record,
      ),
    );
  }

  async function save(record: PlatformProviderRecord) {
    setSaving(record.provider);
    setError("");
    try {
      const response = await authenticatedFetch("/api/v1/admin/providers", {
        method: "PATCH",
        body: JSON.stringify({
          provider: record.provider,
          environment: record.environment,
          applicationId: record.applicationId || null,
          configured: record.configured,
          reviewStatus: record.reviewStatus,
          requiredScopes: record.requiredScopes,
          grantedScopes: record.grantedScopes,
          apiVersion: record.apiVersion || null,
          redirectVerified: record.redirectVerified,
          webhookVerified: record.webhookVerified,
          lastSmokeTestStatus: record.lastSmokeTestStatus,
          tokenRefreshHealthy: record.tokenRefreshHealthy,
          webhookHealthy: record.webhookHealthy,
          killSwitch: record.killSwitch,
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        errors?: Array<{ message: string }>;
      };
      if (!response.ok || !result.ok)
        throw new Error(
          result.errors?.[0]?.message ?? "Readiness evidence was not saved.",
        );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Readiness update failed.",
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Provider readiness"
        detail="Platform administrators record review, callback, smoke-test, refresh, and webhook evidence here. Customer connection buttons use these gates."
      />
      {error && (
        <div className="notice error">
          <CircleAlert size={18} /> {error}
        </div>
      )}
      {loading ? (
        <section className="panel loading-panel">
          <Loader2 className="spin" size={22} /> Loading provider evidence…
        </section>
      ) : (
        <div className="readiness-editor-grid">
          {records.map((record) => (
            <article className="readiness-editor-card" key={record.provider}>
              <header>
                <div>
                  <h2>{providerCapabilities[record.provider].label}</h2>
                  <p>{record.environment}</p>
                </div>
                <span className={`status ${record.ready ? "ready" : "neutral"}`}>
                  {record.ready ? "Customer ready" : "Gated"}
                </span>
              </header>
              {!record.implementationReady && (
                <div className="notice warning">
                  Source acceptance gate is active and cannot be bypassed here.
                </div>
              )}
              <div className="form-grid">
                <label>
                  Platform application ID
                  <input
                    value={record.applicationId ?? ""}
                    onChange={(event) =>
                      update(record.provider, {
                        applicationId: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  API version
                  <input
                    value={record.apiVersion ?? ""}
                    onChange={(event) =>
                      update(record.provider, { apiVersion: event.target.value })
                    }
                  />
                </label>
                <label>
                  Review status
                  <select
                    value={record.reviewStatus}
                    onChange={(event) =>
                      update(record.provider, {
                        reviewStatus: event.target.value,
                      })
                    }
                  >
                    {[
                      "not_started",
                      "submitted",
                      "sandbox",
                      "approved",
                      "rejected",
                    ].map((status) => (
                      <option key={status} value={status}>
                        {status.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Latest smoke test
                  <select
                    value={record.lastSmokeTestStatus ?? ""}
                    onChange={(event) =>
                      update(record.provider, {
                        lastSmokeTestStatus:
                          (event.target.value as "passed" | "failed") || null,
                      })
                    }
                  >
                    <option value="">Not run</option>
                    <option value="passed">Passed</option>
                    <option value="failed">Failed</option>
                  </select>
                </label>
                <label className="span-2">
                  Required scopes · comma separated
                  <input
                    value={record.requiredScopes.join(", ")}
                    onChange={(event) =>
                      update(record.provider, {
                        requiredScopes: event.target.value
                          .split(",")
                          .map((scope) => scope.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <label className="span-2">
                  Granted scopes · comma separated
                  <input
                    value={record.grantedScopes.join(", ")}
                    onChange={(event) =>
                      update(record.provider, {
                        grantedScopes: event.target.value
                          .split(",")
                          .map((scope) => scope.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
              </div>
              <div className="readiness-checks">
                {[
                  ["configured", "Application configured"],
                  ["redirectVerified", "Redirect verified"],
                  ["webhookVerified", "Webhook verified"],
                  ["tokenRefreshHealthy", "Token refresh healthy"],
                  ["webhookHealthy", "Webhook healthy"],
                  ["killSwitch", "Kill switch enabled"],
                ].map(([field, label]) => (
                  <label key={field}>
                    <input
                      type="checkbox"
                      checked={Boolean(
                        record[field as keyof PlatformProviderRecord],
                      )}
                      onChange={(event) =>
                        update(record.provider, {
                          [field]: event.target.checked,
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <footer>
                <p>{record.reason ?? "All readiness gates passed."}</p>
                <button
                  className="button primary"
                  disabled={saving === record.provider}
                  onClick={() => void save(record)}
                >
                  {saving === record.provider && (
                    <Loader2 className="spin" size={16} />
                  )}
                  Save evidence
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function TeamPage({ workspace, role }: { workspace: Workspace; role: string }) {
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("reviewer");
  const [showInvite, setShowInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/v1/invitations", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: workspace.id,
          email,
          role: inviteRole,
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        errors?: Array<{ message: string }>;
      };
      if (!result.ok)
        throw new Error(result.errors?.[0]?.message ?? "Invitation failed.");
      setMessage(`Invitation sent to ${email}.`);
      setEmail("");
      setShowInvite(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invitation failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <a className="back-link" href="/app/manage">
        <ArrowLeft size={17} /> Manage
      </a>
      <PageHeader
        title="Team"
        detail={`You are the ${role}. Invite reviewers and choose how campaign approval works.`}
        action={
          <button
            className="button primary"
            onClick={() => setShowInvite(true)}
          >
            <Plus size={18} /> Invite teammate
          </button>
        }
      />
      {error && (
        <div className="notice error">
          <CircleAlert size={18} />
          {error}
        </div>
      )}
      {message && (
        <div className="notice info">
          <Check size={18} />
          {message}
        </div>
      )}
      {showInvite && (
        <form className="panel team-invite" onSubmit={invite}>
          <label>
            Email address
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="reviewer@company.com"
            />
          </label>
          <label>
            Role
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value)}
            >
              <option value="reviewer">Reviewer</option>
              <option value="marketer">Marketer</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <Loader2 className="spin" size={17} />
            ) : (
              <ArrowRight size={17} />
            )}
            Send invite
          </button>
        </form>
      )}
      <section className="panel detail-panel">
        <div className="panel-heading">
          <div>
            <h2>Approval mode</h2>
            <p>
              Team mode prevents the campaign creator from approving their own
              version.
            </p>
          </div>
        </div>
        <div className="settings-choice">
          <label
            className={workspace.approval_mode === "solo" ? "selected" : ""}
          >
            <input
              type="radio"
              checked={workspace.approval_mode === "solo"}
              readOnly
            />
            <span>
              <b>Solo</b>
              <small>Owners may self-approve</small>
            </span>
          </label>
          <label
            className={workspace.approval_mode === "team" ? "selected" : ""}
          >
            <input
              type="radio"
              checked={workspace.approval_mode === "team"}
              readOnly
            />
            <span>
              <b>Team</b>
              <small>A separate reviewer must approve</small>
            </span>
          </label>
        </div>
      </section>
    </>
  );
}
function WorkspaceSettings({ workspace }: { workspace: Workspace }) {
  const [values, setValues] = useState({
    name: workspace.name,
    timezone: workspace.timezone,
    currency: workspace.currency,
    approvalMode: workspace.approval_mode,
    monthlySpendCeiling: workspace.monthly_spend_ceiling_cents
      ? String(workspace.monthly_spend_ceiling_cents / 100)
      : "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/v1/workspace-settings", {
        method: "PATCH",
        body: JSON.stringify({
          workspaceId: workspace.id,
          name: values.name,
          timezone: values.timezone,
          currency: values.currency,
          approvalMode: values.approvalMode,
          monthlySpendCeilingCents: values.monthlySpendCeiling
            ? Math.round(Number(values.monthlySpendCeiling) * 100)
            : null,
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        errors?: Array<{ message: string }>;
      };
      if (!result.ok)
        throw new Error(
          result.errors?.[0]?.message ?? "Settings could not be saved.",
        );
      setMessage("Workspace settings saved and audited.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Settings could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <a className="back-link" href="/app/manage">
        <ArrowLeft size={17} /> Manage
      </a>
      <PageHeader
        title="Workspace settings"
        detail="Operational defaults and hard safety limits."
      />
      {error && (
        <div className="notice error">
          <CircleAlert size={18} />
          {error}
        </div>
      )}
      {message && (
        <div className="notice info">
          <Check size={18} />
          {message}
        </div>
      )}
      <form className="panel settings-form" onSubmit={save}>
        <label>
          Workspace name
          <input
            value={values.name}
            onChange={(event) =>
              setValues({ ...values, name: event.target.value })
            }
          />
        </label>
        <label>
          Timezone
          <input
            value={values.timezone}
            onChange={(event) =>
              setValues({ ...values, timezone: event.target.value })
            }
          />
        </label>
        <label>
          Currency
          <select
            value={values.currency}
            onChange={(event) =>
              setValues({
                ...values,
                currency: event.target.value as "USD" | "CAD",
              })
            }
          >
            <option>CAD</option>
            <option>USD</option>
          </select>
        </label>
        <label>
          Monthly spend ceiling ({values.currency})
          <input
            type="number"
            min="1"
            value={values.monthlySpendCeiling}
            onChange={(event) =>
              setValues({ ...values, monthlySpendCeiling: event.target.value })
            }
            placeholder="Optional"
          />
        </label>
        <fieldset className="span-2 settings-choice">
          <legend>Approval mode</legend>
          <label className={values.approvalMode === "solo" ? "selected" : ""}>
            <input
              type="radio"
              checked={values.approvalMode === "solo"}
              onChange={() => setValues({ ...values, approvalMode: "solo" })}
            />
            <span>
              <b>Solo</b>
              <small>Owners may self-approve</small>
            </span>
          </label>
          <label className={values.approvalMode === "team" ? "selected" : ""}>
            <input
              type="radio"
              checked={values.approvalMode === "team"}
              onChange={() => setValues({ ...values, approvalMode: "team" })}
            />
            <span>
              <b>Team</b>
              <small>A separate reviewer is required</small>
            </span>
          </label>
        </fieldset>
        <button className="button primary" disabled={busy}>
          {busy ? <Loader2 className="spin" size={17} /> : <Check size={17} />}
          Save settings
        </button>
        <p className="muted">
          Every change is restricted to owners and administrators and recorded
          in the audit log.
        </p>
      </form>
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const good = [
    "approved",
    "live",
    "connected",
    "ready for preflight",
    "completed",
  ].includes(status);
  const bad = [
    "failed",
    "approval required",
    "rejected",
    "needs_attention",
  ].includes(status);
  return (
    <span className={`status ${good ? "ready" : bad ? "warning" : "neutral"}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
function CompactEmpty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="compact-empty">
      {icon}
      <span>{text}</span>
    </div>
  );
}
function EmptyPage({
  title,
  detail,
  inline = false,
}: {
  title: string;
  detail: string;
  inline?: boolean;
}) {
  return (
    <section className={`empty-page ${inline ? "inline" : ""}`}>
      <div>
        <Megaphone size={23} />
      </div>
      <h2>{title}</h2>
      <p>{detail}</p>
    </section>
  );
}
