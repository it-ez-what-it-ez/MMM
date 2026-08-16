"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Database,
  FileText,
  Gauge,
  Globe2,
  HeartPulse,
  Home,
  Library,
  Link2,
  ListFilter,
  Loader2,
  Megaphone,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  MousePointerClick,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  WandSparkles,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  channelKeys,
  channelNavigation,
  channelWorkspaces,
  campaignTabKeys,
  campaignTabRoute,
  classifyChannel,
  manageNavigation,
  operationsNavigation,
  primaryNavigation,
  product,
  resolveLegacyRoute,
  templateMatchesChannel,
  type ChannelKey,
} from "@/lib/product";
import type {
  ActionResult,
  AppState,
  Approval,
  ContentItem,
  IntegrationDefinition,
  Role,
} from "@/lib/types";

type ActionPayload = Record<string, unknown> & { type: string };
type Toast = { tone: "success" | "error"; message: string } | null;

const iconMap: Record<string, ReactNode> = {
  home: <Home />,
  campaign: <Megaphone />,
  calendar: <CalendarDays />,
  approval: <ShieldCheck />,
  brand: <Palette />,
  media: <Library />,
  audience: <Users />,
  integration: <Link2 />,
  sync: <RefreshCw />,
  insights: <BarChart3 />,
  ads: <Target />,
  team: <Users />,
  audit: <Activity />,
  settings: <Settings />,
  social: <Send />,
  messaging: <MessageSquareText />,
  web: <Globe2 />,
};

const roleLabels: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MARKETER: "Marketer",
  REVIEWER: "Reviewer",
  VIEWER: "Viewer",
};
const tone: Record<string, string> = {
  CONNECTED: "green",
  HEALTHY: "green",
  SUCCEEDED: "green",
  APPROVED: "green",
  PUBLISHED: "green",
  LIVE: "green",
  ACTIVE: "green",
  COMPLETED: "green",
  SCHEDULED: "blue",
  PAUSED: "neutral",
  DRAFT: "neutral",
  READY_FOR_REVIEW: "violet",
  AWAITING_APPROVAL: "amber",
  PENDING: "amber",
  DEGRADED: "amber",
  FAILED: "red",
  REJECTED: "red",
  ERROR: "red",
  COMING_SOON: "neutral",
  BETA: "violet",
};

function human(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function compact(value: number) {
  return Intl.NumberFormat("en", {
    notation: value > 9999 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}
function money(value: number, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
function date(value?: string, options?: Intl.DateTimeFormatOptions) {
  return value
    ? new Intl.DateTimeFormat(
        "en-CA",
        options ?? { month: "short", day: "numeric" },
      ).format(new Date(value))
    : "Not scheduled";
}
function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function Badge({ children, value }: { children?: ReactNode; value?: string }) {
  const label = value ?? String(children);
  return (
    <span className={`badge badge-${tone[label] ?? "neutral"}`}>
      {children ?? human(label)}
    </span>
  );
}

function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

function Modal({
  title,
  eyebrow,
  open,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) =>
      event.key === "Escape" && onClose();
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header className="modal-header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 id="modal-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  toneName = "teal",
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  toneName?: string;
}) {
  return (
    <article className="metric-card">
      <div className={`metric-icon metric-${toneName}`}>{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function IntegrationMark({
  definition,
  size = "normal",
}: {
  definition?: IntegrationDefinition;
  size?: "normal" | "large";
}) {
  return (
    <span
      className={`integration-mark mark-${size}`}
      style={
        {
          "--mark-hue": `${((definition?.name.charCodeAt(0) ?? 71) * 17) % 360}`,
        } as React.CSSProperties
      }
    >
      {definition?.name.slice(0, 1) ?? "?"}
    </span>
  );
}

type PreviewAsset = {
  channel: string;
  type: string;
  title: string;
  body: string;
};

function previewKind(asset: Pick<PreviewAsset, "channel" | "type">) {
  const value = `${asset.channel} ${asset.type}`.toLowerCase();
  if (value.includes("email")) return "email";
  if (value.includes("sms") || value.includes("whatsapp")) return "sms";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("facebook") && !value.includes("ads")) return "facebook";
  if (value.includes("instagram") && value.includes("carousel"))
    return "carousel";
  if (
    value.includes("reel") ||
    value.includes("short-form") ||
    value.includes("video")
  )
    return "video";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("ads") || value.includes("paid ad")) return "ad";
  if (
    value.includes("blog") ||
    value.includes("landing") ||
    value.includes("web")
  )
    return "web";
  return "professional";
}

function previewKindLabel(asset: Pick<PreviewAsset, "channel" | "type">) {
  const kind = previewKind(asset);
  const labels: Record<string, string> = {
    carousel: "Carousel",
    video: "Short video",
    email: "Email",
    sms: "SMS",
    tiktok: "TikTok",
    facebook: "Facebook post",
    instagram: "Instagram post",
    ad: "Paid ad",
    web: "Web page",
    professional: "Social post",
  };
  return labels[kind];
}

function TemplateCopy({
  text,
  variables = {},
  labels = {},
}: {
  text: string;
  variables?: Record<string, string>;
  labels?: Record<string, string>;
}) {
  return (
    <>
      {text
        .split(/(\{\{[a-zA-Z0-9]+\}\}|\n)/g)
        .filter(Boolean)
        .map((part, index) => {
          if (part === "\n") return <br key={`break-${index}`} />;
          const match = part.match(/^\{\{([a-zA-Z0-9]+)\}\}$/);
          if (!match) return <span key={`copy-${index}`}>{part}</span>;
          const key = match[1];
          const value = variables[key];
          return (
            <mark className="template-placeholder" key={`${key}-${index}`}>
              {value || labels[key] || human(key)}
            </mark>
          );
        })}
    </>
  );
}

function ProductVisual({
  media,
  tall = false,
}: {
  media?: AppState["media"][number];
  tall?: boolean;
}) {
  const uploaded = Boolean(media?.tags.includes("uploaded"));
  return (
    <div
      className={`product-visual-slot ${tall ? "product-visual-tall" : ""} ${media ? "has-product" : ""}`}
    >
      {uploaded && media?.kind === "IMAGE" ? (
        // R2 media is served through a workspace-scoped route at its original dimensions.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/media?id=${encodeURIComponent(media.id)}`}
          alt={media.name}
        />
      ) : (
        <div
          className="product-visual-placeholder"
          aria-label="Product image placeholder"
        >
          <span className="placeholder-product-shape">
            <i />
            <i />
            <i />
          </span>
          <strong>{media?.name ?? "Product image"}</strong>
          <small>
            {media
              ? "Selected from Brand & Assets"
              : "Your uploaded product goes here"}
          </small>
        </div>
      )}
    </div>
  );
}

function AssetPreview({
  asset,
  brandName,
  media,
  variables,
  variableLabels,
}: {
  asset: PreviewAsset;
  brandName: string;
  media?: AppState["media"][number];
  variables?: Record<string, string>;
  variableLabels?: Record<string, string>;
}) {
  const kind = previewKind(asset);
  const frames = asset.body
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  const copy = (value: string) => (
    <TemplateCopy text={value} variables={variables} labels={variableLabels} />
  );
  const brandAvatar = (
    <span className="mock-brand-avatar">{initials(brandName)}</span>
  );

  return (
    <article className={`asset-mockup asset-mockup-${kind}`}>
      <header className="asset-mockup-label">
        <span>{asset.channel}</span>
        <small>{previewKindLabel(asset)}</small>
      </header>

      {kind === "carousel" && (
        <div className="instagram-shell">
          <div className="social-account-row">
            {brandAvatar}
            <strong>{brandName}</strong>
            <MoreHorizontal />
          </div>
          <div className="carousel-slides" aria-label="Carousel slides">
            {frames.slice(0, 4).map((frame, index) => (
              <div key={frame}>
                {index === 0 && <ProductVisual media={media} />}
                <span>{index + 1}</span>
                <strong>
                  {copy(frame.replace(/^Slide \d+\s*[—:-]\s*/, ""))}
                </strong>
              </div>
            ))}
          </div>
          <div className="social-action-row">
            <span>♡</span>
            <span>○</span>
            <span>↗</span>
            <i />
          </div>
          <p>
            <strong>{brandName}</strong> {copy(asset.title)}
          </p>
        </div>
      )}

      {(kind === "video" || kind === "tiktok") && (
        <div
          className={`short-video-shell ${kind === "tiktok" ? "tiktok-shell" : ""}`}
        >
          <ProductVisual media={media} tall />
          <span className="video-duration">0:15</span>
          <span className="video-play">
            <Play />
          </span>
          <div className="video-overlay-copy">
            <strong>{copy(asset.title)}</strong>
            <small>@{brandName.toLowerCase().replaceAll(" ", "")}</small>
          </div>
          <div className="storyboard-strip">
            {frames.slice(0, 4).map((frame, index) => (
              <span key={frame}>
                <i>{index + 1}</i>
                {copy(frame.replace(/^Scene \d+\s*[—:-]\s*/, ""))}
              </span>
            ))}
          </div>
        </div>
      )}

      {kind === "instagram" && (
        <div className="instagram-shell">
          <div className="social-account-row">
            {brandAvatar}
            <strong>{brandName}</strong>
            <MoreHorizontal />
          </div>
          <ProductVisual media={media} />
          <div className="social-action-row">
            <span>♡</span>
            <span>○</span>
            <span>↗</span>
            <i />
          </div>
          <p>
            <strong>{brandName}</strong> {copy(asset.body)}
          </p>
        </div>
      )}

      {kind === "facebook" && (
        <div className="facebook-shell">
          <div className="social-account-row">
            {brandAvatar}
            <span>
              <strong>{brandName}</strong>
              <small>Sponsored · 1h</small>
            </span>
            <MoreHorizontal />
          </div>
          <p>{copy(asset.body)}</p>
          <ProductVisual media={media} />
          <div className="facebook-actions">
            <span>Like</span>
            <span>Comment</span>
            <span>Share</span>
          </div>
        </div>
      )}

      {kind === "email" && (
        <div className="email-shell">
          <div className="email-window-bar">
            <i />
            <i />
            <i />
            <span>Inbox preview</span>
          </div>
          <div className="email-meta">
            <span>From</span>
            <strong>{brandName}</strong>
            <span>Subject</span>
            <strong>{copy(asset.title)}</strong>
          </div>
          <div className="email-body-preview">
            <span className="email-logo">{brandName}</span>
            <ProductVisual media={media} />
            <h3>{copy(asset.title)}</h3>
            <p>{copy(asset.body)}</p>
            <button>{variables?.primaryCta || "Primary call to action"}</button>
            <small>Preferences · Unsubscribe</small>
          </div>
        </div>
      )}

      {kind === "sms" && (
        <div className="sms-shell">
          <div className="sms-phone-bar">
            <span>‹</span>
            <strong>{brandName}</strong>
            <i />
          </div>
          <time>Today 2:14 PM</time>
          <div className="sms-bubble">{copy(asset.body)}</div>
          <div className="sms-compose">
            <span>Message</span>
            <Send />
          </div>
        </div>
      )}

      {kind === "ad" && (
        <div className="ad-shell">
          <div className="social-account-row">
            {brandAvatar}
            <span>
              <strong>{brandName}</strong>
              <small>Sponsored</small>
            </span>
            <MoreHorizontal />
          </div>
          <p>{copy(asset.body)}</p>
          <ProductVisual media={media} />
          <div className="ad-link-card">
            <span>{variables?.productUrl || "your-product-page.com"}</span>
            <strong>{copy(asset.title)}</strong>
            <button>{variables?.primaryCta || "Learn more"}</button>
          </div>
        </div>
      )}

      {kind === "web" && (
        <div className="web-preview-shell">
          <div className="web-browser-bar">
            <i />
            <i />
            <i />
            <span>{brandName}</span>
          </div>
          <ProductVisual media={media} />
          <h3>{copy(asset.title)}</h3>
          <p>{copy(asset.body)}</p>
          <button>{variables?.primaryCta || "Learn more"}</button>
        </div>
      )}

      {kind === "professional" && (
        <div className="professional-post-shell">
          <div className="social-account-row">
            {brandAvatar}
            <span>
              <strong>{brandName}</strong>
              <small>Company · Just now</small>
            </span>
            <MoreHorizontal />
          </div>
          <p>{copy(asset.body)}</p>
          <ProductVisual media={media} />
          <div className="professional-actions">
            <span>Like</span>
            <span>Comment</span>
            <span>Repost</span>
            <span>Send</span>
          </div>
        </div>
      )}
    </article>
  );
}

export function GrowthOSApp({ initialPath }: { initialPath: string }) {
  const [state, setState] = useState<AppState | null>(null);
  const [path, setPath] = useState(initialPath);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load workspace");
      setState((await response.json()) as AppState);
    } catch (error) {
      setToast({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Could not load GrowthOS",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);
  useEffect(() => {
    const handle = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handle);
    const shortcuts = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        setAssistantOpen(true);
      }
    };
    document.addEventListener("keydown", shortcuts);
    return () => {
      window.removeEventListener("popstate", handle);
      document.removeEventListener("keydown", shortcuts);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(timeout);
  }, [toast]);

  const navigate = (target: string) => {
    const [pathname] = target.split("?");
    window.history.pushState({}, "", target);
    setPath(pathname);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const runAction = async <T,>(
    payload: ActionPayload,
    success: string,
  ): Promise<ActionResult<T>> => {
    const response = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as ActionResult<T>;
    if (result.ok) {
      setToast({ tone: "success", message: success });
      await load();
    } else setToast({ tone: "error", message: result.error });
    return result;
  };
  const switchIdentity = async (userId: string) => {
    await fetch("/api/identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setToast({ tone: "success", message: "Demo identity switched" });
    await load();
  };

  if (loading || !state)
    return (
      <div className="product-loader">
        <span className="brand-symbol">
          <span />
        </span>
        <div>
          <strong>GrowthOS</strong>
          <small>Loading Northstar Analytics…</small>
        </div>
        <div className="loader-line">
          <i />
        </div>
      </div>
    );

  const renderView = () => {
    const routedPath = resolveLegacyRoute(path);
    if (routedPath === "/app")
      return (
        <Dashboard state={state} navigate={navigate} runAction={runAction} />
      );
    if (routedPath === "/app/channels/paid/manage")
      return <PaidAdsView state={state} runAction={runAction} />;
    if (routedPath.startsWith("/app/channels/")) {
      const channel = routedPath.split("/")[3] as ChannelKey;
      if (channelKeys.includes(channel))
        return (
          <ChannelWorkspace
            channel={channel}
            state={state}
            navigate={navigate}
          />
        );
    }
    if (routedPath === "/app/integrations")
      return (
        <Integrations state={state} navigate={navigate} runAction={runAction} />
      );
    if (routedPath.startsWith("/app/integrations/"))
      return (
        <ConnectionDetail
          state={state}
          connectionId={routedPath.split("/").pop()!}
          navigate={navigate}
        />
      );
    if (routedPath === "/app/brand-kit")
      return <BrandKit state={state} runAction={runAction} />;
    if (routedPath.startsWith("/app/campaigns/new")) {
      const maybeChannel = routedPath.split("/")[4] as ChannelKey | undefined;
      return (
        <CampaignCreator
          state={state}
          navigate={navigate}
          runAction={runAction}
          initialChannel={
            maybeChannel && channelKeys.includes(maybeChannel)
              ? maybeChannel
              : undefined
          }
        />
      );
    }
    if (routedPath === "/app/campaigns/templates")
      return (
        <CampaignCreator
          state={state}
          navigate={navigate}
          runAction={runAction}
        />
      );
    if (routedPath === "/app/campaigns")
      return <Campaigns state={state} navigate={navigate} />;
    if (routedPath.startsWith("/app/campaigns/")) {
      const parts = routedPath.split("/");
      return (
        <CampaignWorkspace
          state={state}
          campaignId={parts[3]}
          activeTab={parts[4]}
          navigate={navigate}
          runAction={runAction}
        />
      );
    }
    if (routedPath === "/app/calendar")
      return <CalendarView state={state} runAction={runAction} />;
    if (routedPath === "/app/approvals")
      return <ApprovalsView state={state} runAction={runAction} />;
    if (routedPath === "/app/audiences")
      return <AudiencesView state={state} runAction={runAction} />;
    if (routedPath === "/app/syncs")
      return <SyncsView state={state} runAction={runAction} />;
    if (routedPath === "/app/insights")
      return (
        <InsightsView state={state} navigate={navigate} runAction={runAction} />
      );
    if (routedPath === "/app/team") return <TeamView state={state} />;
    if (routedPath === "/app/audit-log") return <AuditView state={state} />;
    if (routedPath === "/app/settings")
      return <SettingsView state={state} runAction={runAction} />;
    return (
      <Empty
        icon={<Search />}
        title="Page not found"
        text="This GrowthOS page is not available."
        action={
          <button className="button primary" onClick={() => navigate("/app")}>
            Back home
          </button>
        }
      />
    );
  };

  return (
    <div className={`app-frame ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <button className="brand-lockup" onClick={() => navigate("/app")}>
            <span className="brand-symbol">
              <span />
            </span>
            {sidebarOpen && <strong>{product.name}</strong>}
          </button>
          <button
            className="icon-button sidebar-toggle"
            onClick={() => setSidebarOpen((value) => !value)}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
          </button>
        </div>
        <button className="workspace-switch">
          <span className="workspace-mark">N</span>
          {sidebarOpen && (
            <>
              <span>
                <strong>{state.workspace.name}</strong>
                <small>Demo workspace</small>
              </span>
              <ChevronDown />
            </>
          )}
        </button>
        <button
          className="button create-button"
          onClick={() => navigate("/app/campaigns/new")}
        >
          <Plus />
          {sidebarOpen && "Create"}
        </button>
        <nav aria-label="Main navigation">
          {[
            { group: "", items: primaryNavigation },
            { group: "Channels", items: channelNavigation },
            { group: "", items: operationsNavigation },
          ].map((section, sectionIndex) => (
            <div
              className="nav-section"
              key={`${section.group}-${sectionIndex}`}
            >
              {sidebarOpen && section.group ? (
                <span className="nav-label">{section.group}</span>
              ) : null}
              {section.items.map(([label, href, icon]) => (
                <button
                  key={label}
                  className={`nav-item ${path === href || (href !== "/app" && path.startsWith(`${href}/`)) || (href === "/app/channels/paid" && path === "/app/paid-ads") ? "active" : ""}`}
                  title={!sidebarOpen ? label : undefined}
                  onClick={() => navigate(href)}
                >
                  {iconMap[icon]}
                  {sidebarOpen && <span>{label}</span>}
                  {label === "Approvals" &&
                    state.approvals.filter((item) => item.state === "PENDING")
                      .length > 0 && (
                      <i>
                        {
                          state.approvals.filter(
                            (item) => item.state === "PENDING",
                          ).length
                        }
                      </i>
                    )}
                </button>
              ))}
            </div>
          ))}
          <div className="nav-section manage-nav">
            <button
              className={`nav-item manage-trigger ${manageOpen ? "open" : ""}`}
              onClick={() => setManageOpen((value) => !value)}
              aria-expanded={manageOpen}
            >
              <Settings />
              {sidebarOpen && <span>Manage</span>}
              {sidebarOpen && (manageOpen ? <ChevronDown /> : <ChevronRight />)}
            </button>
            {manageOpen && (
              <div className="manage-items">
                {manageNavigation.map(([label, href, icon]) => (
                  <button
                    key={label}
                    className={`nav-item ${path === href || path.startsWith(`${href}/`) ? "active" : ""}`}
                    title={!sidebarOpen ? label : undefined}
                    onClick={() => navigate(href)}
                  >
                    {iconMap[icon]}
                    {sidebarOpen && <span>{label}</span>}
                  </button>
                ))}
                <button
                  className={`nav-item ${path === "/app/syncs" ? "active" : ""}`}
                  title={!sidebarOpen ? "Data Syncs" : undefined}
                  onClick={() => navigate("/app/syncs")}
                >
                  <RefreshCw />
                  {sidebarOpen && <span>Data Syncs</span>}
                </button>
              </div>
            )}
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="health-strip">
            <span className="pulse-dot" />
            {sidebarOpen && <span>All systems operational</span>}
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <section className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileNav(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <button
            className="command-trigger"
            onClick={() => setCommandOpen(true)}
          >
            <Search />
            <span>Search GrowthOS</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="topbar-actions">
            <button
              className="button ask-growthos"
              onClick={() => setAssistantOpen(true)}
            >
              <Sparkles /> Ask GrowthOS
            </button>
            <div className="identity-menu">
              <select
                aria-label="Demo identity"
                value={state.currentUser.id}
                onChange={(event) => void switchIdentity(event.target.value)}
              >
                {state.users.map((user) => (
                  <option value={user.id} key={user.id}>
                    {user.name} — {roleLabels[user.role]}
                  </option>
                ))}
              </select>
              <span className="avatar">{state.currentUser.initials}</span>
              <span className="identity-copy">
                <strong>{state.currentUser.name}</strong>
                <small>{roleLabels[state.currentUser.role]}</small>
              </span>
              <ChevronDown />
            </div>
          </div>
        </header>
        <main>{renderView()}</main>
      </section>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {[
          ["Home", "/app", <Home key="home" />],
          ["Campaigns", "/app/campaigns", <Megaphone key="campaigns" />],
          ["Social", "/app/channels/social", <Send key="social" />],
          ["Approvals", "/app/approvals", <ShieldCheck key="approvals" />],
        ].map(([label, href, icon]) => (
          <button
            key={String(label)}
            className={path === href ? "active" : ""}
            onClick={() => navigate(String(href))}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
        <button onClick={() => setMobileNav(true)}>
          <Menu />
          <span>More</span>
        </button>
      </nav>
      <Assistant
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        state={state}
        navigate={navigate}
      />
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        navigate={navigate}
      />
      {toast && (
        <div className={`toast toast-${toast.tone}`}>
          {toast.tone === "success" ? <CheckCircle2 /> : <XCircle />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function Dashboard({
  state,
  navigate,
}: {
  state: AppState;
  navigate: (path: string) => void;
  runAction: <T>(
    payload: ActionPayload,
    success: string,
  ) => Promise<ActionResult<T>>;
}) {
  const pendingApprovals = state.approvals
    .filter((item) => item.state === "PENDING")
    .slice(0, 3);
  const workToContinue = state.campaigns
    .filter((item) =>
      ["DRAFT", "READY_FOR_REVIEW", "AWAITING_APPROVAL", "SCHEDULED"].includes(
        item.state,
      ),
    )
    .slice(0, 3);
  const upcoming = state.content
    .filter((item) => item.state === "SCHEDULED" && item.scheduledAt)
    .sort(
      (a, b) =>
        new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime(),
    )
    .slice(0, 4);
  const degraded = state.connections.find(
    (item) => item.state === "DEGRADED" || item.state === "FAILED",
  );
  const failedSync = state.syncRuns.find((item) => item.state === "FAILED");
  const metrics = state.metrics.slice(-30).reduce(
    (sum, item) => ({
      impressions: sum.impressions + item.impressions,
      leads: sum.leads + item.leads,
      revenue: sum.revenue + item.revenue,
    }),
    { impressions: 0, leads: 0, revenue: 0 },
  );
  const draft = state.campaigns.find((item) => item.state === "DRAFT");
  const recommendation = pendingApprovals.length
    ? {
        title: `Review ${pendingApprovals.length} item${pendingApprovals.length === 1 ? "" : "s"} waiting for you`,
        text: "Keep scheduled work moving by making these approval decisions.",
        label: "Review approvals",
        href: "/app/approvals",
      }
    : draft
      ? {
          title: `Continue ${draft.title}`,
          text: "The campaign has a draft ready for its next step.",
          label: "Continue campaign",
          href: `/app/campaigns/${draft.id}/content`,
        }
      : degraded || failedSync
        ? {
            title: "Restore a marketing connection",
            text: "One connection needs attention before the next activation.",
            label: "View connections",
            href: "/app/integrations",
          }
        : {
            title: "Start your next coordinated campaign",
            text: "Choose a proven template and customize only what matters.",
            label: "Choose a template",
            href: "/app/campaigns/new",
          };

  return (
    <div className="page today-page">
      <PageHeader
        title="Today"
        description={`Welcome back, ${state.currentUser.name.split(" ")[0]}. Here is the work that matters next.`}
        actions={
          <button
            className="button primary"
            onClick={() => navigate("/app/campaigns/new")}
          >
            <Plus /> Create
          </button>
        }
      />

      {(degraded || failedSync) && (
        <button
          className="today-warning"
          onClick={() =>
            navigate(degraded ? "/app/integrations" : "/app/syncs")
          }
        >
          <AlertTriangle />
          <span>
            <strong>
              {degraded
                ? "A connection needs attention"
                : "A customer sync failed"}
            </strong>
            <small>
              {degraded?.lastError ??
                failedSync?.error ??
                "Review the diagnostic and retry when ready."}
            </small>
          </span>
          <ChevronRight />
        </button>
      )}

      <section className="recommended-action" aria-labelledby="next-action">
        <div>
          <span>Recommended next action</span>
          <h2 id="next-action">{recommendation.title}</h2>
          <p>{recommendation.text}</p>
        </div>
        <button
          className="button primary"
          onClick={() => navigate(recommendation.href)}
        >
          {recommendation.label} <ArrowRight />
        </button>
      </section>

      <div className="today-layout">
        <section className="card today-section">
          <div className="card-head">
            <div>
              <h2>Work to continue</h2>
              <p>Pick up where you left off.</p>
            </div>
          </div>
          <div className="comfortable-list">
            {workToContinue.map((campaign) => (
              <button
                key={campaign.id}
                onClick={() =>
                  navigate(`/app/campaigns/${campaign.id}/overview`)
                }
              >
                <span className="list-icon">
                  <Megaphone />
                </span>
                <span>
                  <strong>{campaign.title}</strong>
                  <small>{campaign.channels.join(" · ")}</small>
                </span>
                <Badge value={campaign.state} />
                <ChevronRight />
              </button>
            ))}
            {!workToContinue.length && (
              <Empty
                icon={<CheckCircle2 />}
                title="You are caught up"
                text="Start from a template when you are ready."
              />
            )}
          </div>
        </section>

        <section className="card today-section">
          <div className="card-head">
            <div>
              <h2>Needs approval</h2>
              <p>Up to three decisions awaiting review.</p>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("/app/approvals")}
            >
              View all
            </button>
          </div>
          <div className="comfortable-list">
            {pendingApprovals.map((approval) => {
              const item = state.content.find(
                (content) => content.id === approval.contentId,
              );
              return (
                <button
                  key={approval.id}
                  onClick={() => navigate("/app/approvals")}
                >
                  <span className="list-icon">
                    <ShieldCheck />
                  </span>
                  <span>
                    <strong>{item?.title ?? "Content review"}</strong>
                    <small>{item?.channel ?? "Campaign content"}</small>
                  </span>
                  <Badge value={approval.state} />
                  <ChevronRight />
                </button>
              );
            })}
            {!pendingApprovals.length && (
              <Empty
                icon={<CheckCircle2 />}
                title="No approvals waiting"
                text="New submissions will appear here."
              />
            )}
          </div>
        </section>
      </div>

      <section className="card today-section">
        <div className="card-head">
          <div>
            <h2>Coming up</h2>
            <p>Your next scheduled marketing moments.</p>
          </div>
          <button
            className="text-button"
            onClick={() => navigate("/app/calendar")}
          >
            Open calendar
          </button>
        </div>
        <div className="upcoming-row">
          {upcoming.map((item) => (
            <button
              key={item.id}
              onClick={() =>
                navigate(`/app/campaigns/${item.campaignId}/schedule`)
              }
            >
              <time>{date(item.scheduledAt)}</time>
              <strong>{item.title}</strong>
              <small>{item.channel}</small>
            </button>
          ))}
          {!upcoming.length && (
            <p className="muted-copy">Nothing is scheduled yet.</p>
          )}
        </div>
      </section>

      <section className="today-metrics" aria-label="Performance summary">
        <div>
          <span>Impressions</span>
          <strong>{compact(metrics.impressions)}</strong>
          <small>Last 30 days</small>
        </div>
        <div>
          <span>Leads</span>
          <strong>{compact(metrics.leads)}</strong>
          <small>Last 30 days</small>
        </div>
        <div>
          <span>Revenue</span>
          <strong>{money(metrics.revenue, state.workspace.currency)}</strong>
          <small>Last 30 days</small>
        </div>
      </section>
    </div>
  );
}

function ChannelWorkspace({
  channel,
  state,
  navigate,
}: {
  channel: ChannelKey;
  state: AppState;
  navigate: (path: string) => void;
}) {
  const config = channelWorkspaces[channel];
  const [tab, setTab] = useState<"work" | "templates" | "results">("work");
  const content = state.content.filter(
    (item) => classifyChannel(`${item.channel} ${item.type}`) === channel,
  );
  const templates = state.templates.filter((item) =>
    templateMatchesChannel(item, channel),
  );
  const totals = content.reduce(
    (sum, item) => ({
      impressions: sum.impressions + item.metrics.impressions,
      clicks: sum.clicks + item.metrics.clicks,
      conversions: sum.conversions + item.metrics.conversions,
    }),
    { impressions: 0, clicks: 0, conversions: 0 },
  );

  return (
    <div className="page channel-page">
      <PageHeader
        title={config.label}
        description={config.description}
        actions={
          <button
            className="button primary"
            onClick={() => navigate(`/app/campaigns/new/${channel}`)}
          >
            <Plus /> Create
          </button>
        }
      />
      <div className="simple-tabs" role="tablist" aria-label={config.label}>
        {[
          ["work", config.noun],
          ["templates", "Templates"],
          ["results", "Results"],
        ].map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value as "work" | "templates" | "results")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "work" && (
        <section className="card channel-work-list" role="tabpanel">
          <div className="comfortable-table-head">
            <span>{config.singular}</span>
            <span>Campaign</span>
            <span>Status</span>
            <span>Scheduled</span>
          </div>
          {channel === "paid" &&
            state.paidAds.map((ad) => (
              <button
                className="comfortable-table-row"
                key={ad.id}
                onClick={() => navigate("/app/channels/paid/manage")}
              >
                <span>
                  <strong>{ad.name}</strong>
                  <small>{ad.platform}</small>
                </span>
                <span>{ad.objective}</span>
                <span>
                  <Badge value={ad.state} />
                </span>
                <span>{ad.dateRange}</span>
              </button>
            ))}
          {content.map((item) => {
            const campaign = state.campaigns.find(
              (candidate) => candidate.id === item.campaignId,
            );
            return (
              <button
                className="comfortable-table-row"
                key={item.id}
                onClick={() =>
                  navigate(`/app/campaigns/${item.campaignId}/content`)
                }
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.channel}</small>
                </span>
                <span>{campaign?.title ?? "Campaign"}</span>
                <span>
                  <Badge value={item.state} />
                </span>
                <span>{date(item.scheduledAt)}</span>
              </button>
            );
          })}
          {!content.length && channel !== "paid" && (
            <Empty
              icon={iconMap[config.icon]}
              title={`No ${config.noun.toLowerCase()} yet`}
              text="Choose a template to create your first coordinated campaign."
              action={
                <button
                  className="button primary"
                  onClick={() => navigate(`/app/campaigns/new/${channel}`)}
                >
                  Choose a template
                </button>
              }
            />
          )}
        </section>
      )}

      {tab === "templates" && (
        <section className="simple-template-grid" role="tabpanel">
          {templates.slice(0, 6).map((template) => (
            <button
              className="card simple-template-card"
              key={template.id}
              onClick={() => navigate(`/app/campaigns/new/${channel}`)}
            >
              <span>{template.occasion}</span>
              <h3>{template.name}</h3>
              <p>{template.description}</p>
              <dl>
                <div>
                  <dt>Duration</dt>
                  <dd>{template.durationDays} days</dd>
                </div>
                <div>
                  <dt>Assets</dt>
                  <dd>{template.assets.length}</dd>
                </div>
              </dl>
              <small>{template.channels.join(" · ")}</small>
            </button>
          ))}
        </section>
      )}

      {tab === "results" && (
        <section className="channel-results" role="tabpanel">
          <div className="today-metrics">
            <div>
              <span>Impressions</span>
              <strong>{compact(totals.impressions)}</strong>
              <small>Across {content.length} items</small>
            </div>
            <div>
              <span>Clicks</span>
              <strong>{compact(totals.clicks)}</strong>
              <small>
                {totals.impressions
                  ? `${((totals.clicks / totals.impressions) * 100).toFixed(1)}% rate`
                  : "No activity yet"}
              </small>
            </div>
            <div>
              <span>Conversions</span>
              <strong>{compact(totals.conversions)}</strong>
              <small>Attributed results</small>
            </div>
          </div>
          <div className="card result-explainer">
            <h2>What changed</h2>
            <p>
              Results are derived from the campaigns already using this channel.
              No duplicate records or separate reporting setup is required.
            </p>
            <button
              className="text-button"
              onClick={() => navigate("/app/insights")}
            >
              View cross-channel insights <ArrowRight />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Integrations({
  state,
  navigate,
  runAction,
}: {
  state: AppState;
  navigate: (path: string) => void;
  runAction: <T>(
    payload: ActionPayload,
    success: string,
  ) => Promise<ActionResult<T>>;
}) {
  const [view, setView] = useState<"connected" | "browse">("connected");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [wizard, setWizard] = useState(false);
  const [selected, setSelected] = useState<IntegrationDefinition | null>(null);
  const [step, setStep] = useState(1);
  const [account, setAccount] = useState("Northstar Marketing");
  const [connecting, setConnecting] = useState(false);
  const categories = [
    "All",
    "Advertising",
    "Analytics",
    "CRM",
    "Content management",
    "Customer data",
    "Databases",
    "Email",
    "Messaging",
    "Payments",
    "Social publishing",
    "Storage",
    "Webhooks",
  ];
  const filtered = state.definitions.filter(
    (definition) =>
      (category === "All" || definition.category === category) &&
      `${definition.name} ${definition.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const openWizard = (definition?: IntegrationDefinition) => {
    setSelected(definition ?? null);
    setStep(definition ? 2 : 1);
    setWizard(true);
  };
  const connect = async () => {
    if (!selected) return;
    setConnecting(true);
    const result = await runAction<{ connectionId: string }>(
      {
        type: "connectIntegration",
        definitionId: selected.id,
        accountName: account,
      },
      `${selected.name} connected`,
    );
    setConnecting(false);
    if (result.ok) {
      setWizard(false);
      navigate(`/app/integrations/${result.data.connectionId}`);
    }
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="Activate"
        title="Integrations"
        description="Connect the data and destinations that power every GrowthOS action."
        actions={
          <button className="button primary" onClick={() => openWizard()}>
            <Plus /> Add integration
          </button>
        }
      />
      <div className="tabs-line">
        <button
          className={view === "connected" ? "active" : ""}
          onClick={() => setView("connected")}
        >
          Connected <span>{state.connections.length}</span>
        </button>
        <button
          className={view === "browse" ? "active" : ""}
          onClick={() => setView("browse")}
        >
          Browse catalog <span>{state.definitions.length}</span>
        </button>
      </div>
      {view === "connected" ? (
        <section className="card table-card">
          <div className="table-tools">
            <div className="search-box">
              <Search />
              <input
                placeholder="Search connected integrations"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="filter-buttons">
              <button className="button secondary">
                <ListFilter /> All connections
              </button>
              <button className="button secondary">
                Health <ChevronDown />
              </button>
            </div>
          </div>
          <div className="data-table integration-table">
            <div className="table-row table-header">
              <span>Integration</span>
              <span>Category</span>
              <span>Health</span>
              <span>Capabilities</span>
              <span>Last activity</span>
              <span />
            </div>
            {state.connections
              .filter((connection) => {
                const definition = state.definitions.find(
                  (item) => item.id === connection.definitionId,
                );
                return (
                  !search ||
                  `${definition?.name} ${connection.accountName}`
                    .toLowerCase()
                    .includes(search.toLowerCase())
                );
              })
              .map((connection) => {
                const definition = state.definitions.find(
                  (item) => item.id === connection.definitionId,
                );
                return (
                  <button
                    className="table-row"
                    key={connection.id}
                    onClick={() =>
                      navigate(`/app/integrations/${connection.id}`)
                    }
                  >
                    <span className="name-cell">
                      <IntegrationMark definition={definition} />
                      <span>
                        <strong>{definition?.name}</strong>
                        <small>{connection.accountName}</small>
                      </span>
                    </span>
                    <span>{definition?.category}</span>
                    <span>
                      <Badge value={connection.state} />
                      {connection.lastError && (
                        <small className="table-warning">
                          {connection.lastError}
                        </small>
                      )}
                    </span>
                    <span className="capability-stack">
                      {connection.capabilities.slice(0, 2).map((capability) => (
                        <em key={capability}>{human(capability)}</em>
                      ))}
                      {connection.capabilities.length > 2 && (
                        <em>+{connection.capabilities.length - 2}</em>
                      )}
                    </span>
                    <span>
                      <strong>{date(connection.lastActivity)}</strong>
                      <small>{connection.successRate}% success</small>
                    </span>
                    <span>
                      <ChevronRight />
                    </span>
                  </button>
                );
              })}
          </div>
        </section>
      ) : (
        <div className="catalog-layout">
          <aside className="category-rail">
            {categories.map((item) => (
              <button
                className={category === item ? "active" : ""}
                onClick={() => setCategory(item)}
                key={item}
              >
                {item}
                <span>
                  {item === "All"
                    ? state.definitions.length
                    : state.definitions.filter(
                        (definition) => definition.category === item,
                      ).length}
                </span>
              </button>
            ))}
          </aside>
          <section>
            <div className="catalog-head">
              <div className="search-box">
                <Search />
                <input
                  placeholder="Search 20+ integrations"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <span>{filtered.length} integrations</span>
            </div>
            <div className="catalog-grid">
              {filtered.map((definition) => {
                const connection = state.connections.find(
                  (item) => item.definitionId === definition.id,
                );
                return (
                  <article className="integration-card" key={definition.id}>
                    <div className="integration-card-head">
                      <IntegrationMark definition={definition} size="large" />
                      <div>
                        {connection ? (
                          <Badge value={connection.state} />
                        ) : definition.status !== "AVAILABLE" ? (
                          <Badge value={definition.status} />
                        ) : null}
                      </div>
                    </div>
                    <h3>{definition.name}</h3>
                    <p>{definition.description}</p>
                    <div className="capability-line">
                      {definition.capabilities.slice(0, 2).map((capability) => (
                        <span key={capability}>{human(capability)}</span>
                      ))}
                    </div>
                    {connection ? (
                      <button
                        className="button secondary full"
                        onClick={() =>
                          navigate(`/app/integrations/${connection.id}`)
                        }
                      >
                        View connection <ArrowRight />
                      </button>
                    ) : (
                      <button
                        className="button secondary full"
                        disabled={definition.status === "COMING_SOON"}
                        onClick={() => openWizard(definition)}
                      >
                        {definition.status === "COMING_SOON"
                          ? "Coming soon"
                          : "Connect"}{" "}
                        <ArrowRight />
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}
      <Modal
        open={wizard}
        onClose={() => setWizard(false)}
        title={selected ? `Connect ${selected.name}` : "Add integration"}
        eyebrow={`Step ${step} of 4`}
        wide
      >
        <div className="wizard-progress">
          {["Select", "Connect", "Configure", "Finalize"].map(
            (label, index) => (
              <span className={step >= index + 1 ? "active" : ""} key={label}>
                <i>{step > index + 1 ? <Check /> : index + 1}</i>
                {label}
              </span>
            ),
          )}
        </div>
        <div className="modal-body">
          {step === 1 && (
            <>
              <div className="search-box wizard-search">
                <Search />
                <input
                  placeholder="Search integrations"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="wizard-list">
                {filtered
                  .filter((item) => item.status !== "COMING_SOON")
                  .slice(0, 8)
                  .map((definition) => (
                    <button
                      onClick={() => {
                        setSelected(definition);
                        setStep(2);
                      }}
                      key={definition.id}
                    >
                      <IntegrationMark definition={definition} />
                      <span>
                        <strong>{definition.name}</strong>
                        <small>{definition.description}</small>
                      </span>
                      <ChevronRight />
                    </button>
                  ))}
              </div>
            </>
          )}
          {step === 2 && selected && (
            <div className="auth-panel">
              <IntegrationMark definition={selected} size="large" />
              <h3>Authorize {selected.name}</h3>
              <p>
                GrowthOS will simulate secure{" "}
                {selected.authType === "OAUTH"
                  ? "OAuth authorization"
                  : human(selected.authType)}
                . No real provider password or credential is requested.
              </p>
              <label>
                Mock account
                <select
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                >
                  <option>Northstar Marketing</option>
                  <option>Northstar Sandbox</option>
                  <option>Northstar Analytics — Canada</option>
                </select>
              </label>
              <button className="button primary" onClick={() => setStep(3)}>
                Continue to provider <ArrowRight />
              </button>
              <small className="security-note">
                <ShieldCheck /> Encrypted-secret interface enabled. Demo
                credentials only.
              </small>
            </div>
          )}
          {step === 3 && selected && (
            <div className="form-grid">
              <label>
                Connection name
                <input
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                />
              </label>
              <label>
                Region
                <select>
                  <option>North America</option>
                  <option>Europe</option>
                </select>
              </label>
              <label>
                Sync behavior
                <select>
                  <option>Incremental when possible</option>
                  <option>Full refresh</option>
                </select>
              </label>
              <label>
                Approval requirement
                <select>
                  <option>Required for consequential actions</option>
                  <option>Workspace default</option>
                </select>
              </label>
              <label className="checkbox-row">
                <input type="checkbox" defaultChecked /> Alert admins after
                recoverable errors
              </label>
              <label className="checkbox-row">
                <input type="checkbox" defaultChecked /> Enable all granted
                capabilities
              </label>
            </div>
          )}
          {step === 4 && selected && (
            <div className="finalize-panel">
              <div className="success-orb">
                <Check />
              </div>
              <h3>Ready to connect</h3>
              <p>
                {account} will be connected with {selected.capabilities.length}{" "}
                granted capabilities.
              </p>
              <dl>
                <div>
                  <dt>Provider</dt>
                  <dd>{selected.name}</dd>
                </div>
                <div>
                  <dt>Account</dt>
                  <dd>{account}</dd>
                </div>
                <div>
                  <dt>Authentication</dt>
                  <dd>{human(selected.authType)}</dd>
                </div>
                <div>
                  <dt>Test result</dt>
                  <dd className="green-text">Connection healthy · 184ms</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
        <footer className="modal-footer">
          <button
            className="button ghost"
            onClick={() => (step > 1 ? setStep(step - 1) : setWizard(false))}
          >
            {step > 1 && <ArrowLeft />}
            {step > 1 ? "Back" : "Cancel"}
          </button>
          {step >= 3 && (
            <button
              className="button primary"
              onClick={() => (step === 3 ? setStep(4) : void connect())}
              disabled={connecting}
            >
              {connecting ? (
                <Loader2 className="spin" />
              ) : step === 4 ? (
                <Check />
              ) : null}
              {step === 4 ? "Connect integration" : "Review"}
              <ArrowRight />
            </button>
          )}
        </footer>
      </Modal>
    </div>
  );
}

function ConnectionDetail({
  state,
  connectionId,
  navigate,
}: {
  state: AppState;
  connectionId: string;
  navigate: (path: string) => void;
}) {
  const [tab, setTab] = useState("Overview");
  const connection = state.connections.find((item) => item.id === connectionId);
  const definition = state.definitions.find(
    (item) => item.id === connection?.definitionId,
  );
  if (!connection || !definition)
    return (
      <Empty
        icon={<Link2 />}
        title="Connection not found"
        text="This connection may have been removed."
      />
    );
  const runs = state.syncRuns.filter((run) =>
    state.syncs
      .find((sync) => sync.id === run.syncId)
      ?.destination.includes(definition.name.split(" ")[0]),
  );
  return (
    <div className="page">
      <button
        className="back-link"
        onClick={() => navigate("/app/integrations")}
      >
        <ArrowLeft /> Integrations
      </button>
      <PageHeader
        title={definition.name}
        description={connection.accountName}
        actions={
          <>
            <button className="button secondary">
              <RefreshCw /> Reconnect
            </button>
            <button className="button primary">
              <HeartPulse /> Test connection
            </button>
          </>
        }
      />
      <section className="connection-hero card">
        <div className="connection-title">
          <IntegrationMark definition={definition} size="large" />
          <div>
            <Badge value={connection.state} />
            <h2>{connection.accountName}</h2>
            <p>Connected to {state.workspace.name}</p>
          </div>
        </div>
        <div className="health-score">
          <span
            style={
              {
                "--score": `${connection.successRate * 3.6}deg`,
              } as React.CSSProperties
            }
          >
            <strong>{connection.successRate}%</strong>
          </span>
          <div>
            <strong>Sync success rate</strong>
            <small>Last 30 days</small>
          </div>
        </div>
        <div className="connection-meta">
          <span>
            <Clock3 />
            <small>Last activity</small>
            <strong>
              {date(connection.lastActivity, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </strong>
          </span>
          <span>
            <Zap />
            <small>Capabilities</small>
            <strong>{connection.capabilities.length} enabled</strong>
          </span>
          <span>
            <Gauge />
            <small>API latency</small>
            <strong>184 ms</strong>
          </span>
        </div>
      </section>
      <div className="tabs-line">
        {["Overview", "Capabilities", "Activity", "Syncs", "Settings"].map(
          (item) => (
            <button
              className={tab === item ? "active" : ""}
              onClick={() => setTab(item)}
              key={item}
            >
              {item}
            </button>
          ),
        )}
      </div>
      {tab === "Overview" && (
        <div className="two-column">
          <section className="card">
            <div className="card-head">
              <div>
                <span className="eyebrow">Health</span>
                <h2>Connection status</h2>
              </div>
              <Badge value={connection.state} />
            </div>
            {connection.lastError ? (
              <div className="alert amber">
                <AlertTriangle />
                <span>
                  <strong>Recoverable warning</strong>
                  <small>{connection.lastError}</small>
                </span>
              </div>
            ) : (
              <div className="alert green">
                <CheckCircle2 />
                <span>
                  <strong>Everything looks healthy</strong>
                  <small>
                    Authentication, permissions, and recent operations passed.
                  </small>
                </span>
              </div>
            )}
            <div className="detail-list">
              <div>
                <span>Connected account</span>
                <strong>{connection.accountName}</strong>
              </div>
              <div>
                <span>Authentication</span>
                <strong>{human(definition.authType)}</strong>
              </div>
              <div>
                <span>Region</span>
                <strong>North America</strong>
              </div>
              <div>
                <span>Last health check</span>
                <strong>3 minutes ago</strong>
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <div>
                <span className="eyebrow">Recent activity</span>
                <h2>Provider operations</h2>
              </div>
            </div>
            <div className="activity-list">
              {state.audits
                .filter(
                  (event) =>
                    event.entityId === connection.id ||
                    event.detail.includes(definition.name),
                )
                .slice(0, 4)
                .map((event) => (
                  <div key={event.id}>
                    <span className="activity-node" />
                    <span>
                      <strong>{human(event.action)}</strong>
                      <small>{event.detail}</small>
                    </span>
                    <time>{date(event.createdAt)}</time>
                  </div>
                ))}
              {!state.audits.some(
                (event) =>
                  event.entityId === connection.id ||
                  event.detail.includes(definition.name),
              ) && (
                <Empty
                  icon={<Activity />}
                  title="No recent changes"
                  text="Provider activity will appear here."
                />
              )}
            </div>
          </section>
        </div>
      )}
      {tab === "Capabilities" && (
        <section className="card capability-detail-grid">
          {connection.capabilities.map((capability) => (
            <div key={capability}>
              <span>
                <Zap />
              </span>
              <div>
                <strong>{human(capability)}</strong>
                <small>
                  Granted and available to approved GrowthOS workflows.
                </small>
              </div>
              <Badge value="CONNECTED" />
            </div>
          ))}
        </section>
      )}
      {tab === "Activity" && (
        <section className="card">
          <div className="activity-list roomy">
            {state.audits.slice(0, 8).map((event) => (
              <div key={event.id}>
                <span className="activity-node" />
                <span>
                  <strong>{human(event.action)}</strong>
                  <small>{event.detail}</small>
                </span>
                <time>
                  {date(event.createdAt, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            ))}
          </div>
        </section>
      )}
      {tab === "Syncs" && (
        <section className="card data-table">
          <div className="table-row table-header">
            <span>Sync</span>
            <span>Status</span>
            <span>Accepted</span>
            <span>Duration</span>
          </div>
          {runs.map((run) => (
            <div className="table-row" key={run.id}>
              <span>
                {state.syncs.find((sync) => sync.id === run.syncId)?.name}
              </span>
              <span>
                <Badge value={run.state} />
              </span>
              <span>{compact(run.accepted)}</span>
              <span>{run.duration}</span>
            </div>
          ))}
        </section>
      )}
      {tab === "Settings" && (
        <section className="card danger-settings">
          <h2>Connection settings</h2>
          <p>
            Consequential changes require explicit confirmation and create an
            audit event.
          </p>
          <div>
            <button className="button secondary">Disable connection</button>
            <button className="button danger">Delete connection</button>
          </div>
        </section>
      )}
    </div>
  );
}

function BrandKit({
  state,
  runAction,
}: {
  state: AppState;
  runAction: <T>(
    payload: ActionPayload,
    success: string,
  ) => Promise<ActionResult<T>>;
}) {
  const queryTab =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("tab")
      : null;
  const [tab, setTab] = useState(
    queryTab === "media" ? "Media Library" : "Brand Profile",
  );
  const [toneValue, setToneValue] = useState(state.brand.voice.tone);
  const [traits, setTraits] = useState(state.brand.voice.traits.join(", "));
  const [avoid, setAvoid] = useState(state.brand.voice.avoid.join(", "));
  const [importUrl, setImportUrl] = useState(state.brand.website);
  const [importDraft, setImportDraft] = useState<{
    description: string;
    valueProposition: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const save = () =>
    runAction(
      {
        type: "saveBrandVoice",
        tone: toneValue,
        traits: traits
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        avoid: avoid
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      },
      "Brand voice updated",
    );
  const importWebsite = async () => {
    const response = await fetch("/api/brand/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: importUrl }),
    });
    const result = await response.json();
    if (result.ok) setImportDraft(result.draft);
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/media", { method: "POST", body: form });
    setUploading(false);
    if (response.ok) {
      await runAction(
        {
          type: "saveBrandVoice",
          tone: toneValue,
          traits: state.brand.voice.traits,
          avoid: state.brand.voice.avoid,
        },
        "Media uploaded and approved for AI",
      );
    }
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="Brand context"
        title="Brand Kit"
        description="The shared context and guardrails behind every AI-generated campaign."
        actions={
          <>
            <span className="saved-state">
              <CheckCircle2 /> Updated {date(state.brand.updatedAt)}
            </span>
            <button className="button primary" onClick={() => void save()}>
              <Check /> Save changes
            </button>
          </>
        }
      />
      <div className="tabs-line">
        {[
          "Brand Profile",
          "Styles & Voice",
          "Media Library",
          "Source Materials",
        ].map((item) => (
          <button
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
            key={item}
          >
            {item}
          </button>
        ))}
      </div>
      {tab === "Brand Profile" && (
        <div className="brand-layout">
          <section className="card form-section">
            <div className="section-heading">
              <span className="number-chip">01</span>
              <div>
                <h2>Business foundation</h2>
                <p>Describe what Northstar does and why customers choose it.</p>
              </div>
            </div>
            <div className="form-grid">
              <label>
                Brand name
                <input defaultValue={state.brand.name} />
              </label>
              <label>
                Website
                <input defaultValue={state.brand.website} />
              </label>
              <label className="span-2">
                Description
                <textarea rows={4} defaultValue={state.brand.description} />
              </label>
              <label className="span-2">
                Primary value proposition
                <textarea
                  rows={3}
                  defaultValue={state.brand.valueProposition}
                />
              </label>
              <label className="span-2">
                Target audiences
                <div className="tag-input">
                  {state.brand.audiences.map((item) => (
                    <span key={item}>
                      {item}
                      <X />
                    </span>
                  ))}
                  <button>
                    <Plus /> Add audience
                  </button>
                </div>
              </label>
              <label>
                Primary CTA
                <input defaultValue="Book a demo" />
              </label>
              <label>
                Markets
                <input defaultValue="Canada, United States, United Kingdom" />
              </label>
              <label className="span-2">
                Prohibited claims
                <div className="tag-input warning-tags">
                  {state.brand.prohibitedClaims.map((item) => (
                    <span key={item}>
                      {item}
                      <X />
                    </span>
                  ))}
                </div>
              </label>
            </div>
          </section>
          <aside className="card import-card">
            <span className="ai-orb">
              <Sparkles />
            </span>
            <h2>Import from website</h2>
            <p>
              GrowthOS can create a draft from public website copy. Nothing
              changes until you confirm.
            </p>
            <label>
              Website URL
              <input
                value={importUrl}
                onChange={(event) => setImportUrl(event.target.value)}
              />
            </label>
            <button
              className="button secondary full"
              onClick={() => void importWebsite()}
            >
              <Globe2 /> Analyze website
            </button>
            {importDraft && (
              <div className="import-preview">
                <Badge value="READY_FOR_REVIEW" />
                <strong>Generated profile preview</strong>
                <p>{importDraft.description}</p>
                <button className="button primary full">
                  Confirm and replace
                </button>
              </div>
            )}
            <small className="security-note">
              <ShieldCheck /> Server-side fetch with private-network protection.
            </small>
          </aside>
        </div>
      )}
      {tab === "Styles & Voice" && (
        <div className="brand-layout">
          <section className="card form-section">
            <div className="section-heading">
              <span className="number-chip violet-chip">
                <Sparkles />
              </span>
              <div>
                <h2>Voice and language</h2>
                <p>Keep generated copy recognizably Northstar.</p>
              </div>
            </div>
            <div className="preset-row">
              {[
                "Friendly expert",
                "Bold challenger",
                "Calm premium",
                "Technical authority",
                "Playful conversational",
              ].map((preset) => (
                <button
                  className={toneValue === preset ? "active" : ""}
                  onClick={() => setToneValue(preset)}
                  key={preset}
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label>
                Tone
                <select
                  value={toneValue}
                  onChange={(event) => setToneValue(event.target.value)}
                >
                  {[
                    "Friendly expert",
                    "Bold challenger",
                    "Calm premium",
                    "Technical authority",
                    "Playful conversational",
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Reading level
                <select defaultValue={state.brand.voice.readingLevel}>
                  <option>Grade 8</option>
                  <option>General business</option>
                  <option>Technical</option>
                </select>
              </label>
              <label className="span-2">
                Voice traits
                <input
                  value={traits}
                  onChange={(event) => setTraits(event.target.value)}
                />
              </label>
              <label className="span-2">
                Words to avoid
                <input
                  value={avoid}
                  onChange={(event) => setAvoid(event.target.value)}
                />
              </label>
              <label>
                Emoji preference
                <select defaultValue={state.brand.voice.emoji}>
                  <option>Never</option>
                  <option>Rarely</option>
                  <option>Sometimes</option>
                </select>
              </label>
              <label>
                Sentence style
                <select>
                  <option>Concise and direct</option>
                  <option>Conversational</option>
                  <option>Editorial</option>
                </select>
              </label>
              <label className="span-2">
                Approved copy example
                <textarea
                  rows={5}
                  defaultValue="Most SaaS teams do not need more dashboards. They need a clearer path from signal to action."
                />
              </label>
            </div>
          </section>
          <aside className="card voice-preview">
            <span className="eyebrow">
              <WandSparkles /> Live voice preview
            </span>
            <h3>Clarity creates momentum.</h3>
            <p>
              See the signals shaping your customer journey—and give every team
              a clearer next move.
            </p>
            <div>
              <span>Confident</span>
              <span>Clear</span>
              <span>Helpful</span>
            </div>
            <small>Generated from the current voice settings</small>
          </aside>
        </div>
      )}
      {tab === "Media Library" && (
        <section>
          <div className="library-toolbar">
            <div className="search-box">
              <Search />
              <input placeholder="Search media" />
            </div>
            <div>
              <button className="button secondary">
                <ListFilter /> Filter
              </button>
              <label className="button primary upload-button">
                {uploading ? <Loader2 className="spin" /> : <Plus />} Upload
                image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => void upload(event.target.files?.[0])}
                />
              </label>
            </div>
          </div>
          <div className="media-grid">
            {state.media.map((item, index) => (
              <article className="media-card" key={item.id}>
                <div className={`media-art art-${index % 3}`}>
                  <span>
                    {item.kind === "VIDEO" ? <Play /> : <BarChart3 />}
                  </span>
                </div>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.kind} · {item.tags.join(" · ")}
                  </small>
                  <span
                    className={item.approvedForAi ? "ai-approved" : "ai-off"}
                  >
                    {item.approvedForAi ? <Check /> : <X />}{" "}
                    {item.approvedForAi ? "Approved for AI" : "Not used by AI"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {tab === "Source Materials" && (
        <section>
          <div className="library-toolbar">
            <div className="search-box">
              <Search />
              <input placeholder="Search source materials" />
            </div>
            <button className="button primary">
              <Plus /> Add material
            </button>
          </div>
          <div className="source-list">
            {state.sources.map((item) => (
              <article className="card" key={item.id}>
                <span className="source-icon">
                  <FileText />
                </span>
                <div>
                  <Badge>{item.kind}</Badge>
                  <h3>{item.name}</h3>
                  <p>{item.extractedText}</p>
                  <small>Added {date(item.createdAt)}</small>
                </div>
                <button className="icon-button">
                  <MoreHorizontal />
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Campaigns({
  state,
  navigate,
}: {
  state: AppState;
  navigate: (path: string) => void;
}) {
  const [filter, setFilter] = useState<
    "All" | "Active" | "Drafts" | "Completed"
  >("All");
  const [channel, setChannel] = useState<ChannelKey | "all">("all");
  const matchesStatus = (campaign: AppState["campaigns"][number]) => {
    if (filter === "All") return true;
    if (filter === "Drafts") return campaign.state === "DRAFT";
    if (filter === "Completed")
      return ["COMPLETED", "ARCHIVED"].includes(campaign.state);
    return [
      "LIVE",
      "SCHEDULED",
      "READY_FOR_REVIEW",
      "AWAITING_APPROVAL",
    ].includes(campaign.state);
  };
  const items = state.campaigns.filter(
    (campaign) =>
      matchesStatus(campaign) &&
      (channel === "all" ||
        campaign.channels.some((item) => classifyChannel(item) === channel)),
  );

  return (
    <div className="page campaigns-simple-page">
      <PageHeader
        title="Campaigns"
        description="Plan, review, schedule, and measure coordinated marketing work."
        actions={
          <button
            className="button primary"
            onClick={() => navigate("/app/campaigns/new")}
          >
            <Plus /> New campaign
          </button>
        }
      />
      <div className="campaign-filter-row">
        <div className="segmented" aria-label="Campaign status">
          {(["All", "Active", "Drafts", "Completed"] as const).map((item) => (
            <button
              key={item}
              className={filter === item ? "active" : ""}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="channel-filter-chips" aria-label="Campaign channel">
          <button
            className={channel === "all" ? "active" : ""}
            onClick={() => setChannel("all")}
          >
            All channels
          </button>
          {channelKeys.map((key) => (
            <button
              className={channel === key ? "active" : ""}
              key={key}
              onClick={() => setChannel(key)}
            >
              {channelWorkspaces[key].label}
            </button>
          ))}
        </div>
      </div>

      <section className="card campaign-comfortable-list">
        {items.map((campaign) => (
          <button
            key={campaign.id}
            className="campaign-comfortable-row"
            onClick={() => navigate(`/app/campaigns/${campaign.id}/overview`)}
          >
            <span className="campaign-row-main">
              <strong>{campaign.title}</strong>
              <small>{campaign.summary}</small>
              <span>{campaign.channels.join(" · ")}</span>
            </span>
            <span className="campaign-row-date">
              <small>Dates</small>
              <strong>
                {date(campaign.startDate)} – {date(campaign.endDate)}
              </strong>
            </span>
            <span className="campaign-row-progress">
              <small>Progress</small>
              <span>
                <i style={{ width: `${campaign.progress}%` }} />
              </span>
              <strong>{campaign.progress}%</strong>
            </span>
            <Badge value={campaign.state} />
            <ChevronRight />
          </button>
        ))}
        {!items.length && (
          <Empty
            icon={<Megaphone />}
            title="No campaigns in this view"
            text="Adjust the filters or start a new campaign from a template."
            action={
              <button
                className="button primary"
                onClick={() => navigate("/app/campaigns/new")}
              >
                Choose a template
              </button>
            }
          />
        )}
      </section>
    </div>
  );
}

function CampaignCreator({
  state,
  navigate,
  runAction,
  initialChannel,
}: {
  state: AppState;
  navigate: (path: string) => void;
  runAction: <T>(
    payload: ActionPayload,
    success: string,
  ) => Promise<ActionResult<T>>;
  initialChannel?: ChannelKey;
}) {
  type Template = AppState["templates"][number];
  const [mode, setMode] = useState<"template" | "custom">("template");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selected, setSelected] = useState<Template | null>(null);
  const [previewing, setPreviewing] = useState<Template | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [budget, setBudget] = useState("");
  const [timingNote, setTimingNote] = useState("");
  const [objective, setObjective] = useState("");
  const [channels, setChannels] = useState<string[]>(
    initialChannel
      ? (state.templates.find((template) =>
          templateMatchesChannel(template, initialChannel),
        )?.channels ?? [])
      : ["LinkedIn", "Email", "Meta Ads"],
  );
  const [advancedContext, setAdvancedContext] = useState("");
  const [creating, setCreating] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const defaultProductMedia =
    state.media.find(
      (item) =>
        item.kind === "IMAGE" &&
        item.approvedForAi &&
        item.tags.includes("product"),
    ) ??
    state.media.find((item) => item.kind === "IMAGE" && item.approvedForAi);
  const [selectedMediaId, setSelectedMediaId] = useState(
    defaultProductMedia?.id ?? "",
  );
  const selectedMedia = state.media.find((item) => item.id === selectedMediaId);

  const filteredTemplates = initialChannel
    ? state.templates.filter((template) =>
        templateMatchesChannel(template, initialChannel),
      )
    : state.templates;

  const recommendedStart = (template: Template) => {
    const seasonal: Record<string, string> = {
      "halloween-night-shift": "2026-10-14",
      "bfcm-revenue-sprint": "2026-11-02",
      "black-friday-flash-sale": "2026-11-14",
      "cyber-monday-conversion-push": "2026-11-28",
      "holiday-gift-guide": "2026-11-17",
    };
    if (seasonal[template.slug]) return seasonal[template.slug];
    const nextWeek = new Date();
    nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
    return nextWeek.toISOString().slice(0, 10);
  };

  const chooseTemplate = (template: Template) => {
    setSelected(template);
    setPreviewing(null);
    setReviewConfirmed(false);
    setCampaignName(
      template.category === "Seasonal"
        ? `${template.occasion} 2026 — ${state.brand.name}`
        : `${template.name} — ${state.brand.name}`,
    );
    setStartDate(recommendedStart(template));
    setBudget(String(template.recommendedBudget));
    setVariables(
      Object.fromEntries(
        template.variables.map((item) => [item.key, item.defaultValue]),
      ),
    );
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const createFromTemplate = async () => {
    if (!selected) return;
    setCreating(true);
    const result = await runAction<{ campaignId: string; assetCount: number }>(
      {
        type: "useCampaignTemplate",
        templateId: selected.id,
        name: campaignName,
        startDate,
        variables: {
          ...variables,
          productAssetId: selectedMediaId,
          productAssetName: selectedMedia?.name ?? "Product image placeholder",
        },
      },
      `${selected.name} created with ${selected.assets.length} scheduled drafts`,
    );
    setCreating(false);
    if (result.ok)
      navigate(`/app/campaigns/${result.data.campaignId}/overview`);
  };

  const createCustom = async () => {
    if (!objective.trim() || !channels.length) return;
    setCreating(true);
    const prompt = advancedContext.trim()
      ? `${objective.trim()}\n\nAdditional context: ${advancedContext.trim()}`
      : objective.trim();
    const result = await runAction<{ campaignId: string }>(
      { type: "createCampaign", prompt, channels },
      "Custom campaign created",
    );
    setCreating(false);
    if (result.ok)
      navigate(`/app/campaigns/${result.data.campaignId}/overview`);
  };

  const groupedAssets = selected
    ? channelKeys
        .map((key) => ({
          key,
          config: channelWorkspaces[key],
          assets: selected.assets.filter(
            (asset) =>
              classifyChannel(`${asset.channel} ${asset.type}`) === key,
          ),
        }))
        .filter((group) => group.assets.length)
    : [];
  const reviewVariables = {
    ...variables,
    productAssetId: selectedMediaId,
    productAssetName: selectedMedia?.name ?? "Product image placeholder",
  };
  const labelsFor = (template: Template) =>
    Object.fromEntries(
      template.variables.map((item) => [item.key, item.label]),
    );
  const featuredAsset =
    selected?.assets.find((asset) =>
      ["carousel", "video", "tiktok", "facebook", "instagram"].includes(
        previewKind(asset),
      ),
    ) ?? selected?.assets[0];

  return (
    <div className="page focused-creator-page">
      <button className="back-link" onClick={() => navigate("/app/campaigns")}>
        <ArrowLeft /> Campaigns
      </button>
      <PageHeader
        title={mode === "template" ? "Create a campaign" : "Create with AI"}
        description={
          mode === "template"
            ? "Start with a complete playbook and customize only what matters."
            : "Describe the outcome. GrowthOS will create a coordinated first draft."
        }
      />

      {mode === "template" ? (
        <>
          <ol className="creator-steps" aria-label="Campaign creation progress">
            {[
              ["1", "Choose a template"],
              ["2", "Customize essentials"],
              ["3", "Review and create"],
            ].map(([number, label], index) => (
              <li
                key={number}
                className={
                  step === index + 1
                    ? "active"
                    : step > index + 1
                      ? "complete"
                      : ""
                }
                aria-current={step === index + 1 ? "step" : undefined}
              >
                <span>{step > index + 1 ? <Check /> : number}</span>
                {label}
              </li>
            ))}
          </ol>

          {step === 1 && (
            <section className="creator-step-panel">
              <div className="section-heading">
                <div>
                  <h2>Choose a template</h2>
                  <p>
                    {initialChannel
                      ? `Showing templates for ${channelWorkspaces[initialChannel].label}.`
                      : "Each template creates a coordinated bundle you can edit before publishing."}
                  </p>
                </div>
                {initialChannel && (
                  <button
                    className="text-button"
                    onClick={() => navigate("/app/campaigns/new")}
                  >
                    Show all templates
                  </button>
                )}
              </div>
              <div className="focused-template-grid">
                {filteredTemplates.map((template) => (
                  <article
                    className="card focused-template-card"
                    key={template.id}
                  >
                    <div>
                      <span className="template-outcome">
                        {template.occasion}
                      </span>
                      <h3>{template.name}</h3>
                      <p>{template.description}</p>
                    </div>
                    <dl>
                      <div>
                        <dt>Duration</dt>
                        <dd>{template.durationDays} days</dd>
                      </div>
                      <div>
                        <dt>Assets</dt>
                        <dd>{template.assets.length}</dd>
                      </div>
                      <div>
                        <dt>Channels</dt>
                        <dd>{template.channels.length}</dd>
                      </div>
                    </dl>
                    <small>{template.channels.join(" · ")}</small>
                    <div
                      className="template-format-preview"
                      aria-label="Included formats"
                    >
                      {Array.from(
                        new Set(template.assets.map(previewKindLabel)),
                      )
                        .slice(0, 5)
                        .map((format) => (
                          <span key={format}>{format}</span>
                        ))}
                    </div>
                    <button
                      className="button secondary full template-preview-button"
                      onClick={() => setPreviewing(template)}
                    >
                      Preview {template.assets.length} assets
                    </button>
                  </article>
                ))}
              </div>
              <button
                className="custom-ai-option"
                onClick={() => setMode("custom")}
              >
                <Sparkles />
                <span>
                  <strong>Create a custom campaign with AI</strong>
                  <small>
                    Start from one objective when a template is not the right
                    fit.
                  </small>
                </span>
                <ArrowRight />
              </button>
            </section>
          )}

          {step === 2 && selected && (
            <form
              className="card creator-step-panel essentials-form"
              onSubmit={(event) => {
                event.preventDefault();
                setStep(3);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <div className="section-heading">
                <div>
                  <h2>Customize essentials</h2>
                  <p>
                    {selected.name} · {selected.assets.length} editable assets
                  </p>
                </div>
              </div>
              <div className="form-grid">
                <label className="span-2">
                  Campaign name
                  <input
                    required
                    value={campaignName}
                    onChange={(event) => setCampaignName(event.target.value)}
                  />
                </label>
                <label>
                  Start date
                  <input
                    required
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                  <small>
                    Asset dates are scheduled relative to this date.
                  </small>
                </label>
                <label className="span-2 product-media-field">
                  Product image or video
                  <select
                    value={selectedMediaId}
                    onChange={(event) => setSelectedMediaId(event.target.value)}
                  >
                    <option value="">
                      Product image placeholder — choose later
                    </option>
                    {state.media
                      .filter((item) => item.approvedForAi)
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name} · {human(item.kind)}
                        </option>
                      ))}
                  </select>
                  <small>
                    Uses an approved upload from Brand & Assets. You can leave a
                    visible placeholder and replace it later.
                  </small>
                </label>
                {selected.variables.map((item) => (
                  <label key={item.key}>
                    {item.label}
                    <input
                      required={item.required}
                      type={
                        item.kind === "number"
                          ? "number"
                          : item.kind === "url"
                            ? "url"
                            : "text"
                      }
                      value={variables[item.key] ?? ""}
                      onChange={(event) =>
                        setVariables((value) => ({
                          ...value,
                          [item.key]: event.target.value,
                        }))
                      }
                    />
                    <small>{item.help}</small>
                  </label>
                ))}
              </div>
              {featuredAsset && (
                <section className="essentials-live-preview">
                  <div>
                    <strong>Live product preview</strong>
                    <small>
                      This updates with the product and campaign details above.
                    </small>
                  </div>
                  <AssetPreview
                    asset={featuredAsset}
                    brandName={state.brand.name}
                    media={selectedMedia}
                    variables={reviewVariables}
                    variableLabels={labelsFor(selected)}
                  />
                </section>
              )}
              <details className="advanced-disclosure">
                <summary>Advanced</summary>
                <div className="form-grid">
                  <label>
                    Planning budget
                    <input
                      type="number"
                      min="0"
                      value={budget}
                      onChange={(event) => setBudget(event.target.value)}
                    />
                    <small>This does not activate paid spend.</small>
                  </label>
                  <label>
                    Timing notes
                    <input
                      value={timingNote}
                      onChange={(event) => setTimingNote(event.target.value)}
                      placeholder="Optional timing overrides"
                    />
                  </label>
                </div>
              </details>
              <footer className="focused-creator-footer">
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft /> Back
                </button>
                <button className="button primary" type="submit">
                  Review campaign <ArrowRight />
                </button>
              </footer>
            </form>
          )}

          {step === 3 && selected && (
            <section className="card creator-step-panel review-bundle">
              <div className="section-heading">
                <div>
                  <h2>Review and create</h2>
                  <p>
                    Confirm the bundle. Every asset remains editable and follows
                    the existing approval workflow.
                  </p>
                </div>
                <Badge value="DRAFT" />
              </div>
              <div className="review-summary">
                <div>
                  <span>Campaign</span>
                  <strong>{campaignName}</strong>
                </div>
                <div>
                  <span>Starts</span>
                  <strong>{date(startDate)}</strong>
                </div>
                <div>
                  <span>Total assets</span>
                  <strong>{selected.assets.length}</strong>
                </div>
              </div>
              <div className="visual-review-intro">
                <span className="review-eye-icon">
                  <CheckCircle2 />
                </span>
                <span>
                  <strong>
                    Review the actual creative—not just asset names
                  </strong>
                  <small>
                    Product placeholders and merge fields are highlighted. Every
                    item remains editable before formal approval or publishing.
                  </small>
                </span>
              </div>
              <div className="visual-review-groups">
                {groupedAssets.map((group) => (
                  <section className="visual-channel-review" key={group.key}>
                    <header>
                      <span>{iconMap[group.config.icon]}</span>
                      <div>
                        <h3>{group.config.label}</h3>
                        <p>
                          {group.assets.length}{" "}
                          {group.config.noun.toLowerCase()}
                        </p>
                      </div>
                    </header>
                    <div className="asset-preview-grid">
                      {group.assets.map((asset) => (
                        <div
                          className="review-asset-wrap"
                          key={`${asset.channel}-${asset.title}`}
                        >
                          <div className="review-asset-schedule">
                            <span>Day {asset.dayOffset + 1}</span>
                            <small>{asset.type}</small>
                          </div>
                          <AssetPreview
                            asset={asset}
                            brandName={state.brand.name}
                            media={selectedMedia}
                            variables={reviewVariables}
                            variableLabels={labelsFor(selected)}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <details className="advanced-disclosure review-details">
                <summary>Campaign details</summary>
                <p>
                  Recommended planning budget:{" "}
                  {money(Number(budget || 0), state.workspace.currency)}
                </p>
                {timingNote && <p>Timing note: {timingNote}</p>}
                <p>Audience: {selected.audience}</p>
              </details>
              <div className="campaign-review-confirmation">
                <input
                  id="confirm-campaign-review"
                  type="checkbox"
                  aria-label="I reviewed the campaign bundle"
                  checked={reviewConfirmed}
                  onChange={(event) => setReviewConfirmed(event.target.checked)}
                />
                <span>
                  <strong>I reviewed the campaign bundle</strong>
                  <small>
                    Create these as editable drafts. Nothing will publish until
                    the normal approval flow is complete.
                  </small>
                </span>
              </div>
              <footer className="focused-creator-footer">
                <button className="button ghost" onClick={() => setStep(2)}>
                  <ArrowLeft /> Back
                </button>
                <button
                  className="button primary"
                  onClick={() => void createFromTemplate()}
                  disabled={creating || !reviewConfirmed}
                >
                  {creating ? <Loader2 className="spin" /> : <Check />}
                  {creating ? "Creating drafts…" : "Looks good — create drafts"}
                </button>
              </footer>
            </section>
          )}
        </>
      ) : (
        <section className="card custom-ai-creator">
          <button className="back-link" onClick={() => setMode("template")}>
            <ArrowLeft /> Back to templates
          </button>
          <div>
            <h2>What should this campaign achieve?</h2>
            <p>Use one clear outcome. You can refine every draft afterward.</p>
          </div>
          <label>
            Campaign objective
            <textarea
              rows={6}
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="Increase qualified demo bookings for our analytics activation feature…"
            />
          </label>
          <fieldset className="custom-channel-picker">
            <legend>Channels</legend>
            {[
              "LinkedIn",
              "Instagram",
              "Email",
              "SMS",
              "Meta Ads",
              "Google Ads",
              "Blog",
            ].map((channelName) => (
              <label key={channelName}>
                <input
                  type="checkbox"
                  checked={channels.includes(channelName)}
                  onChange={() =>
                    setChannels((value) =>
                      value.includes(channelName)
                        ? value.filter((item) => item !== channelName)
                        : [...value, channelName],
                    )
                  }
                />
                {channelName}
              </label>
            ))}
          </fieldset>
          <details className="advanced-disclosure">
            <summary>Advanced context</summary>
            <label>
              Optional context
              <textarea
                rows={4}
                value={advancedContext}
                onChange={(event) => setAdvancedContext(event.target.value)}
                placeholder="Audience, offer, timing, or constraints…"
              />
            </label>
          </details>
          <footer className="focused-creator-footer">
            <button
              className="button ghost"
              onClick={() => setMode("template")}
            >
              Cancel
            </button>
            <button
              className="button primary"
              onClick={() => void createCustom()}
              disabled={creating || !objective.trim() || !channels.length}
            >
              {creating ? <Loader2 className="spin" /> : <Sparkles />}
              {creating ? "Creating campaign…" : "Create custom campaign"}
            </button>
          </footer>
        </section>
      )}
      <Modal
        open={Boolean(previewing)}
        onClose={() => setPreviewing(null)}
        title={previewing?.name ?? "Template preview"}
        eyebrow="See exactly what will be created"
        wide
      >
        {previewing && (
          <>
            <div className="template-visual-inspector">
              <aside>
                <strong>Campaign bundle</strong>
                <p>{previewing.description}</p>
                <dl>
                  <div>
                    <dt>Duration</dt>
                    <dd>{previewing.durationDays} days</dd>
                  </div>
                  <div>
                    <dt>Assets</dt>
                    <dd>{previewing.assets.length}</dd>
                  </div>
                  <div>
                    <dt>Channels</dt>
                    <dd>{previewing.channels.length}</dd>
                  </div>
                </dl>
                <div className="inspector-product-note">
                  <ProductVisual media={defaultProductMedia} />
                  <p>
                    The product area uses an approved Brand & Assets upload. If
                    none is selected, GrowthOS keeps a visible placeholder.
                  </p>
                </div>
                <div className="inspector-format-list">
                  <strong>Included formats</strong>
                  {Array.from(
                    new Set(previewing.assets.map(previewKindLabel)),
                  ).map((format) => (
                    <span key={format}>
                      <Check /> {format}
                    </span>
                  ))}
                </div>
              </aside>
              <section className="template-inspector-gallery">
                <div className="section-heading">
                  <div>
                    <h3>Every planned asset</h3>
                    <p>
                      Highlighted fields are replaced with your product and
                      campaign details during customization.
                    </p>
                  </div>
                </div>
                <div className="asset-preview-grid">
                  {previewing.assets.map((asset) => (
                    <div
                      className="review-asset-wrap"
                      key={`${asset.channel}-${asset.title}`}
                    >
                      <div className="review-asset-schedule">
                        <span>Day {asset.dayOffset + 1}</span>
                        <small>{asset.type}</small>
                      </div>
                      <AssetPreview
                        asset={asset}
                        brandName={state.brand.name}
                        media={defaultProductMedia}
                        variableLabels={labelsFor(previewing)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <footer className="modal-footer template-inspector-footer">
              <span>
                Nothing is created or published until you confirm the next
                steps.
              </span>
              <button
                className="button ghost"
                onClick={() => setPreviewing(null)}
              >
                Keep browsing
              </button>
              <button
                className="button primary"
                onClick={() => chooseTemplate(previewing)}
              >
                Use this template <ArrowRight />
              </button>
            </footer>
          </>
        )}
      </Modal>
    </div>
  );
}

function CampaignWorkspace({
  state,
  campaignId,
  activeTab,
  navigate,
  runAction,
}: {
  state: AppState;
  campaignId: string;
  activeTab?: string;
  navigate: (path: string) => void;
  runAction: <T>(
    payload: ActionPayload,
    success: string,
  ) => Promise<ActionResult<T>>;
}) {
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  const tab = campaignTabKeys.includes(
    activeTab as (typeof campaignTabKeys)[number],
  )
    ? (activeTab as (typeof campaignTabKeys)[number])
    : "overview";
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [body, setBody] = useState("");
  const [publishTarget, setPublishTarget] = useState<ContentItem | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<ContentItem | null>(
    null,
  );
  const [scheduleValue, setScheduleValue] = useState("");

  if (!campaign)
    return (
      <div className="page">
        <Empty
          icon={<Megaphone />}
          title="Campaign not found"
          text="This campaign may have been archived."
          action={
            <button
              className="button primary"
              onClick={() => navigate("/app/campaigns")}
            >
              View campaigns
            </button>
          }
        />
      </div>
    );

  const content = state.content.filter(
    (item) => item.campaignId === campaign.id,
  );
  const campaignVariables = campaign.plan.variables ?? {};
  const campaignProductMedia = state.media.find(
    (item) => item.id === campaignVariables.productAssetId,
  );
  const campaignApprovals = state.approvals.filter((approval) =>
    content.some((item) => item.id === approval.contentId),
  );
  const latestApprovalFor = (contentId: string) =>
    campaignApprovals.find((item) => item.contentId === contentId);
  const totals = content.reduce(
    (sum, item) => ({
      impressions: sum.impressions + item.metrics.impressions,
      clicks: sum.clicks + item.metrics.clicks,
      conversions: sum.conversions + item.metrics.conversions,
    }),
    { impressions: 0, clicks: 0, conversions: 0 },
  );
  const openEdit = (item: ContentItem) => {
    setEditing(item);
    setBody(item.body);
  };
  const goToTab = (next: (typeof campaignTabKeys)[number]) =>
    navigate(campaignTabRoute(campaign.id, next));

  return (
    <div className="page campaign-workspace campaign-workspace-simple">
      <button className="back-link" onClick={() => navigate("/app/campaigns")}>
        <ArrowLeft /> Campaigns
      </button>
      <PageHeader
        title={campaign.title}
        description={campaign.summary}
        actions={
          <>
            {tab !== "content" && (
              <button
                className="button primary"
                onClick={() => goToTab("content")}
              >
                Review content
              </button>
            )}
            <details className="page-overflow">
              <summary
                className="icon-button"
                aria-label="More campaign actions"
              >
                <MoreHorizontal />
              </summary>
              <div>
                <button onClick={() => goToTab("overview")}>Edit plan</button>
                <button onClick={() => navigate("/app/audit-log")}>
                  View activity
                </button>
              </div>
            </details>
          </>
        }
      />
      <div className="campaign-meta-bar quiet-meta">
        <Badge value={campaign.state} />
        <span>
          <CalendarDays />
          {date(campaign.startDate)} — {date(campaign.endDate)}
        </span>
        <span>{campaign.channels.join(" · ")}</span>
        <span>{campaign.progress}% complete</span>
      </div>

      <div
        className="simple-tabs campaign-four-tabs"
        role="tablist"
        aria-label="Campaign workspace"
      >
        {campaignTabKeys.map((item) => (
          <button
            role="tab"
            aria-selected={tab === item}
            className={tab === item ? "active" : ""}
            onClick={() => goToTab(item)}
            key={item}
          >
            {human(item)}
            {item === "content" &&
              campaignApprovals.some(
                (approval) => approval.state === "PENDING",
              ) && (
                <span className="tab-count">
                  {
                    campaignApprovals.filter(
                      (approval) => approval.state === "PENDING",
                    ).length
                  }
                </span>
              )}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="campaign-overview-simple" role="tabpanel">
          <section className="campaign-metrics compact-metrics">
            <MetricCard
              label="Progress"
              value={`${campaign.progress}%`}
              detail="Campaign completion"
              icon={<Gauge />}
            />
            <MetricCard
              label="Content"
              value={String(content.length)}
              detail={`${content.filter((item) => item.state === "PUBLISHED").length} published`}
              icon={<FileText />}
              toneName="violet"
            />
            <MetricCard
              label="Approvals"
              value={String(
                campaignApprovals.filter((item) => item.state === "PENDING")
                  .length,
              )}
              detail="Awaiting decision"
              icon={<ShieldCheck />}
              toneName="amber"
            />
          </section>
          <div className="overview-columns">
            <section className="card overview-detail-card">
              <h2>Campaign brief</h2>
              <dl className="definition-list">
                <div>
                  <dt>Objective</dt>
                  <dd>{campaign.objective}</dd>
                </div>
                <div>
                  <dt>Audience</dt>
                  <dd>{campaign.audience}</dd>
                </div>
                {campaign.offer && (
                  <div>
                    <dt>Offer</dt>
                    <dd>{campaign.offer}</dd>
                  </div>
                )}
              </dl>
            </section>
            <section className="card overview-detail-card">
              <h2>Plan</h2>
              <div className="simple-plan-block">
                <span>Topics</span>
                <ul>
                  {campaign.plan.topics.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="simple-plan-block">
                <span>Success measures</span>
                <ul>
                  {campaign.plan.successMetrics.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
          <section className="card overview-detail-card">
            <div className="section-heading">
              <div>
                <h2>Channels and destinations</h2>
                <p>Campaign work stays connected to the existing providers.</p>
              </div>
              <button
                className="text-button"
                onClick={() => navigate("/app/integrations")}
              >
                Manage connections
              </button>
            </div>
            <div className="destination-summary">
              {campaign.channels.map((channelName) => {
                const connected = state.connections.some((connection) => {
                  const definition = state.definitions.find(
                    (item) => item.id === connection.definitionId,
                  );
                  return (
                    connection.state === "CONNECTED" &&
                    definition?.name
                      .toLowerCase()
                      .includes(channelName.split(" ")[0].toLowerCase())
                  );
                });
                return (
                  <div key={channelName}>
                    <span className="channel-icon">
                      {initials(channelName)}
                    </span>
                    <span>
                      <strong>{channelName}</strong>
                      <small>
                        {connected ? "Connected" : "Review connection"}
                      </small>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {tab === "content" && (
        <section className="campaign-content-simple" role="tabpanel">
          <div className="section-heading">
            <div>
              <h2>{content.length} content items</h2>
              <p>Approval state is shown with every item.</p>
            </div>
          </div>
          <div className="campaign-content-list">
            {content.map((item) => {
              const approval = latestApprovalFor(item.id);
              return (
                <article
                  className="card content-comfortable-card"
                  key={item.id}
                >
                  <header>
                    <span className="channel-icon">
                      {initials(item.channel)}
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {item.channel} · {item.type} · Version {item.version}
                      </small>
                    </span>
                    <div>
                      {approval && <Badge value={approval.state} />}
                      <Badge value={item.state} />
                    </div>
                  </header>
                  <div className="campaign-asset-visual">
                    <AssetPreview
                      asset={item}
                      brandName={state.brand.name}
                      media={campaignProductMedia}
                      variables={campaignVariables}
                    />
                  </div>
                  <div className="content-detail-row">
                    <span>
                      <CalendarDays />
                      {date(item.scheduledAt, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    {item.externalId && (
                      <span>
                        <Link2 /> {item.externalId}
                      </span>
                    )}
                  </div>
                  <footer>
                    <button onClick={() => openEdit(item)}>
                      <Pencil /> Edit
                    </button>
                    <button
                      onClick={() =>
                        void runAction(
                          { type: "regenerateContent", contentId: item.id },
                          "New content version generated",
                        )
                      }
                    >
                      <RefreshCw /> Regenerate
                    </button>
                    <button
                      onClick={() => {
                        setScheduleTarget(item);
                        setScheduleValue(
                          item.scheduledAt?.slice(0, 16) ?? "2026-08-24T14:00",
                        );
                      }}
                    >
                      <CalendarDays /> Schedule
                    </button>
                    {item.state === "DRAFT" && (
                      <button
                        className="primary-link"
                        onClick={() =>
                          void runAction(
                            { type: "submitApproval", contentId: item.id },
                            "Content submitted for approval",
                          )
                        }
                      >
                        <Send /> Submit
                      </button>
                    )}
                    {["APPROVED", "SCHEDULED", "PUBLISHED"].includes(
                      item.state,
                    ) && (
                      <button
                        className="primary-link"
                        onClick={() => setPublishTarget(item)}
                      >
                        <Rocket /> Publish
                      </button>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {tab === "schedule" && (
        <section role="tabpanel">
          <CalendarView
            state={{ ...state, content }}
            runAction={runAction}
            embedded
          />
        </section>
      )}

      {tab === "results" && (
        <section className="campaign-results-simple" role="tabpanel">
          <div className="today-metrics">
            <div>
              <span>Impressions</span>
              <strong>{compact(totals.impressions)}</strong>
              <small>Campaign total</small>
            </div>
            <div>
              <span>Clicks</span>
              <strong>{compact(totals.clicks)}</strong>
              <small>
                {totals.impressions
                  ? `${((totals.clicks / totals.impressions) * 100).toFixed(1)}% rate`
                  : "No results yet"}
              </small>
            </div>
            <div>
              <span>Conversions</span>
              <strong>{compact(totals.conversions)}</strong>
              <small>Attributed results</small>
            </div>
          </div>
          <section className="card campaign-recommendations">
            <h2>Recommended next moves</h2>
            {state.insights.slice(0, 3).map((insight) => (
              <article key={insight.id}>
                <span>
                  <strong>{insight.title}</strong>
                  <small>{insight.evidence}</small>
                </span>
                <button
                  className="text-button"
                  onClick={() => navigate("/app/insights")}
                >
                  View insight
                </button>
              </article>
            ))}
          </section>
        </section>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit content"
        eyebrow={
          editing
            ? `${editing.channel} · Version ${editing.version}`
            : undefined
        }
        wide
      >
        <div className="modal-body">
          <label className="editor-field">
            Content
            <textarea
              rows={10}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <small>{body.length} characters · Brand checks passed</small>
          </label>
          <div className="brand-checks">
            <span>
              <CheckCircle2 /> Clear, concise language
            </span>
            <span>
              <CheckCircle2 /> No prohibited claims
            </span>
            <span>
              <CheckCircle2 /> CTA matches preference
            </span>
          </div>
        </div>
        <footer className="modal-footer">
          <button className="button ghost" onClick={() => setEditing(null)}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={async () => {
              if (!editing) return;
              await runAction(
                { type: "editContent", contentId: editing.id, body },
                "Content version saved",
              );
              setEditing(null);
            }}
          >
            <Check /> Save new version
          </button>
        </footer>
      </Modal>

      <Modal
        open={Boolean(scheduleTarget)}
        onClose={() => setScheduleTarget(null)}
        title="Schedule content"
        eyebrow={scheduleTarget?.channel}
      >
        <div className="modal-body">
          <label>
            Publishing date and time
            <input
              type="datetime-local"
              value={scheduleValue}
              onChange={(event) => setScheduleValue(event.target.value)}
            />
          </label>
          <div className="alert green">
            <ShieldCheck />
            <span>
              <strong>Approval-aware schedule</strong>
              <small>
                Rejected content is removed automatically. Approved content
                publishes at this time.
              </small>
            </span>
          </div>
        </div>
        <footer className="modal-footer">
          <button
            className="button ghost"
            onClick={() => setScheduleTarget(null)}
          >
            Cancel
          </button>
          <button
            className="button primary"
            onClick={async () => {
              if (!scheduleTarget) return;
              await runAction(
                {
                  type: "rescheduleContent",
                  contentId: scheduleTarget.id,
                  scheduledAt: new Date(scheduleValue).toISOString(),
                },
                "Publishing schedule updated",
              );
              setScheduleTarget(null);
            }}
          >
            <CalendarDays /> Save schedule
          </button>
        </footer>
      </Modal>

      <Modal
        open={Boolean(publishTarget)}
        onClose={() => setPublishTarget(null)}
        title="Confirm publication"
        eyebrow="Consequential action"
      >
        <div className="modal-body">
          <div className="confirm-block">
            <span className="success-orb">
              <Rocket />
            </span>
            <h3>Publish to {publishTarget?.channel}?</h3>
            <p>
              GrowthOS will create the provider object using an idempotent
              operation. Retrying will not create a duplicate.
            </p>
          </div>
          <div className="alert amber">
            <ShieldCheck />
            <span>
              <strong>Explicit confirmation required</strong>
              <small>This action is recorded in the workspace audit log.</small>
            </span>
          </div>
        </div>
        <footer className="modal-footer">
          <button
            className="button ghost"
            onClick={() => setPublishTarget(null)}
          >
            Not now
          </button>
          <button
            className="button primary"
            onClick={async () => {
              if (!publishTarget) return;
              await runAction(
                {
                  type: "publishContent",
                  contentId: publishTarget.id,
                  confirmed: true,
                },
                "Content published with a stable provider ID",
              );
              setPublishTarget(null);
            }}
          >
            <Rocket /> Publish content
          </button>
        </footer>
      </Modal>
    </div>
  );
}

function CalendarView({
  state,
  runAction,
  embedded = false,
}: {
  state: AppState;
  runAction: <T>(
    payload: ActionPayload,
    success: string,
  ) => Promise<ActionResult<T>>;
  embedded?: boolean;
}) {
  const [view, setView] = useState("Month");
  const [preview, setPreview] = useState<ContentItem | null>(null);
  const [schedule, setSchedule] = useState<ContentItem | null>(null);
  const [scheduleValue, setScheduleValue] = useState("");
  const scheduled = state.content.filter(
    (item) => item.scheduledAt && item.state !== "REJECTED",
  );
  const days = Array.from({ length: 35 }, (_, index) => {
    const day = index - 4;
    return {
      label: day < 1 ? 27 + day : day > 31 ? day - 31 : day,
      current: day >= 1 && day <= 31,
      date:
        day >= 1 && day <= 31 ? `2026-08-${String(day).padStart(2, "0")}` : "",
    };
  });
  return (
    <div className={embedded ? "embedded-page" : "page"}>
      {!embedded && (
        <PageHeader
          title="Calendar"
          description="Review and adjust the approval-aware schedule across every channel."
        />
      )}
      <div className="calendar-toolbar">
        <div>
          <button className="icon-button">
            <ArrowLeft />
          </button>
          <button className="button ghost">Today</button>
          <button className="icon-button">
            <ArrowRight />
          </button>
          <h2>August 2026</h2>
        </div>
        <div className="calendar-view-controls">
          <div className="segmented">
            {["Month", "List"].map((item) => (
              <button
                className={view === item ? "active" : ""}
                onClick={() => setView(item)}
                key={item}
              >
                {item}
              </button>
            ))}
          </div>
          <details className="view-options">
            <summary>
              View options <ChevronDown />
            </summary>
            <div>
              {["Week", "5 day"].map((item) => (
                <button
                  className={view === item ? "active" : ""}
                  onClick={() => setView(item)}
                  key={item}
                >
                  {item}
                </button>
              ))}
            </div>
          </details>
        </div>
      </div>
      {view === "Month" ? (
        <section className="calendar-grid card">
          <div className="weekday-row">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="month-grid">
            {days.map((day, index) => (
              <div
                className={
                  !day.current
                    ? "other-month"
                    : day.date === "2026-08-15"
                      ? "today"
                      : ""
                }
                key={`${day.label}-${index}`}
              >
                <span>{day.label}</span>
                {scheduled
                  .filter((item) => item.scheduledAt?.startsWith(day.date))
                  .map((item) => (
                    <button
                      className={`calendar-item channel-${item.channel.toLowerCase().replaceAll(" ", "-")}`}
                      key={item.id}
                      onClick={() => setPreview(item)}
                    >
                      <i>{initials(item.channel)}</i>
                      <strong>{item.title}</strong>
                      <small>
                        {date(item.scheduledAt, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </small>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="card calendar-list-view">
          <div className="data-table">
            <div className="table-row table-header">
              <span>Date</span>
              <span>Content</span>
              <span>Campaign</span>
              <span>Status</span>
              <span>Channel</span>
            </div>
            {scheduled.map((item) => (
              <button
                className="table-row"
                onClick={() => setPreview(item)}
                key={item.id}
              >
                <span>
                  {date(item.scheduledAt, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.type}</small>
                </span>
                <span>
                  {
                    state.campaigns.find(
                      (campaign) => campaign.id === item.campaignId,
                    )?.title
                  }
                </span>
                <span>
                  <Badge value={item.state} />
                </span>
                <span>{item.channel}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.title ?? "Content preview"}
        eyebrow={preview?.channel}
      >
        <div className="modal-body">
          <div className="content-canvas preview-large">
            <p>{preview?.body}</p>
          </div>
          <div className="detail-list">
            <div>
              <span>Campaign</span>
              <strong>
                {
                  state.campaigns.find(
                    (campaign) => campaign.id === preview?.campaignId,
                  )?.title
                }
              </strong>
            </div>
            <div>
              <span>Scheduled</span>
              <strong>
                {date(preview?.scheduledAt, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{preview && <Badge value={preview.state} />}</strong>
            </div>
          </div>
        </div>
        <footer className="modal-footer">
          <button className="button ghost" onClick={() => setPreview(null)}>
            Close
          </button>
          <button
            className="button primary"
            onClick={() => {
              if (!preview) return;
              setSchedule(preview);
              setScheduleValue(preview.scheduledAt?.slice(0, 16) ?? "");
              setPreview(null);
            }}
          >
            <CalendarDays /> Change schedule
          </button>
        </footer>
      </Modal>
      <Modal
        open={Boolean(schedule)}
        onClose={() => setSchedule(null)}
        title="Change schedule"
      >
        <div className="modal-body">
          <label>
            Date and time
            <input
              type="datetime-local"
              value={scheduleValue}
              onChange={(event) => setScheduleValue(event.target.value)}
            />
          </label>
        </div>
        <footer className="modal-footer">
          <button className="button ghost" onClick={() => setSchedule(null)}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={async () => {
              if (!schedule) return;
              await runAction(
                {
                  type: "rescheduleContent",
                  contentId: schedule.id,
                  scheduledAt: new Date(scheduleValue).toISOString(),
                },
                "Content rescheduled",
              );
              setSchedule(null);
            }}
          >
            Save schedule
          </button>
        </footer>
      </Modal>
    </div>
  );
}

function ApprovalsView({
  state,
  runAction,
  embedded = false,
}: {
  state: AppState;
  runAction: <T>(
    payload: ActionPayload,
    success: string,
  ) => Promise<ActionResult<T>>;
  embedded?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState<Approval | null>(null);
  const [comment, setComment] = useState("");
  const pending = state.approvals.filter((item) => item.state === "PENDING");
  const reviewContent = state.content.find(
    (item) => item.id === review?.contentId,
  );
  const reviewCampaign = state.campaigns.find(
    (item) => item.id === reviewContent?.campaignId,
  );
  const reviewVariables = reviewCampaign?.plan.variables ?? {};
  const reviewMedia = state.media.find(
    (item) => item.id === reviewVariables.productAssetId,
  );
  const decide = async (
    decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED",
  ) => {
    if (!review) return;
    await runAction(
      { type: "decideApproval", approvalId: review.id, decision, comment },
      decision === "APPROVED"
        ? "Content approved"
        : decision === "REJECTED"
          ? "Content rejected and unscheduled"
          : "Changes requested",
    );
    setReview(null);
    setComment("");
  };

  return (
    <div className={embedded ? "embedded-page" : "page"}>
      {!embedded && (
        <PageHeader
          title="Approvals"
          description="Review the work that needs a human decision before it goes live."
        />
      )}
      <div className="approval-list-heading">
        <div>
          <h2>{pending.length} awaiting review</h2>
          <p>Oldest submissions are shown first.</p>
        </div>
        <span>
          Average review time <strong>3.2 hours</strong>
        </span>
      </div>

      {selected.length > 0 && (
        <div
          className="bulk-action-bar"
          role="region"
          aria-label="Bulk actions"
        >
          <strong>{selected.length} selected</strong>
          <button className="text-button" onClick={() => setSelected([])}>
            Clear selection
          </button>
          <button
            className="button primary"
            onClick={async () => {
              await runAction(
                {
                  type: "bulkApprove",
                  approvalIds: selected,
                  confirmed: true,
                },
                `${selected.length} items approved`,
              );
              setSelected([]);
            }}
          >
            <Check /> Approve selected
          </button>
        </div>
      )}

      {pending.length ? (
        <section className="card approvals-comfortable-list">
          {pending.map((approval) => {
            const item = state.content.find(
              (content) => content.id === approval.contentId,
            );
            if (!item) return null;
            const campaign = state.campaigns.find(
              (candidate) => candidate.id === item.campaignId,
            );
            return (
              <article className="approval-comfortable-row" key={approval.id}>
                <label className="select-checkbox">
                  <span className="sr-only">Select {item.title}</span>
                  <input
                    type="checkbox"
                    checked={selected.includes(approval.id)}
                    onChange={(event) =>
                      setSelected((value) =>
                        event.target.checked
                          ? [...value, approval.id]
                          : value.filter((id) => id !== approval.id),
                      )
                    }
                  />
                  <span />
                </label>
                <span className="channel-icon">{initials(item.channel)}</span>
                <span className="approval-row-copy">
                  <strong>{item.title}</strong>
                  <small>
                    {campaign?.title} · {item.channel} · Version {item.version}
                  </small>
                  <p>{item.body}</p>
                </span>
                <span className="approval-row-meta">
                  <Badge value="PENDING" />
                  <small>Submitted {date(approval.createdAt)}</small>
                </span>
                <button
                  className="button secondary"
                  onClick={() => {
                    setReview(approval);
                    setComment("");
                  }}
                >
                  Review
                </button>
              </article>
            );
          })}
        </section>
      ) : (
        <Empty
          icon={<CheckCircle2 />}
          title="Approval queue is clear"
          text="New submissions will appear here for review."
        />
      )}

      <details className="card approval-history-disclosure">
        <summary>
          <span>
            <strong>Decision history</strong>
            <small>Review recent approval activity</small>
          </span>
          <ChevronDown />
        </summary>
        <div className="approval-history-simple">
          {state.approvals
            .filter((item) => item.state !== "PENDING")
            .map((approval) => {
              const contentItem = state.content.find(
                (item) => item.id === approval.contentId,
              );
              const reviewer = state.users.find(
                (item) => item.id === approval.reviewerId,
              );
              return (
                <div key={approval.id}>
                  <span>
                    <strong>{contentItem?.title}</strong>
                    <small>{contentItem?.channel}</small>
                  </span>
                  <Badge value={approval.state} />
                  <span>{reviewer?.name ?? "—"}</span>
                  <span>{approval.comment ?? "No comment"}</span>
                  <time>{date(approval.decidedAt)}</time>
                </div>
              );
            })}
        </div>
      </details>

      <Modal
        open={Boolean(review)}
        onClose={() => setReview(null)}
        title="Review content"
        eyebrow={reviewContent?.channel}
        wide
      >
        <div className="modal-body review-layout">
          <div className="approval-visual-preview">
            {reviewContent && (
              <AssetPreview
                asset={reviewContent}
                brandName={state.brand.name}
                media={reviewMedia}
                variables={reviewVariables}
              />
            )}
          </div>
          <aside>
            <h3>Ready-to-publish checks</h3>
            <div className="brand-checks vertical">
              <span>
                <CheckCircle2 /> Voice aligned
              </span>
              <span>
                <CheckCircle2 /> No prohibited claims
              </span>
              <span>
                <CheckCircle2 /> Consent eligible
              </span>
            </div>
            <label>
              Reviewer comment
              <textarea
                rows={5}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Add context for your decision…"
              />
            </label>
          </aside>
        </div>
        <footer className="modal-footer split-footer">
          <button
            className="button danger-ghost"
            onClick={() => void decide("REJECTED")}
          >
            <X /> Don’t publish
          </button>
          <div>
            <button
              className="button secondary"
              onClick={() => void decide("CHANGES_REQUESTED")}
            >
              Request changes
            </button>
            <button
              className="button primary"
              onClick={() => void decide("APPROVED")}
            >
              <Check /> Approve content
            </button>
          </div>
        </footer>
      </Modal>
    </div>
  );
}

function AudiencesView({
  state,
  runAction,
}: {
  state: AppState;
  runAction: <T>(
    payload: ActionPayload,
    success: string,
  ) => Promise<ActionResult<T>>;
}) {
  const [builder, setBuilder] = useState(false);
  const [name, setName] = useState("High-intent trials");
  const [description, setDescription] = useState(
    "Trial users active in the last 14 days with valid marketing consent.",
  );
  return (
    <div className="page">
      <PageHeader
        eyebrow="Activate"
        title="Audiences"
        description="Build precise, consent-aware audiences once and activate them everywhere."
        actions={
          <button className="button primary" onClick={() => setBuilder(true)}>
            <Plus /> Create audience
          </button>
        }
      />
      <div className="audience-stats">
        <MetricCard
          label="Audiences"
          value={String(state.audiences.length)}
          detail="2 active syncs"
          icon={<Users />}
        />
        <MetricCard
          label="Known people"
          value="28.4k"
          detail="Across synthetic profiles"
          icon={<Database />}
          toneName="violet"
        />
        <MetricCard
          label="Consent-filtered"
          value="449"
          detail="Protected this month"
          icon={<ShieldCheck />}
          toneName="amber"
        />
      </div>
      <div className="audience-card-grid">
        {state.audiences.map((audience) => (
          <article className="card audience-card" key={audience.id}>
            <header>
              <span className="audience-symbol">
                <Users />
              </span>
              <Badge value="HEALTHY" />
            </header>
            <h2>{audience.name}</h2>
            <p>{audience.description}</p>
            <div className="audience-big-number">
              <strong>{compact(audience.size)}</strong>
              <span>eligible people</span>
              <small>{audience.excluded} excluded by consent</small>
            </div>
            <div className="rule-summary">
              {audience.rules.map((rule, index) => (
                <span key={`${rule.field}-${index}`}>
                  {rule.field} <strong>{rule.operator}</strong> {rule.value}
                </span>
              ))}
            </div>
            <footer>
              <span>{audience.destinations.length} eligible destinations</span>
              <button>
                Open builder <ArrowRight />
              </button>
            </footer>
          </article>
        ))}
      </div>
      <Modal
        open={builder}
        onClose={() => setBuilder(false)}
        title="Create audience"
        eyebrow="Visual builder"
        wide
      >
        <div className="modal-body">
          <div className="form-grid">
            <label>
              Audience name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Parent model
              <select>
                <option>People</option>
                <option>Accounts</option>
              </select>
            </label>
            <label className="span-2">
              Description
              <textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </div>
          <div className="rule-group standalone">
            <span className="logic-chip">AND</span>
            <div className="rule-row">
              <select>
                <option>Lifecycle stage</option>
              </select>
              <select>
                <option>is</option>
              </select>
              <input defaultValue="Trial" />
            </div>
            <div className="rule-row">
              <select>
                <option>Last active date</option>
              </select>
              <select>
                <option>within</option>
              </select>
              <input defaultValue="14 days" />
            </div>
            <div className="rule-row">
              <select>
                <option>Email consent</option>
              </select>
              <select>
                <option>is</option>
              </select>
              <input defaultValue="true" />
            </div>
            <button className="add-rule">
              <Plus /> Add rule
            </button>
          </div>
          <div className="estimate-inline">
            <Sparkles />
            <span>
              <strong>Estimated audience: 2,184 people</strong>
              <small>
                146 records will be excluded by destination consent rules.
              </small>
            </span>
          </div>
        </div>
        <footer className="modal-footer">
          <button className="button ghost" onClick={() => setBuilder(false)}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={async () => {
              await runAction(
                {
                  type: "createAudience",
                  name,
                  description,
                  rules: [
                    {
                      field: "Lifecycle stage",
                      operator: "is",
                      value: "Trial",
                    },
                    {
                      field: "Last active date",
                      operator: "within",
                      value: "14 days",
                    },
                    { field: "Email consent", operator: "is", value: "true" },
                  ],
                },
                "Audience created with consent rules",
              );
              setBuilder(false);
            }}
          >
            <Check /> Create audience
          </button>
        </footer>
      </Modal>
    </div>
  );
}

function SyncsView({
  state,
  runAction,
}: {
  state: AppState;
  runAction: <T>(
    payload: ActionPayload,
    success: string,
  ) => Promise<ActionResult<T>>;
}) {
  const [builder, setBuilder] = useState(false);
  const [step, setStep] = useState(1);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Activate"
        title="Syncs"
        description="Move audiences and customer signals to destinations with full consent visibility."
        actions={
          <button className="button primary" onClick={() => setBuilder(true)}>
            <Plus /> Create sync
          </button>
        }
      />
      <section className="sync-flow-banner">
        <span>
          <Database />
        </span>
        <strong>Source or audience</strong>
        <ArrowRight />
        <span>
          <Link2 />
        </span>
        <strong>Destination</strong>
        <ArrowRight />
        <span>
          <RefreshCw />
        </span>
        <strong>Operation and schedule</strong>
      </section>
      <section className="card table-card">
        <div className="table-tools">
          <div className="search-box">
            <Search />
            <input placeholder="Search syncs" />
          </div>
          <button className="button secondary">
            <ListFilter /> Status
          </button>
        </div>
        <div className="data-table sync-table">
          <div className="table-row table-header">
            <span>Sync</span>
            <span>Flow</span>
            <span>Status</span>
            <span>Schedule</span>
            <span>Latest run</span>
            <span />
          </div>
          {state.syncs.map((sync) => {
            const run = state.syncRuns.find((item) => item.syncId === sync.id);
            return (
              <div className="table-row" key={sync.id}>
                <span>
                  <strong>{sync.name}</strong>
                  <small>{sync.operation}</small>
                </span>
                <span className="flow-cell">
                  <em>{sync.source}</em>
                  <ArrowRight />
                  <em>{sync.destination}</em>
                </span>
                <span>
                  <Badge value={sync.state} />
                  {run?.error && (
                    <small className="table-warning">{run.error}</small>
                  )}
                </span>
                <span>{sync.schedule}</span>
                <span>
                  <strong>
                    {run ? `${compact(run.accepted)} accepted` : "No runs"}
                  </strong>
                  <small>
                    {run && `${run.rejected} filtered · ${run.duration}`}
                  </small>
                </span>
                <span>
                  {run?.state === "FAILED" ? (
                    <button
                      className="button small-button"
                      onClick={() =>
                        void runAction(
                          { type: "retrySync", syncId: sync.id },
                          "Sync retry completed successfully",
                        )
                      }
                    >
                      <RefreshCw /> Retry
                    </button>
                  ) : (
                    <button className="icon-button">
                      <MoreHorizontal />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <div className="two-column">
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Latest runs</span>
              <h2>Delivery health</h2>
            </div>
            <span className="count-pill">{state.syncRuns.length}</span>
          </div>
          <div className="run-list">
            {state.syncRuns.map((run) => (
              <div key={run.id}>
                <span
                  className={`run-icon ${run.state === "FAILED" ? "red" : "green"}`}
                >
                  {run.state === "FAILED" ? <X /> : <Check />}
                </span>
                <span>
                  <strong>
                    {state.syncs.find((sync) => sync.id === run.syncId)?.name}
                  </strong>
                  <small>
                    {compact(run.queried)} queried · {compact(run.accepted)}{" "}
                    accepted · {run.duration}
                  </small>
                </span>
                <Badge value={run.state} />
              </div>
            ))}
          </div>
        </section>
        <section className="card consent-card">
          <span className="eyebrow">Consent protection</span>
          <h2>449 records protected</h2>
          <p>
            GrowthOS applied destination-level consent and suppression rules
            before activation.
          </p>
          <div className="donut-row">
            <div className="donut">
              <span>96%</span>
            </div>
            <div>
              <span>
                <i className="dot teal" /> Eligible records
              </span>
              <span>
                <i className="dot amber" /> Consent filtered
              </span>
              <span>
                <i className="dot gray" /> Suppressed
              </span>
            </div>
          </div>
        </section>
      </div>
      <Modal
        open={builder}
        onClose={() => setBuilder(false)}
        title="Create sync"
        eyebrow={`Step ${step} of 6`}
        wide
      >
        <div className="wizard-progress six">
          {[
            "Source",
            "Destination",
            "Operation",
            "Map fields",
            "Schedule",
            "Review",
          ].map((item, index) => (
            <span className={step >= index + 1 ? "active" : ""} key={item}>
              <i>{step > index + 1 ? <Check /> : index + 1}</i>
              {item}
            </span>
          ))}
        </div>
        <div className="modal-body sync-builder-body">
          {step === 1 && (
            <div className="select-grid">
              {state.audiences.map((audience) => (
                <button onClick={() => setStep(2)} key={audience.id}>
                  <span className="audience-symbol">
                    <Users />
                  </span>
                  <span>
                    <strong>{audience.name}</strong>
                    <small>{compact(audience.size)} eligible people</small>
                  </span>
                  <ChevronRight />
                </button>
              ))}
            </div>
          )}
          {step === 2 && (
            <div className="select-grid">
              {state.connections.map((connection) => {
                const definition = state.definitions.find(
                  (item) => item.id === connection.definitionId,
                );
                return (
                  <button onClick={() => setStep(3)} key={connection.id}>
                    <IntegrationMark definition={definition} />
                    <span>
                      <strong>{definition?.name}</strong>
                      <small>{connection.accountName}</small>
                    </span>
                    <Badge value={connection.state} />
                  </button>
                );
              })}
            </div>
          )}
          {step === 3 && (
            <div className="select-grid">
              <button onClick={() => setStep(4)}>
                <Zap />
                <span>
                  <strong>Upload audience</strong>
                  <small>Create or update destination membership</small>
                </span>
                <ChevronRight />
              </button>
              <button onClick={() => setStep(4)}>
                <Users />
                <span>
                  <strong>Update contacts</strong>
                  <small>Map profile fields to destination records</small>
                </span>
                <ChevronRight />
              </button>
              <button onClick={() => setStep(4)}>
                <MousePointerClick />
                <span>
                  <strong>Send conversion events</strong>
                  <small>Activate attributed conversion signals</small>
                </span>
                <ChevronRight />
              </button>
            </div>
          )}
          {step === 4 && (
            <div className="mapping-table">
              <div>
                <strong>GrowthOS field</strong>
                <strong>Destination field</strong>
              </div>
              {[
                ["email", "email_address"],
                ["first_name", "firstName"],
                ["lifecycle_stage", "stage"],
                ["lead_score", "score"],
              ].map(([left, right]) => (
                <div key={left}>
                  <select defaultValue={left}>
                    <option>{left}</option>
                  </select>
                  <ArrowRight />
                  <select defaultValue={right}>
                    <option>{right}</option>
                  </select>
                  <CheckCircle2 />
                </div>
              ))}
            </div>
          )}
          {step === 5 && (
            <div className="form-grid">
              <label>
                Schedule
                <select>
                  <option>Every 6 hours</option>
                  <option>Daily</option>
                  <option>Manual</option>
                </select>
              </label>
              <label>
                Time zone
                <select>
                  <option>America/Toronto</option>
                </select>
              </label>
              <label className="span-2 checkbox-row">
                <input type="checkbox" defaultChecked /> Alert admins after
                recoverable failures
              </label>
            </div>
          )}
          {step === 6 && (
            <div className="review-generation">
              <div className="success-orb">
                <ShieldCheck />
              </div>
              <h3>3,842 records eligible to sync</h3>
              <p>
                338 records will be removed by advertising consent and
                suppression policies before any destination write.
              </p>
              <div className="estimate-bar">
                <span style={{ width: "92%" }} />
                <i style={{ width: "8%" }} />
              </div>
            </div>
          )}
        </div>
        <footer className="modal-footer">
          <button
            className="button ghost"
            onClick={() => (step > 1 ? setStep(step - 1) : setBuilder(false))}
          >
            {step > 1 && <ArrowLeft />}
            {step > 1 ? "Back" : "Cancel"}
          </button>
          <button
            className="button primary"
            onClick={() => (step < 6 ? setStep(step + 1) : setBuilder(false))}
          >
            {step === 6 ? <Check /> : null}
            {step === 6 ? "Create sync" : "Continue"}
            <ArrowRight />
          </button>
        </footer>
      </Modal>
    </div>
  );
}

function PaidAdsView({
  state,
  runAction,
}: {
  state: AppState;
  runAction: <T>(
    payload: ActionPayload,
    success: string,
  ) => Promise<ActionResult<T>>;
}) {
  const [wizard, setWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("Activation Signals — Growth");
  const [platform, setPlatform] = useState<"Meta Ads" | "Google Ads">(
    "Meta Ads",
  );
  const [budget, setBudget] = useState(3000);
  const [headline, setHeadline] = useState(
    "Turn signals into your next growth move",
  );
  const [body, setBody] = useState(
    "Connect product and revenue data to the actions that grow your SaaS business.",
  );
  const [activate, setActivate] = useState<string | null>(null);
  const totalSpend = state.paidAds.reduce((sum, item) => sum + item.spend, 0);
  const totalResults = state.paidAds.reduce(
    (sum, item) => sum + item.results,
    0,
  );
  const create = async () => {
    await runAction(
      {
        type: "createPaidAd",
        name,
        platform,
        objective: "Leads",
        budget,
        headline,
        body,
      },
      "Paid campaign created in paused state",
    );
    setWizard(false);
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="Measure"
        title="Paid Ads"
        description="Create, approve, and improve paid media without losing control of budget or brand."
        actions={
          <button className="button primary" onClick={() => setWizard(true)}>
            <Plus /> Create paid campaign
          </button>
        }
      />
      <div className="campaign-metrics">
        <MetricCard
          label="Active campaigns"
          value={String(
            state.paidAds.filter((item) => item.state === "ACTIVE").length,
          )}
          detail="1 needs attention"
          icon={<Target />}
        />
        <MetricCard
          label="Spend"
          value={money(totalSpend, state.workspace.currency)}
          detail="57% of planned budget"
          icon={<CircleDollarSign />}
          toneName="violet"
        />
        <MetricCard
          label="Results"
          value={String(totalResults)}
          detail="Demo bookings"
          icon={<MousePointerClick />}
        />
        <MetricCard
          label="Cost per result"
          value={money(
            totalSpend / Math.max(totalResults, 1),
            state.workspace.currency,
          )}
          detail="↓ 6.3% vs prior"
          icon={<Gauge />}
          toneName="amber"
        />
      </div>
      <section className="card table-card">
        <div className="table-tools">
          <div className="search-box">
            <Search />
            <input placeholder="Search paid campaigns" />
          </div>
          <button className="button secondary">
            <ListFilter /> All platforms
          </button>
        </div>
        <div className="data-table ads-table">
          <div className="table-row table-header">
            <span>Campaign</span>
            <span>Platform</span>
            <span>Status</span>
            <span>Budget</span>
            <span>Spend</span>
            <span>Results</span>
            <span>Cost / result</span>
            <span />
          </div>
          {state.paidAds.map((ad) => (
            <div className="table-row" key={ad.id}>
              <span>
                <strong>{ad.name}</strong>
                <small>
                  {ad.objective} · {ad.dateRange}
                </small>
              </span>
              <span>{ad.platform}</span>
              <span>
                <Badge value={ad.state} />
              </span>
              <span>{money(ad.budget, state.workspace.currency)}</span>
              <span>{money(ad.spend, state.workspace.currency)}</span>
              <span>{ad.results}</span>
              <span>
                {ad.results
                  ? money(ad.spend / ad.results, state.workspace.currency)
                  : "—"}
              </span>
              <span>
                {ad.state === "PAUSED" ? (
                  <button
                    className="button small-button"
                    onClick={() => setActivate(ad.id)}
                  >
                    <Play /> Activate
                  </button>
                ) : (
                  <button className="icon-button">
                    <MoreHorizontal />
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>
      <div className="two-column">
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Performance</span>
              <h2>Results over time</h2>
            </div>
            <Badge value="ACTIVE" />
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={state.metrics.slice(-14)}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e6ebe9"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => date(value, { day: "numeric" })}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="leads"
                  stroke="#7357d8"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card recommendation-card">
          <span className="ai-orb">
            <Sparkles />
          </span>
          <Badge value="DEGRADED">Creative fatigue</Badge>
          <h2>Refresh the activation retargeting creative</h2>
          <p>
            Frequency reached 4.8 while click-through rate declined 19% over
            seven days.
          </p>
          <div>
            <span>
              Confidence <strong>88%</strong>
            </span>
            <span>
              Expected <strong>+10–15% CTR</strong>
            </span>
          </div>
          <button className="button secondary full">
            <Sparkles /> Generate three new angles
          </button>
        </section>
      </div>
      <Modal
        open={wizard}
        onClose={() => setWizard(false)}
        title="Create paid campaign"
        eyebrow={`Step ${step} of 7`}
        wide
      >
        <div className="wizard-progress seven">
          {[
            "Platform",
            "Objective",
            "Audience",
            "Budget",
            "Creative",
            "Review",
            "Create",
          ].map((item, index) => (
            <span className={step >= index + 1 ? "active" : ""} key={item}>
              <i>{step > index + 1 ? <Check /> : index + 1}</i>
              {item}
            </span>
          ))}
        </div>
        <div className="modal-body paid-wizard">
          {step === 1 && (
            <div className="platform-select">
              {(["Meta Ads", "Google Ads"] as const).map((item) => (
                <button
                  className={platform === item ? "active" : ""}
                  onClick={() => {
                    setPlatform(item);
                    setStep(2);
                  }}
                  key={item}
                >
                  <span className="integration-mark mark-large">{item[0]}</span>
                  <strong>{item}</strong>
                  <small>
                    {state.connections.some(
                      (connection) =>
                        state.definitions.find(
                          (definition) =>
                            definition.id === connection.definitionId,
                        )?.name === item,
                    )
                      ? "Connected · Northstar Growth"
                      : "Connection required"}
                  </small>
                </button>
              ))}
            </div>
          )}
          {step === 2 && (
            <div className="form-grid">
              <label>
                Campaign name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                Objective
                <select>
                  <option>Leads</option>
                  <option>Awareness</option>
                  <option>Traffic</option>
                  <option>Sales</option>
                  <option>Retargeting</option>
                </select>
              </label>
              <label className="span-2">
                Topic
                <textarea
                  rows={4}
                  defaultValue="Help growth leaders turn fragmented customer signals into focused actions."
                />
              </label>
            </div>
          )}
          {step === 3 && (
            <div className="form-grid">
              <label>
                Countries
                <input defaultValue="Canada, United States" />
              </label>
              <label>
                Age range
                <input defaultValue="25–54" />
              </label>
              <label>
                Custom audience
                <select>
                  <option>Engaged trials</option>
                  <option>Expansion-ready accounts</option>
                </select>
              </label>
              <label>
                Suppression audience
                <select>
                  <option>Existing customers</option>
                </select>
              </label>
            </div>
          )}
          {step === 4 && (
            <div className="budget-panel">
              <label>
                Total budget
                <div className="currency-input">
                  <span>$</span>
                  <input
                    type="number"
                    value={budget}
                    onChange={(event) => setBudget(Number(event.target.value))}
                  />
                  <em>CAD</em>
                </div>
              </label>
              <div>
                <span>Calculated daily budget</span>
                <strong>{money(budget / 21, "CAD")}</strong>
              </div>
              <label>
                Stop-loss threshold
                <input defaultValue="$38 cost per result" />
              </label>
              <label className="checkbox-row">
                <input type="checkbox" defaultChecked /> Require final launch
                approval
              </label>
            </div>
          )}
          {step === 5 && (
            <div className="creative-options">
              {[0, 1, 2].map((index) => (
                <article className={index === 0 ? "selected" : ""} key={index}>
                  <div className={`ad-visual art-${index}`}>
                    <BarChart3 />
                  </div>
                  <label>
                    Headline
                    <input
                      value={
                        index === 0
                          ? headline
                          : index === 1
                            ? "Make every growth signal useful"
                            : "Your next move is already in the data"
                      }
                      onChange={
                        index === 0
                          ? (event) => setHeadline(event.target.value)
                          : undefined
                      }
                    />
                  </label>
                  <label>
                    Primary text
                    <textarea
                      rows={4}
                      value={
                        index === 0
                          ? body
                          : index === 1
                            ? "Give every team a clearer path from customer signal to growth action."
                            : "See where customers are getting stuck—and what the team should do next."
                      }
                      onChange={
                        index === 0
                          ? (event) => setBody(event.target.value)
                          : undefined
                      }
                    />
                  </label>
                  <span>
                    {index === 0 ? <Check /> : null}
                    {index === 0 ? "Selected" : "Select variant"}
                  </span>
                </article>
              ))}
            </div>
          )}
          {step === 6 && (
            <div className="finalize-panel">
              <h3>{name}</h3>
              <dl>
                <div>
                  <dt>Platform</dt>
                  <dd>{platform}</dd>
                </div>
                <div>
                  <dt>Objective</dt>
                  <dd>Leads</dd>
                </div>
                <div>
                  <dt>Audience</dt>
                  <dd>Engaged trials</dd>
                </div>
                <div>
                  <dt>Total budget</dt>
                  <dd>{money(budget, "CAD")}</dd>
                </div>
                <div>
                  <dt>Launch state</dt>
                  <dd>
                    <Badge value="PAUSED" />
                  </dd>
                </div>
              </dl>
              <div className="alert amber">
                <ShieldCheck />
                <span>
                  <strong>Created paused by design</strong>
                  <small>
                    A separate Owner or Admin confirmation is required to
                    activate spend.
                  </small>
                </span>
              </div>
            </div>
          )}
          {step === 7 && (
            <div className="review-generation">
              <div className="success-orb violet">
                <Rocket />
              </div>
              <h3>Ready to create in {platform}</h3>
              <p>
                GrowthOS will create a paused provider campaign, save its stable
                external ID, and write the operation to the audit log.
              </p>
            </div>
          )}
        </div>
        <footer className="modal-footer">
          <button
            className="button ghost"
            onClick={() => (step > 1 ? setStep(step - 1) : setWizard(false))}
          >
            {step > 1 && <ArrowLeft />}
            {step > 1 ? "Back" : "Cancel"}
          </button>
          <button
            className="button primary"
            onClick={() => (step < 7 ? setStep(step + 1) : void create())}
          >
            {step === 7 ? <Rocket /> : null}
            {step === 7 ? "Create paused campaign" : "Continue"}
            <ArrowRight />
          </button>
        </footer>
      </Modal>
      <Modal
        open={Boolean(activate)}
        onClose={() => setActivate(null)}
        title="Activate paid campaign"
        eyebrow="Budget-impacting action"
      >
        <div className="modal-body">
          <div className="confirm-block">
            <span className="success-orb violet">
              <Play />
            </span>
            <h3>Begin spending on this campaign?</h3>
            <p>
              The campaign will become active on the connected provider and use
              its configured daily budget.
            </p>
          </div>
          <div className="alert amber">
            <AlertTriangle />
            <span>
              <strong>Explicit Owner/Admin confirmation required</strong>
              <small>This action is permanent in the audit log.</small>
            </span>
          </div>
        </div>
        <footer className="modal-footer">
          <button className="button ghost" onClick={() => setActivate(null)}>
            Keep paused
          </button>
          <button
            className="button primary"
            onClick={async () => {
              if (!activate) return;
              await runAction(
                { type: "activatePaidAd", adId: activate, confirmed: true },
                "Paid campaign activated",
              );
              setActivate(null);
            }}
          >
            <Play /> Activate campaign
          </button>
        </footer>
      </Modal>
    </div>
  );
}

function InsightsView({
  state,
  navigate,
  runAction,
  embedded = false,
}: {
  state: AppState;
  navigate: (path: string) => void;
  runAction: <T>(
    payload: ActionPayload,
    success: string,
  ) => Promise<ActionResult<T>>;
  embedded?: boolean;
}) {
  const [range, setRange] = useState(30);
  const metrics = state.metrics.slice(-range);
  const totals = metrics.reduce(
    (sum, item) => ({
      impressions: sum.impressions + item.impressions,
      leads: sum.leads + item.leads,
      spend: sum.spend + item.spend,
      revenue: sum.revenue + item.revenue,
    }),
    { impressions: 0, leads: 0, spend: 0, revenue: 0 },
  );
  const [creating, setCreating] = useState<string | null>(null);
  const followup = async (insightId: string) => {
    setCreating(insightId);
    const result = await runAction<{ campaignId: string }>(
      { type: "createFollowup", insightId },
      "Follow-up campaign generated from recommendation",
    );
    setCreating(null);
    if (result.ok)
      navigate(`/app/campaigns/${result.data.campaignId}/overview`);
  };

  return (
    <div className={embedded ? "embedded-page" : "page"}>
      {!embedded && (
        <PageHeader
          title="Insights"
          description="A focused view of performance and the next decisions worth making."
        />
      )}
      <div className="insights-toolbar">
        <div className="segmented" aria-label="Insights date range">
          {[7, 30, 90].map((item) => (
            <button
              className={range === item ? "active" : ""}
              onClick={() => setRange(Math.min(item, state.metrics.length))}
              key={item}
            >
              {item} days
            </button>
          ))}
        </div>
      </div>
      <section className="today-metrics insights-three-metrics">
        <div>
          <span>Qualified leads</span>
          <strong>{compact(totals.leads)}</strong>
          <small>Across all active channels</small>
        </div>
        <div>
          <span>Revenue</span>
          <strong>{money(totals.revenue, state.workspace.currency)}</strong>
          <small>
            {totals.spend
              ? `${(totals.revenue / totals.spend).toFixed(1)}× return on spend`
              : "No paid spend"}
          </small>
        </div>
        <div>
          <span>Cost per lead</span>
          <strong>
            {money(
              totals.spend / Math.max(totals.leads, 1),
              state.workspace.currency,
            )}
          </strong>
          <small>{compact(totals.impressions)} impressions</small>
        </div>
      </section>

      <section className="card insight-trend-card">
        <div className="section-heading">
          <div>
            <h2>Lead trend</h2>
            <p>Daily qualified leads across every channel.</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={metrics}>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#e6ebe9"
            />
            <XAxis
              dataKey="date"
              tickFormatter={(value) =>
                date(value, { month: "short", day: "numeric" })
              }
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#7b8784", fontSize: 11 }}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                border: "1px solid #dfe6e3",
                borderRadius: 10,
              }}
              labelFormatter={(value) =>
                date(String(value), { month: "short", day: "numeric" })
              }
            />
            <Line
              type="monotone"
              dataKey="leads"
              stroke="#0f766e"
              strokeWidth={3}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="recommendations-simple">
        <div className="section-heading">
          <div>
            <h2>Recommended next moves</h2>
            <p>
              Evidence-backed actions, limited to the decisions that matter.
            </p>
          </div>
        </div>
        <div className="recommendation-three-grid">
          {state.insights.slice(0, 3).map((insight) => (
            <article className="card" key={insight.id}>
              <span className="confidence-copy">
                {Math.round(insight.confidence * 100)}% confidence
              </span>
              <h3>{insight.title}</h3>
              <p>{insight.evidence}</p>
              <small>{insight.expectedEffect}</small>
              <button
                className="button secondary full"
                onClick={() => void followup(insight.id)}
                disabled={creating === insight.id}
              >
                {creating === insight.id ? (
                  <Loader2 className="spin" />
                ) : (
                  <Plus />
                )}
                Create follow-up
              </button>
            </article>
          ))}
        </div>
      </section>

      <details className="card insight-details-disclosure">
        <summary>
          <span>
            <strong>View platform details</strong>
            <small>Channel performance and inferred preferences</small>
          </span>
          <ChevronDown />
        </summary>
        <div className="platform-detail-grid">
          {channelKeys.map((key) => {
            const channelContent = state.content.filter(
              (item) => classifyChannel(item.channel) === key,
            );
            const impressions = channelContent.reduce(
              (sum, item) => sum + item.metrics.impressions,
              0,
            );
            return (
              <div key={key}>
                <strong>{channelWorkspaces[key].label}</strong>
                <span>{channelContent.length} items</span>
                <small>{compact(impressions)} impressions</small>
              </div>
            );
          })}
        </div>
        <div className="learning-note">
          <ShieldCheck />
          <span>
            <strong>Brand Kit settings stay authoritative</strong>
            <small>
              Inferred preferences inform recommendations but never overwrite
              explicit brand choices.
            </small>
          </span>
        </div>
      </details>
    </div>
  );
}

function TeamView({ state }: { state: AppState }) {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Workspace"
        title="Team"
        description="Seeded identities make role-based review and publishing behavior easy to demonstrate."
        actions={
          <button className="button primary">
            <Plus /> Invite member
          </button>
        }
      />
      <section className="card table-card">
        <div className="data-table team-table">
          <div className="table-row table-header">
            <span>Member</span>
            <span>Role</span>
            <span>Access</span>
            <span>Last active</span>
            <span />
          </div>
          {state.users.map((user, index) => (
            <div className="table-row" key={user.id}>
              <span className="name-cell">
                <span className="avatar">{user.initials}</span>
                <span>
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </span>
              </span>
              <span>
                <Badge>{roleLabels[user.role]}</Badge>
              </span>
              <span>
                {user.role === "OWNER" || user.role === "ADMIN"
                  ? "Full workspace"
                  : user.role === "MARKETER"
                    ? "Create and publish approved"
                    : user.role === "REVIEWER"
                      ? "Review and approve"
                      : "Read only"}
              </span>
              <span>{index < 3 ? "Today" : "Aug 14"}</span>
              <span>
                <button className="icon-button">
                  <MoreHorizontal />
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="card role-matrix">
        <div className="card-head">
          <div>
            <span className="eyebrow">Role controls</span>
            <h2>Server-enforced access</h2>
          </div>
        </div>
        <div>
          <span />
          <strong>Manage workspace</strong>
          <strong>Create campaigns</strong>
          <strong>Approve content</strong>
          <strong>Publish approved</strong>
          <strong>Activate spend</strong>
          {[
            ["Owner", 1, 1, 1, 1, 1],
            ["Admin", 1, 1, 1, 1, 1],
            ["Marketer", 0, 1, 0, 1, 0],
            ["Reviewer", 0, 0, 1, 0, 0],
            ["Viewer", 0, 0, 0, 0, 0],
          ].flatMap((row) =>
            row.map((cell, index) =>
              index === 0 ? (
                <span key={`${row[0]}-${index}`}>{cell}</span>
              ) : (
                <i key={`${row[0]}-${index}`}>{cell ? <Check /> : "—"}</i>
              ),
            ),
          )}
        </div>
      </section>
    </div>
  );
}

function AuditView({ state }: { state: AppState }) {
  const [search, setSearch] = useState("");
  const events = state.audits.filter((event) =>
    `${event.action} ${event.detail} ${event.entityType}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="page">
      <PageHeader
        eyebrow="Workspace"
        title="Audit Log"
        description="An immutable account of consequential AI, user, sync, and provider operations."
        actions={
          <button className="button secondary">
            <FileText /> Export CSV
          </button>
        }
      />
      <section className="card table-card">
        <div className="table-tools">
          <div className="search-box">
            <Search />
            <input
              placeholder="Search activity"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div>
            <button className="button secondary">
              <ListFilter /> All actions
            </button>
            <button className="button secondary">
              All actors <ChevronDown />
            </button>
          </div>
        </div>
        <div className="data-table audit-table">
          <div className="table-row table-header">
            <span>Event</span>
            <span>Actor</span>
            <span>Entity</span>
            <span>Details</span>
            <span>Time</span>
          </div>
          {events.map((event) => {
            const user = state.users.find((item) => item.id === event.actorId);
            return (
              <div className="table-row" key={event.id}>
                <span>
                  <span
                    className={`audit-icon action-${event.action.toLowerCase().split("_")[0]}`}
                  >
                    {event.action.includes("FAILED") ? (
                      <AlertTriangle />
                    ) : event.action.includes("APPROVED") ? (
                      <Check />
                    ) : (
                      <Activity />
                    )}
                  </span>
                  <strong>{human(event.action)}</strong>
                </span>
                <span className="name-cell">
                  <span className="avatar tiny">{user?.initials}</span>
                  <span>
                    <strong>{user?.name}</strong>
                    <small>{user ? roleLabels[user.role] : "System"}</small>
                  </span>
                </span>
                <span>
                  <strong>{event.entityType}</strong>
                  <small>{event.entityId}</small>
                </span>
                <span>{event.detail}</span>
                <span>
                  {date(event.createdAt, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SettingsView({
  state,
  runAction,
}: {
  state: AppState;
  runAction: <T>(
    payload: ActionPayload,
    success: string,
  ) => Promise<ActionResult<T>>;
}) {
  const [approvalMode, setApprovalMode] = useState(
    state.workspace.approvalMode,
  );
  const [timezone, setTimezone] = useState(state.workspace.timezone);
  const [currency, setCurrency] = useState(state.workspace.currency);
  return (
    <div className="page settings-page">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Configure governance, defaults, and how GrowthOS operates for Northstar."
        actions={
          <button
            className="button primary"
            onClick={() =>
              void runAction(
                { type: "updateSettings", approvalMode, timezone, currency },
                "Workspace settings saved",
              )
            }
          >
            <Check /> Save settings
          </button>
        }
      />
      <div className="settings-layout">
        <aside>
          <button className="active">General</button>
          <button>Approvals</button>
          <button>Notifications</button>
          <button>AI & data</button>
          <button>Security</button>
        </aside>
        <section>
          <article className="card settings-section">
            <div>
              <h2>Workspace defaults</h2>
              <p>Applied to new campaigns, calendars, and reporting.</p>
            </div>
            <div className="form-grid">
              <label>
                Workspace name
                <input defaultValue={state.workspace.name} />
              </label>
              <label>
                Workspace slug
                <input defaultValue={state.workspace.slug} />
              </label>
              <label>
                Time zone
                <select
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                >
                  <option>America/Toronto</option>
                  <option>America/New_York</option>
                  <option>Europe/London</option>
                </select>
              </label>
              <label>
                Currency
                <select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                >
                  <option>CAD</option>
                  <option>USD</option>
                  <option>GBP</option>
                </select>
              </label>
            </div>
          </article>
          <article className="card settings-section">
            <div>
              <h2>Approval governance</h2>
              <p>Control what can become scheduled or live.</p>
            </div>
            <label
              className="setting-toggle"
              aria-label="Require explicit content approval"
            >
              <span>
                <strong>Require explicit content approval</strong>
                <small>
                  Nothing can publish without a Reviewer, Admin, or Owner
                  decision.
                </small>
              </span>
              <input
                type="checkbox"
                checked={approvalMode}
                onChange={(event) => setApprovalMode(event.target.checked)}
              />
              <i />
            </label>
            <label
              className="setting-toggle"
              aria-label="Require final paid campaign activation"
            >
              <span>
                <strong>Final paid campaign activation</strong>
                <small>
                  Owner or Admin confirmation is always required before spend
                  begins.
                </small>
              </span>
              <input type="checkbox" defaultChecked disabled />
              <i />
            </label>
            <label
              className="setting-toggle"
              aria-label="Audit every AI action"
            >
              <span>
                <strong>Audit every AI action</strong>
                <small>
                  Store tool proposals, confirmation outcomes, and resulting
                  mutations.
                </small>
              </span>
              <input type="checkbox" defaultChecked />
              <i />
            </label>
          </article>
          <article className="card settings-section">
            <div>
              <h2>AI provider</h2>
              <p>
                GrowthOS is fully usable with deterministic local generation.
              </p>
            </div>
            <div className="provider-setting">
              <span className="ai-orb">
                <Sparkles />
              </span>
              <span>
                <strong>Mock AI Provider</strong>
                <small>
                  Active · deterministic structured output · no API key required
                </small>
              </span>
              <Badge value="CONNECTED" />
            </div>
            <div className="alert green">
              <ShieldCheck />
              <span>
                <strong>Server-only provider boundary</strong>
                <small>
                  Optional real-provider credentials are never exposed to the
                  browser.
                </small>
              </span>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}

function Assistant({
  open,
  onClose,
  state,
  navigate,
}: {
  open: boolean;
  onClose: () => void;
  state: AppState;
  navigate: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<
    Array<{ role: "assistant" | "user"; text: string }>
  >([
    {
      role: "assistant",
      text: "I’m grounded in Northstar’s Brand Kit, campaigns, connected tools, approvals, syncs, and performance. What should we work on?",
    },
  ]);
  const respond = (value: string) => {
    if (!value.trim()) return;
    let reply =
      "I found the relevant workspace context and prepared a safe next step for your review.";
    const lower = value.toLowerCase();
    if (lower.includes("approval"))
      reply = `${state.approvals.filter((item) => item.state === "PENDING").length} content items are awaiting approval across ${new Set(state.approvals.filter((item) => item.state === "PENDING").map((item) => state.content.find((content) => content.id === item.contentId)?.campaignId)).size} campaigns.`;
    else if (lower.includes("sync") || lower.includes("fail"))
      reply =
        "The Trial profiles → Klaviyo sync hit a recoverable rate limit. 4,012 records are ready to retry; 170 will be filtered by consent rules.";
    else if (lower.includes("performance") || lower.includes("working"))
      reply =
        "The signal-to-action narrative is working best: 2.1× median click-through rate and 31 demo conversions. I recommend turning it into a three-part series.";
    else if (lower.includes("connection"))
      reply = `${state.connections.filter((item) => item.state === "CONNECTED").length} connections are healthy. Klaviyo is degraded and Google Ads is currently disconnected.`;
    setMessages((items) => [
      ...items,
      { role: "user", text: value },
      { role: "assistant", text: reply },
    ]);
    setQuery("");
  };
  if (!open) return null;
  return (
    <aside
      className="assistant-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="GrowthOS AI assistant"
    >
      <header>
        <span className="ai-orb">
          <Sparkles />
        </span>
        <span>
          <strong>GrowthOS Assistant</strong>
          <small>
            <i /> Grounded in workspace context
          </small>
        </span>
        <button className="icon-button" onClick={onClose}>
          <X />
        </button>
      </header>
      <div className="assistant-context">
        <span>
          <Palette /> Brand Kit
        </span>
        <span>
          <Link2 /> {state.connections.length} connections
        </span>
        <span>
          <Megaphone /> {state.campaigns.length} campaigns
        </span>
      </div>
      <div className="message-list">
        {messages.map((message, index) => (
          <div
            className={`message ${message.role}`}
            key={`${message.role}-${index}`}
          >
            {message.role === "assistant" && (
              <span className="ai-orb tiny">
                <Sparkles />
              </span>
            )}
            <p>{message.text}</p>
          </div>
        ))}
      </div>
      <div className="assistant-actions">
        {[
          "What’s working?",
          "Find pending approvals",
          "Explain the failed sync",
        ].map((item) => (
          <button onClick={() => respond(item)} key={item}>
            {item}
          </button>
        ))}
        <button
          onClick={() => {
            onClose();
            navigate("/app/campaigns/new");
          }}
        >
          <Plus /> Create a campaign
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          respond(query);
        }}
      >
        <textarea
          rows={2}
          placeholder="Ask about performance, approvals, syncs…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button disabled={!query.trim()}>
          <Send />
        </button>
        <small>Consequential actions always require your confirmation.</small>
      </form>
    </aside>
  );
}

function CommandPalette({
  open,
  onClose,
  navigate,
}: {
  open: boolean;
  onClose: () => void;
  navigate: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  if (!open) return null;
  const allItems: Array<readonly [string, string, string]> = [
    ...primaryNavigation,
    ...channelNavigation,
    ...operationsNavigation,
    ...manageNavigation,
    ["Data Syncs", "/app/syncs", "sync"],
  ];
  const items = allItems.filter(([label]) =>
    label.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div
      className="modal-backdrop command-backdrop"
      role="presentation"
      tabIndex={-1}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <section className="command-palette" role="dialog" aria-modal="true">
        <div className="command-input">
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages and actions…"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="command-results">
          <span>Navigation</span>
          {items.map(([label, href, icon]) => (
            <button
              key={label}
              onClick={() => {
                navigate(href);
                onClose();
              }}
            >
              {iconMap[icon]}
              <span>{label}</span>
              <ArrowRight />
            </button>
          ))}
          <span>Quick actions</span>
          <button
            onClick={() => {
              navigate("/app/campaigns/new");
              onClose();
            }}
          >
            <Sparkles />
            <span>Create coordinated campaign</span>
            <ArrowRight />
          </button>
          <button
            onClick={() => {
              navigate("/app/integrations");
              onClose();
            }}
          >
            <Plus />
            <span>Add integration</span>
            <ArrowRight />
          </button>
        </div>
        <footer>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> Navigate
          </span>
          <span>
            <kbd>↵</kbd> Open
          </span>
          <span>
            <kbd>esc</kbd> Close
          </span>
        </footer>
      </section>
    </div>
  );
}
