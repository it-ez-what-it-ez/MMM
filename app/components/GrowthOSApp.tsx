"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
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
  Layers3,
  LayoutGrid,
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
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { navigation, product } from "@/lib/product";
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

export function GrowthOSApp({ initialPath }: { initialPath: string }) {
  const [state, setState] = useState<AppState | null>(null);
  const [path, setPath] = useState(initialPath);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
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
    if (path === "/app")
      return (
        <Dashboard state={state} navigate={navigate} runAction={runAction} />
      );
    if (path === "/app/integrations")
      return (
        <Integrations state={state} navigate={navigate} runAction={runAction} />
      );
    if (path.startsWith("/app/integrations/"))
      return (
        <ConnectionDetail
          state={state}
          connectionId={path.split("/").pop()!}
          navigate={navigate}
        />
      );
    if (path === "/app/brand-kit")
      return <BrandKit state={state} runAction={runAction} />;
    if (path === "/app/campaigns/new")
      return (
        <CampaignCreator
          state={state}
          navigate={navigate}
          runAction={runAction}
        />
      );
    if (path === "/app/campaigns/templates")
      return (
        <CampaignTemplateLibrary
          state={state}
          navigate={navigate}
          runAction={runAction}
        />
      );
    if (path === "/app/campaigns")
      return <Campaigns state={state} navigate={navigate} />;
    if (path.startsWith("/app/campaigns/"))
      return (
        <CampaignWorkspace
          state={state}
          campaignId={path.split("/").pop()!}
          navigate={navigate}
          runAction={runAction}
        />
      );
    if (path === "/app/calendar")
      return <CalendarView state={state} runAction={runAction} />;
    if (path === "/app/approvals")
      return <ApprovalsView state={state} runAction={runAction} />;
    if (path === "/app/audiences")
      return <AudiencesView state={state} runAction={runAction} />;
    if (path === "/app/syncs")
      return <SyncsView state={state} runAction={runAction} />;
    if (path === "/app/paid-ads")
      return <PaidAdsView state={state} runAction={runAction} />;
    if (path === "/app/insights")
      return (
        <InsightsView state={state} navigate={navigate} runAction={runAction} />
      );
    if (path === "/app/team") return <TeamView state={state} />;
    if (path === "/app/audit-log") return <AuditView state={state} />;
    if (path === "/app/settings")
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
          {sidebarOpen && "Create campaign"}
        </button>
        <nav aria-label="Main navigation">
          {navigation.map((section) => (
            <div className="nav-section" key={section.group || "home"}>
              {sidebarOpen && section.group && (
                <span className="nav-label">{section.group}</span>
              )}
              {section.items.map(([label, href, icon]) => (
                <button
                  key={label}
                  className={`nav-item ${path === href.split("?")[0] || (href !== "/app" && path.startsWith(href.split("?")[0] + "/")) ? "active" : ""}`}
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
        </nav>
        <div className="sidebar-footer">
          <button
            className="nav-item ai-shortcut"
            onClick={() => setAssistantOpen(true)}
          >
            <Sparkles />
            {sidebarOpen && (
              <>
                <span>AI assistant</span>
                <kbd>⌘/</kbd>
              </>
            )}
          </button>
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
              className="icon-button has-notification"
              aria-label="Notifications"
            >
              <Bell />
              <i />
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
  runAction,
}: {
  state: AppState;
  navigate: (path: string) => void;
  runAction: <T>(
    payload: ActionPayload,
    success: string,
  ) => Promise<ActionResult<T>>;
}) {
  const [prompt, setPrompt] = useState("");
  const [range, setRange] = useState<7 | 30>(30);
  const [creating, setCreating] = useState(false);
  const pending = state.approvals.filter(
    (item) => item.state === "PENDING",
  ).length;
  const connected = state.connections.filter(
    (item) => item.state === "CONNECTED",
  ).length;
  const scheduled = state.content.filter(
    (item) => item.state === "SCHEDULED",
  ).length;
  const filtered = state.metrics.slice(-range);
  const totals = filtered.reduce(
    (sum, item) => ({
      impressions: sum.impressions + item.impressions,
      clicks: sum.clicks + item.clicks,
      leads: sum.leads + item.leads,
      spend: sum.spend + item.spend,
      revenue: sum.revenue + item.revenue,
    }),
    { impressions: 0, clicks: 0, leads: 0, spend: 0, revenue: 0 },
  );
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    setCreating(true);
    const result = await runAction<{ campaignId: string }>(
      {
        type: "createCampaign",
        prompt,
        channels: ["LinkedIn", "Email", "Meta Ads"],
      },
      "Coordinated campaign generated",
    );
    setCreating(false);
    if (result.ok) navigate(`/app/campaigns/${result.data.campaignId}`);
  };
  const checklist = [
    [
      "Complete Brand Kit",
      Boolean(state.brand.voice.traits.length),
      "/app/brand-kit",
    ],
    [
      "Connect a data source",
      state.connections.some(
        (connection) =>
          state.definitions.find(
            (definition) => definition.id === connection.definitionId,
          )?.direction !== "DESTINATION",
      ),
      "/app/integrations",
    ],
    [
      "Connect a publishing destination",
      state.connections.some((connection) =>
        connection.capabilities.includes("PUBLISH_ORGANIC_CONTENT"),
      ),
      "/app/integrations",
    ],
    [
      "Connect analytics",
      state.connections.some((connection) =>
        connection.capabilities.includes("READ_METRICS"),
      ),
      "/app/integrations",
    ],
    ["Create first campaign", state.campaigns.length > 0, "/app/campaigns"],
    [
      "Approve first content",
      state.content.some((item) =>
        ["APPROVED", "SCHEDULED", "PUBLISHED"].includes(item.state),
      ),
      "/app/approvals",
    ],
  ] as const;
  return (
    <div className="page dashboard-page">
      <section className="command-hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <Sparkles /> GrowthOS command center
          </span>
          <h1>Good afternoon, {state.currentUser.name.split(" ")[0]}.</h1>
          <p>What outcome should your marketing team create next?</p>
        </div>
        <form className="ai-command" onSubmit={create}>
          <div className="ai-orb">
            <Sparkles />
          </div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="What do you want to achieve?"
            aria-label="Campaign objective"
          />
          <button
            className="command-send"
            disabled={creating || !prompt.trim()}
            aria-label="Generate campaign"
          >
            {creating ? <Loader2 className="spin" /> : <ArrowRight />}
          </button>
          <div className="suggestion-row">
            {[
              "Launch a new feature",
              "Create educational content",
              "Re-engage inactive trials",
            ].map((value) => (
              <button
                type="button"
                onClick={() => setPrompt(value)}
                key={value}
              >
                {value}
              </button>
            ))}
          </div>
        </form>
      </section>
      <div className="dashboard-grid">
        <section className="card setup-card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Workspace setup</span>
              <h2>Ready to orchestrate</h2>
            </div>
            <strong>
              {checklist.filter(([, done]) => done).length}/{checklist.length}
            </strong>
          </div>
          <div className="progress-track">
            <span
              style={{
                width: `${(checklist.filter(([, done]) => done).length / checklist.length) * 100}%`,
              }}
            />
          </div>
          <div className="checklist">
            {checklist.map(([label, done, href]) => (
              <button onClick={() => navigate(href)} key={label}>
                <span className={done ? "complete" : ""}>
                  {done ? <Check /> : <span />}
                </span>
                {label}
                <ChevronRight />
              </button>
            ))}
          </div>
        </section>
        <section className="card overview-card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Operations</span>
              <h2>Workspace pulse</h2>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("/app/audit-log")}
            >
              View activity <ArrowRight />
            </button>
          </div>
          <div className="mini-stat-grid">
            <button onClick={() => navigate("/app/campaigns")}>
              <strong>
                {
                  state.campaigns.filter((item) =>
                    ["LIVE", "SCHEDULED"].includes(item.state),
                  ).length
                }
              </strong>
              <span>Active campaigns</span>
              <small className="trend-up">+1 this month</small>
            </button>
            <button onClick={() => navigate("/app/approvals")}>
              <strong>{pending}</strong>
              <span>Awaiting approval</span>
              <small>{pending ? "Needs review" : "All clear"}</small>
            </button>
            <button onClick={() => navigate("/app/calendar")}>
              <strong>{scheduled}</strong>
              <span>Scheduled posts</span>
              <small>Next 14 days</small>
            </button>
            <button onClick={() => navigate("/app/integrations")}>
              <strong>{connected}</strong>
              <span>Healthy connections</span>
              <small>
                {
                  state.connections.filter((item) => item.state === "DEGRADED")
                    .length
                }{" "}
                warning
              </small>
            </button>
          </div>
        </section>
      </div>
      <section className="card performance-card">
        <div className="card-head">
          <div>
            <span className="eyebrow">Cross-channel performance</span>
            <h2>Marketing is building momentum</h2>
          </div>
          <div className="segmented">
            <button
              className={range === 7 ? "active" : ""}
              onClick={() => setRange(7)}
            >
              7 days
            </button>
            <button
              className={range === 30 ? "active" : ""}
              onClick={() => setRange(30)}
            >
              30 days
            </button>
          </div>
        </div>
        <div className="performance-layout">
          <div className="performance-stats">
            <div>
              <span>Impressions</span>
              <strong>{compact(totals.impressions)}</strong>
              <small className="trend-up">↑ 18.4%</small>
            </div>
            <div>
              <span>Clicks</span>
              <strong>{compact(totals.clicks)}</strong>
              <small className="trend-up">↑ 12.1%</small>
            </div>
            <div>
              <span>Leads</span>
              <strong>{compact(totals.leads)}</strong>
              <small className="trend-up">↑ 9.8%</small>
            </div>
            <div>
              <span>Cost / result</span>
              <strong>
                {money(
                  totals.spend / Math.max(totals.leads, 1),
                  state.workspace.currency,
                )}
              </strong>
              <small className="trend-up">↓ 6.3%</small>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={filtered}>
                <defs>
                  <linearGradient id="growthArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0f766e" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#0f766e" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                    boxShadow: "0 10px 30px rgba(25,50,45,.08)",
                  }}
                  labelFormatter={(value) =>
                    date(String(value), { month: "short", day: "numeric" })
                  }
                />
                <Area
                  type="monotone"
                  dataKey="impressions"
                  stroke="#0f766e"
                  strokeWidth={2.4}
                  fill="url(#growthArea)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
      <div className="dashboard-grid lower-grid">
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Needs attention</span>
              <h2>Operational signals</h2>
            </div>
            <span className="count-pill">2</span>
          </div>
          <div className="signal-list">
            <button onClick={() => navigate("/app/integrations")}>
              <span className="signal-icon amber">
                <HeartPulse />
              </span>
              <span>
                <strong>Klaviyo connection degraded</strong>
                <small>Rate limit interrupted the last metric import</small>
              </span>
              <Badge value="DEGRADED" />
            </button>
            <button onClick={() => navigate("/app/syncs")}>
              <span className="signal-icon red">
                <AlertTriangle />
              </span>
              <span>
                <strong>Trial profiles sync failed</strong>
                <small>4,012 records are ready to retry</small>
              </span>
              <Badge value="FAILED" />
            </button>
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Recent activity</span>
              <h2>What changed</h2>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("/app/audit-log")}
            >
              See all
            </button>
          </div>
          <div className="activity-list">
            {state.audits.slice(0, 5).map((item) => (
              <div key={item.id}>
                <span className="activity-node" />
                <span>
                  <strong>{human(item.action)}</strong>
                  <small>{item.detail}</small>
                </span>
                <time>{date(item.createdAt)}</time>
              </div>
            ))}
          </div>
        </section>
      </div>
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
  const [view, setView] = useState<"grid" | "table">("grid");
  const [filter, setFilter] = useState("All");
  const items = state.campaigns.filter(
    (campaign) => filter === "All" || campaign.state === filter,
  );
  return (
    <div className="page">
      <PageHeader
        eyebrow="Create"
        title="Campaigns"
        description="Plan and operate coordinated, brand-aware programs across every connected channel."
        actions={
          <>
            <button
              className="button secondary"
              onClick={() => navigate("/app/campaigns/templates")}
            >
              <Library /> Browse templates
            </button>
            <button
              className="button primary"
              onClick={() => navigate("/app/campaigns/new")}
            >
              <Sparkles /> Create campaign
            </button>
          </>
        }
      />
      <div className="toolbar">
        <div className="filter-pills">
          {["All", "LIVE", "AWAITING_APPROVAL", "SCHEDULED", "DRAFT"].map(
            (item) => (
              <button
                className={filter === item ? "active" : ""}
                onClick={() => setFilter(item)}
                key={item}
              >
                {human(item)}
              </button>
            ),
          )}
        </div>
        <div className="view-toggle">
          <button
            className={view === "grid" ? "active" : ""}
            onClick={() => setView("grid")}
          >
            <LayoutGrid />
          </button>
          <button
            className={view === "table" ? "active" : ""}
            onClick={() => setView("table")}
          >
            <Menu />
          </button>
        </div>
      </div>
      <div className={view === "grid" ? "campaign-grid" : "campaign-list"}>
        {items.map((campaign) => (
          <button
            className="campaign-card card"
            key={campaign.id}
            onClick={() => navigate(`/app/campaigns/${campaign.id}`)}
          >
            <div className="campaign-card-top">
              <Badge value={campaign.state} />
              <span>
                {date(campaign.startDate)} — {date(campaign.endDate)}
              </span>
            </div>
            <h2>{campaign.title}</h2>
            <p>{campaign.summary}</p>
            <div className="channel-row">
              {campaign.channels.map((channel) => (
                <span key={channel}>{channel}</span>
              ))}
            </div>
            <div className="campaign-progress">
              <div>
                <span>Campaign progress</span>
                <strong>{campaign.progress}%</strong>
              </div>
              <div className="progress-track">
                <span style={{ width: `${campaign.progress}%` }} />
              </div>
            </div>
            <footer>
              <span className="avatar small">PS</span>
              <span>
                {
                  state.content.filter(
                    (item) => item.campaignId === campaign.id,
                  ).length
                }{" "}
                assets
              </span>
              <span>
                {
                  state.approvals.filter(
                    (approval) =>
                      state.content.find(
                        (item) => item.id === approval.contentId,
                      )?.campaignId === campaign.id &&
                      approval.state === "PENDING",
                  ).length
                }{" "}
                approvals
              </span>
              <ArrowRight />
            </footer>
          </button>
        ))}
      </div>
    </div>
  );
}

function CampaignTemplateLibrary({
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
  type Template = AppState["templates"][number];
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<Template | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const categories = [
    "All",
    "Seasonal",
    "Launch",
    "Demand generation",
    "Lifecycle",
  ];
  const filtered = state.templates.filter((template) => {
    const matchesCategory =
      category === "All" || template.category === category;
    const haystack =
      `${template.name} ${template.description} ${template.occasion} ${template.channels.join(" ")}`.toLowerCase();
    return matchesCategory && haystack.includes(search.toLowerCase().trim());
  });

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

  const openTemplate = (template: Template) => {
    setSelected(template);
    setCampaignName(
      template.category === "Seasonal"
        ? `${template.occasion} 2026 — ${state.brand.name}`
        : `${template.name} — ${state.brand.name}`,
    );
    setStartDate(recommendedStart(template));
    setVariables(
      Object.fromEntries(
        template.variables.map((item) => [item.key, item.defaultValue]),
      ),
    );
  };

  const createFromTemplate = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setCreating(true);
    const result = await runAction<{ campaignId: string; assetCount: number }>(
      {
        type: "useCampaignTemplate",
        templateId: selected.id,
        name: campaignName,
        startDate,
        variables,
      },
      `${selected.name} created with ${selected.assets.length} scheduled drafts`,
    );
    setCreating(false);
    if (result.ok) navigate(`/app/campaigns/${result.data.campaignId}`);
  };

  return (
    <div className="page template-library-page">
      <button className="back-link" onClick={() => navigate("/app/campaigns")}>
        <ArrowLeft /> Campaigns
      </button>
      <PageHeader
        eyebrow="Campaign templates"
        title="Start with a complete campaign, not a blank page"
        description="Choose a proven seasonal or evergreen playbook, customize the offer and timing, then review every scheduled asset before it goes live."
        actions={
          <button
            className="button secondary"
            onClick={() => navigate("/app/campaigns/new")}
          >
            <Sparkles /> Create with AI
          </button>
        }
      />

      <section className="template-hero card">
        <div>
          <span className="eyebrow">
            <Library /> Ready-to-run playbooks
          </span>
          <h2>One choice creates the whole operating plan</h2>
          <p>
            Each template includes editable campaign variables, channel-specific
            copy, relative scheduling, success metrics, and approval-ready
            drafts.
          </p>
        </div>
        <div className="template-hero-stats">
          <span>
            <strong>{state.templates.length}</strong> playbooks
          </span>
          <span>
            <strong>
              {state.templates.reduce(
                (sum, item) => sum + item.assets.length,
                0,
              )}
            </strong>{" "}
            assets
          </span>
          <span>
            <strong>4</strong> seasonal moments
          </span>
        </div>
      </section>

      <div className="template-toolbar">
        <div className="search-box">
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search templates, occasions, or channels"
            aria-label="Search campaign templates"
          />
        </div>
        <div className="filter-pills">
          {categories.map((item) => (
            <button
              className={category === item ? "active" : ""}
              onClick={() => setCategory(item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {filtered.length ? (
        <div className="template-grid">
          {filtered.map((template) => (
            <article className="template-card card" key={template.id}>
              <div className={`template-art template-art-${template.slug}`}>
                <span className="template-occasion">{template.occasion}</span>
                <span className="template-art-mark">
                  {template.category === "Seasonal" ? (
                    <CalendarDays />
                  ) : template.category === "Launch" ? (
                    <Rocket />
                  ) : template.category === "Lifecycle" ? (
                    <RefreshCw />
                  ) : (
                    <Megaphone />
                  )}
                </span>
                <small>{template.badge}</small>
              </div>
              <div className="template-card-body">
                <header>
                  <Badge
                    value={template.featured ? "READY_FOR_REVIEW" : "DRAFT"}
                  >
                    {template.featured ? "Featured" : template.category}
                  </Badge>
                  <span>{template.durationDays} days</span>
                </header>
                <h2>{template.name}</h2>
                <p>{template.description}</p>
                <div className="template-bundle-counts">
                  <span>
                    <FileText /> {template.assets.length} assets
                  </span>
                  <span>
                    <Layers3 /> {template.channels.length} channels
                  </span>
                  <span>
                    <CircleDollarSign />{" "}
                    {money(
                      template.recommendedBudget,
                      state.workspace.currency,
                    )}
                  </span>
                </div>
                <div className="channel-row">
                  {template.channels.map((channel) => (
                    <span key={channel}>{channel}</span>
                  ))}
                </div>
                <button
                  className="button primary full"
                  onClick={() => openTemplate(template)}
                >
                  Use template <ArrowRight />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={<Search />}
          title="No matching templates"
          text="Try another category or a broader search term."
          action={
            <button
              className="button secondary"
              onClick={() => {
                setSearch("");
                setCategory("All");
              }}
            >
              Clear filters
            </button>
          }
        />
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name ?? "Campaign template"}
        eyebrow={
          selected
            ? `${selected.occasion} · ${selected.assets.length} assets · ${selected.durationDays} days`
            : undefined
        }
        wide
      >
        {selected && (
          <form onSubmit={(event) => void createFromTemplate(event)}>
            <div className="modal-body template-config-layout">
              <section className="template-preview-panel">
                <div
                  className={`template-art template-art-${selected.slug} large-template-art`}
                >
                  <span className="template-occasion">{selected.occasion}</span>
                  <span className="template-art-mark">
                    <CalendarDays />
                  </span>
                  <small>{selected.badge}</small>
                </div>
                <div className="template-preview-copy">
                  <h3>What this playbook creates</h3>
                  <p>{selected.description}</p>
                  <dl>
                    <div>
                      <dt>Objective</dt>
                      <dd>{selected.objective}</dd>
                    </div>
                    <div>
                      <dt>Audience</dt>
                      <dd>{selected.audience}</dd>
                    </div>
                    <div>
                      <dt>Recommended media</dt>
                      <dd>
                        {money(
                          selected.recommendedBudget,
                          state.workspace.currency,
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="template-asset-timeline">
                  <span className="eyebrow">Included schedule</span>
                  {selected.assets.map((item, index) => (
                    <div key={`${item.channel}-${item.type}-${index}`}>
                      <i>
                        {item.dayOffset === 0 ? "Day 1" : `+${item.dayOffset}d`}
                      </i>
                      <span className="channel-icon">
                        {initials(item.channel)}
                      </span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {item.channel} · {item.type}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="template-variable-panel">
                <div>
                  <span className="eyebrow">Customize campaign</span>
                  <h3>Make the playbook yours</h3>
                  <p>
                    These values are applied across every asset. All content
                    remains editable after creation.
                  </p>
                </div>
                <label>
                  Campaign name
                  <input
                    required
                    value={campaignName}
                    onChange={(event) => setCampaignName(event.target.value)}
                  />
                </label>
                <label>
                  Campaign start date
                  <input
                    required
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                  <small>Every asset is scheduled relative to this date.</small>
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
                <div className="template-readiness">
                  <CheckCircle2 />
                  <span>
                    <strong>
                      {selected.assets.length} editable drafts ready
                    </strong>
                    <small>
                      Nothing publishes until your normal approval flow is
                      complete.
                    </small>
                  </span>
                </div>
              </section>
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="button ghost"
                onClick={() => setSelected(null)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={creating}
              >
                {creating ? <Loader2 className="spin" /> : <Sparkles />}
                {creating
                  ? "Building campaign…"
                  : `Create ${selected.assets.length}-asset campaign`}
              </button>
            </footer>
          </form>
        )}
      </Modal>
    </div>
  );
}

function CampaignCreator({
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
  const [mode, setMode] = useState<"conversation" | "structured">(
    "conversation",
  );
  const [prompt, setPrompt] = useState("");
  const [channels, setChannels] = useState(["LinkedIn", "Email", "Meta Ads"]);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(1);
  const available = [
    "LinkedIn",
    "Email",
    "Meta Ads",
    "Google Ads",
    "Instagram",
    "Blog",
  ];
  const generate = async () => {
    const finalPrompt =
      prompt ||
      "Create a three-week campaign for our analytics activation feature with the goal of demo bookings";
    setCreating(true);
    const result = await runAction<{ campaignId: string }>(
      { type: "createCampaign", prompt: finalPrompt, channels },
      "Campaign plan and content generated",
    );
    setCreating(false);
    if (result.ok) navigate(`/app/campaigns/${result.data.campaignId}`);
  };
  return (
    <div className="page creator-page">
      <button className="back-link" onClick={() => navigate("/app/campaigns")}>
        <ArrowLeft /> Campaigns
      </button>
      <PageHeader
        eyebrow="New campaign"
        title="Turn an objective into coordinated execution"
        description="GrowthOS plans the campaign, drafts each channel, and keeps approval and activation in one workflow."
        actions={
          <button
            className="button secondary"
            onClick={() => navigate("/app/campaigns/templates")}
          >
            <Library /> Start from a template
          </button>
        }
      />
      <div className="mode-switch">
        <button
          className={mode === "conversation" ? "active" : ""}
          onClick={() => setMode("conversation")}
        >
          <MessageSquareText />
          <span>
            <strong>Conversational brief</strong>
            <small>Describe the outcome in your own words</small>
          </span>
        </button>
        <button
          className={mode === "structured" ? "active" : ""}
          onClick={() => setMode("structured")}
        >
          <ListFilter />
          <span>
            <strong>Structured wizard</strong>
            <small>Build the campaign step by step</small>
          </span>
        </button>
      </div>
      {mode === "conversation" ? (
        <section className="creator-panel">
          <div className="creator-prompt">
            <div className="ai-orb large">
              <Sparkles />
            </div>
            <span className="eyebrow">Campaign strategist</span>
            <h2>What should this campaign achieve?</h2>
            <textarea
              rows={7}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Create a three-week campaign for our new analytics feature. Target small SaaS teams. The goal is demo bookings…"
            />
            <div className="prompt-suggestions">
              {[
                "Launch the activation feature",
                "Re-engage dormant trials",
                "Promote the benchmark report",
              ].map((item) => (
                <button
                  onClick={() =>
                    setPrompt(
                      `Create a three-week coordinated campaign to ${item.toLowerCase()}. Target small and mid-sized SaaS teams. The primary goal is qualified demo bookings.`,
                    )
                  }
                  key={item}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <aside className="creator-context">
            <span className="eyebrow">Campaign context</span>
            <div className="context-item">
              <Palette />
              <span>
                <strong>{state.brand.name}</strong>
                <small>{state.brand.voice.tone} voice</small>
              </span>
              <CheckCircle2 />
            </div>
            <h3>Channels</h3>
            <div className="channel-picker">
              {available.map((channel) => {
                const connected =
                  channel === "Email"
                    ? state.connections.some(
                        (item) => item.definitionId === "int-klaviyo",
                      )
                    : channel === "Google Ads"
                      ? state.connections.some(
                          (item) => item.definitionId === "int-google-ads",
                        )
                      : true;
                return (
                  <button
                    className={channels.includes(channel) ? "selected" : ""}
                    onClick={() =>
                      setChannels((value) =>
                        value.includes(channel)
                          ? value.filter((item) => item !== channel)
                          : [...value, channel],
                      )
                    }
                    key={channel}
                  >
                    <span>{channels.includes(channel) && <Check />}</span>
                    {channel}
                    {!connected && <small>Connect</small>}
                  </button>
                );
              })}
            </div>
            <div className="generation-summary">
              <Sparkles />
              <span>
                <strong>{channels.length * 2 + 1} coordinated assets</strong>
                <small>Plan, copy, variants, and success metrics</small>
              </span>
            </div>
            <button
              className="button primary full large-button"
              onClick={() => void generate()}
              disabled={creating || !prompt.trim()}
            >
              {creating ? <Loader2 className="spin" /> : <Sparkles />}
              {creating ? "Building campaign…" : "Generate campaign"}
            </button>
          </aside>
        </section>
      ) : (
        <section className="creator-panel structured">
          <div className="wizard-side">
            {[
              "Goal",
              "Audience",
              "Channels",
              "Schedule",
              "Context",
              "Generate",
            ].map((item, index) => (
              <button
                className={
                  step === index + 1
                    ? "active"
                    : step > index + 1
                      ? "complete"
                      : ""
                }
                onClick={() => setStep(index + 1)}
                key={item}
              >
                <i>{step > index + 1 ? <Check /> : index + 1}</i>
                <span>{item}</span>
              </button>
            ))}
          </div>
          <div className="structured-content">
            <span className="eyebrow">Step {step} of 6</span>
            <h2>
              {
                [
                  "Define the campaign goal",
                  "Choose the audience",
                  "Select connected channels",
                  "Set the operating window",
                  "Ground the campaign",
                  "Review and generate",
                ][step - 1]
              }
            </h2>
            {step === 1 && (
              <div className="form-grid">
                <label className="span-2">
                  Campaign objective
                  <textarea
                    rows={4}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Increase qualified demo bookings…"
                  />
                </label>
                <label>
                  Primary metric
                  <select>
                    <option>Demo bookings</option>
                    <option>Qualified leads</option>
                    <option>Revenue</option>
                  </select>
                </label>
                <label>
                  Offer
                  <input placeholder="Growth signal review" />
                </label>
              </div>
            )}
            {step === 2 && (
              <div className="form-grid">
                <label className="span-2">
                  Audience description
                  <textarea
                    rows={4}
                    defaultValue="Growth leaders at SaaS companies with 20–250 employees"
                  />
                </label>
                <label>
                  Countries
                  <input defaultValue="Canada, United States" />
                </label>
                <label>
                  Customer stage
                  <select>
                    <option>Prospect and trial</option>
                    <option>Customer</option>
                  </select>
                </label>
              </div>
            )}
            {step === 3 && (
              <div className="channel-picker large">
                {available.map((channel) => (
                  <button
                    className={channels.includes(channel) ? "selected" : ""}
                    onClick={() =>
                      setChannels((value) =>
                        value.includes(channel)
                          ? value.filter((item) => item !== channel)
                          : [...value, channel],
                      )
                    }
                    key={channel}
                  >
                    <span>{channels.includes(channel) && <Check />}</span>
                    {channel}
                  </button>
                ))}
              </div>
            )}
            {step === 4 && (
              <div className="form-grid">
                <label>
                  Start date
                  <input type="date" defaultValue="2026-08-24" />
                </label>
                <label>
                  End date
                  <input type="date" defaultValue="2026-09-14" />
                </label>
                <label>
                  Review buffer
                  <select>
                    <option>48 hours</option>
                    <option>24 hours</option>
                  </select>
                </label>
                <label>
                  Time zone
                  <select>
                    <option>America/Toronto</option>
                  </select>
                </label>
              </div>
            )}
            {step === 5 && (
              <div className="context-select-grid">
                {state.sources.map((source) => (
                  <label key={source.id}>
                    <input
                      type="checkbox"
                      defaultChecked={source.id !== "source-3"}
                    />
                    <FileText />
                    <span>
                      <strong>{source.name}</strong>
                      <small>{source.kind}</small>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {step === 6 && (
              <div className="review-generation">
                <div className="success-orb violet">
                  <Sparkles />
                </div>
                <h3>Ready to create a coordinated campaign</h3>
                <p>
                  GrowthOS will generate a plan, {channels.length} channel
                  strategies, and {channels.length * 2 + 1} editable content
                  assets using the current Brand Kit.
                </p>
                <button
                  className="button primary large-button"
                  onClick={() => void generate()}
                  disabled={creating}
                >
                  {creating ? <Loader2 className="spin" /> : <Sparkles />}{" "}
                  Generate campaign
                </button>
              </div>
            )}
            <footer className="wizard-footer">
              <button
                className="button ghost"
                disabled={step === 1}
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft /> Back
              </button>
              {step < 6 && (
                <button
                  className="button primary"
                  onClick={() => setStep(step + 1)}
                >
                  Continue <ArrowRight />
                </button>
              )}
            </footer>
          </div>
        </section>
      )}
    </div>
  );
}

function CampaignWorkspace({
  state,
  campaignId,
  navigate,
  runAction,
}: {
  state: AppState;
  campaignId: string;
  navigate: (path: string) => void;
  runAction: <T>(
    payload: ActionPayload,
    success: string,
  ) => Promise<ActionResult<T>>;
}) {
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  const [tab, setTab] = useState("Overview");
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
  const campaignApprovals = state.approvals.filter((approval) =>
    content.some((item) => item.id === approval.contentId),
  );
  const openEdit = (item: ContentItem) => {
    setEditing(item);
    setBody(item.body);
  };
  return (
    <div className="page campaign-workspace">
      <button className="back-link" onClick={() => navigate("/app/campaigns")}>
        <ArrowLeft /> Campaigns
      </button>
      <PageHeader
        eyebrow="Campaign workspace"
        title={campaign.title}
        description={campaign.summary}
        actions={
          <>
            <button className="button secondary">
              <Pencil /> Edit plan
            </button>
            <button className="button secondary">
              <MoreHorizontal />
            </button>
            <button
              className="button primary"
              onClick={() => setTab("Content")}
            >
              <Sparkles /> Review content
            </button>
          </>
        }
      />
      <div className="campaign-meta-bar">
        <Badge value={campaign.state} />
        <span>
          <CalendarDays />
          {date(campaign.startDate)} — {date(campaign.endDate)}
        </span>
        <span>
          <Target />
          {campaign.objective}
        </span>
        <span>
          <span className="avatar tiny">PS</span> Priya Shah
        </span>
      </div>
      <div className="tabs-line scroll-tabs">
        {[
          "Overview",
          "Plan",
          "Content",
          "Audience",
          "Destinations",
          "Calendar",
          "Approvals",
          "Insights",
          "Activity",
        ].map((item) => (
          <button
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
            key={item}
          >
            {item}
            {item === "Approvals" &&
              campaignApprovals.filter(
                (approval) => approval.state === "PENDING",
              ).length > 0 && (
                <span>
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
      {tab === "Overview" && (
        <div>
          <div className="campaign-metrics">
            <MetricCard
              label="Progress"
              value={`${campaign.progress}%`}
              detail="On track"
              icon={<Gauge />}
            />
            <MetricCard
              label="Content"
              value={`${content.length}`}
              detail={`${content.filter((item) => item.state === "PUBLISHED").length} published`}
              icon={<FileText />}
              toneName="violet"
            />
            <MetricCard
              label="Approvals"
              value={`${campaignApprovals.filter((item) => item.state === "PENDING").length}`}
              detail="Awaiting review"
              icon={<ShieldCheck />}
              toneName="amber"
            />
            <MetricCard
              label="Conversions"
              value={`${content.reduce((sum, item) => sum + item.metrics.conversions, 0)}`}
              detail="From live content"
              icon={<MousePointerClick />}
            />
          </div>
          <div className="two-column">
            <section className="card">
              <div className="card-head">
                <div>
                  <span className="eyebrow">Campaign brief</span>
                  <h2>What we are creating</h2>
                </div>
                <button className="icon-button">
                  <Pencil />
                </button>
              </div>
              <div className="brief-grid">
                <div>
                  <span>Objective</span>
                  <strong>{campaign.objective}</strong>
                </div>
                <div>
                  <span>Audience</span>
                  <strong>{campaign.audience}</strong>
                </div>
                <div>
                  <span>Offer</span>
                  <strong>{campaign.offer}</strong>
                </div>
                <div>
                  <span>Channels</span>
                  <div className="channel-row">
                    {campaign.channels.map((channel) => (
                      <em key={channel}>{channel}</em>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <div>
                  <span className="eyebrow">Execution</span>
                  <h2>Channel readiness</h2>
                </div>
              </div>
              <div className="readiness-list">
                {campaign.channels.map((channel) => {
                  const count = content.filter(
                    (item) => item.channel === channel,
                  ).length;
                  return (
                    <div key={channel}>
                      <span className="channel-icon">{initials(channel)}</span>
                      <span>
                        <strong>{channel}</strong>
                        <small>
                          {count} content item{count === 1 ? "" : "s"}
                        </small>
                      </span>
                      <Badge
                        value={
                          channel === "Google Ads" &&
                          !state.connections.some(
                            (item) => item.definitionId === "int-google-ads",
                          )
                            ? "DEGRADED"
                            : "CONNECTED"
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
          <section className="card content-preview-section">
            <div className="card-head">
              <div>
                <span className="eyebrow">Latest assets</span>
                <h2>Content in motion</h2>
              </div>
              <button className="text-button" onClick={() => setTab("Content")}>
                View all <ArrowRight />
              </button>
            </div>
            <div className="content-preview-grid">
              {content.slice(0, 3).map((item) => (
                <ContentPreview
                  key={item.id}
                  item={item}
                  onEdit={() => openEdit(item)}
                />
              ))}
            </div>
          </section>
        </div>
      )}
      {tab === "Plan" && (
        <div className="plan-layout">
          <section className="card">
            <div className="card-head">
              <div>
                <span className="eyebrow">Strategy</span>
                <h2>Campaign plan</h2>
              </div>
              <button className="button secondary">
                <Pencil /> Edit plan
              </button>
            </div>
            <div className="plan-sections">
              <div>
                <span>Goal</span>
                <h3>{campaign.objective}</h3>
                <p>{campaign.summary}</p>
              </div>
              <div>
                <span>Topics</span>
                <div className="topic-list">
                  {campaign.plan.topics.map((topic) => (
                    <strong key={topic}>{topic}</strong>
                  ))}
                </div>
              </div>
              <div>
                <span>Success metrics</span>
                {campaign.plan.successMetrics.map((metric) => (
                  <p className="check-line" key={metric}>
                    <CheckCircle2 />
                    {metric}
                  </p>
                ))}
              </div>
              <div>
                <span>Source context</span>
                {state.sources.slice(0, 2).map((source) => (
                  <p className="check-line" key={source.id}>
                    <FileText />
                    {source.name}
                  </p>
                ))}
              </div>
            </div>
          </section>
          <aside>
            <section className="card">
              <span className="eyebrow">Assumptions</span>
              {campaign.plan.assumptions.map((item) => (
                <p className="numbered-note" key={item}>
                  {item}
                </p>
              ))}
            </section>
            <section className="card">
              <span className="eyebrow">Risks</span>
              {campaign.plan.risks.map((item) => (
                <p className="risk-note" key={item}>
                  <AlertTriangle />
                  {item}
                </p>
              ))}
            </section>
          </aside>
        </div>
      )}
      {tab === "Content" && (
        <section>
          <div className="library-toolbar">
            <div>
              <h2>{content.length} campaign assets</h2>
              <p>Every edit and regeneration creates a restorable version.</p>
            </div>
            <div>
              <button className="button secondary">
                <ListFilter /> Filter
              </button>
              <button className="button primary">
                <Plus /> Add content
              </button>
            </div>
          </div>
          <div className="content-workspace-grid">
            {content.map((item) => (
              <article className="content-work-card card" key={item.id}>
                <div className="content-channel">
                  <span className="channel-icon">{initials(item.channel)}</span>
                  <span>
                    <strong>{item.channel}</strong>
                    <small>
                      {item.type} · v{item.version}
                    </small>
                  </span>
                  <Badge value={item.state} />
                </div>
                <div className="content-canvas">
                  <span className="eyebrow">{item.title}</span>
                  <p>{item.body}</p>
                  {item.channel.includes("Ads") && (
                    <button>{item.title}</button>
                  )}
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
                      <Link2 />
                      {item.externalId}
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
            ))}
          </div>
        </section>
      )}
      {tab === "Audience" && <AudienceBuilder state={state} />}{" "}
      {tab === "Destinations" && (
        <div className="destination-grid">
          {campaign.channels.map((channel) => (
            <section className="card" key={channel}>
              <div className="destination-title">
                <span className="channel-icon large">{initials(channel)}</span>
                <div>
                  <h2>{channel}</h2>
                  <Badge
                    value={
                      state.connections.some((connection) =>
                        state.definitions
                          .find(
                            (definition) =>
                              definition.id === connection.definitionId,
                          )
                          ?.name.includes(channel.split(" ")[0]),
                      )
                        ? "CONNECTED"
                        : "DEGRADED"
                    }
                  />
                </div>
              </div>
              <div className="detail-list">
                <div>
                  <span>Execution</span>
                  <strong>
                    {content.filter((item) => item.channel === channel).length}{" "}
                    planned assets
                  </strong>
                </div>
                <div>
                  <span>Connected as</span>
                  <strong>Northstar {channel}</strong>
                </div>
                <div>
                  <span>Approval</span>
                  <strong>Required</strong>
                </div>
                <div>
                  <span>Launch mode</span>
                  <strong>
                    {channel.includes("Ads")
                      ? "Create paused"
                      : "Schedule approved"}
                  </strong>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
      {tab === "Calendar" && (
        <CalendarView
          state={{ ...state, content }}
          runAction={runAction}
          embedded
        />
      )}{" "}
      {tab === "Approvals" && (
        <ApprovalsView
          state={{ ...state, approvals: campaignApprovals, content }}
          runAction={runAction}
          embedded
        />
      )}{" "}
      {tab === "Insights" && (
        <InsightsView
          state={state}
          navigate={navigate}
          runAction={runAction}
          embedded
        />
      )}{" "}
      {tab === "Activity" && (
        <section className="card activity-timeline">
          {state.audits
            .filter(
              (item) =>
                item.entityId === campaign.id ||
                content.some((contentItem) => contentItem.id === item.entityId),
            )
            .map((item) => (
              <div key={item.id}>
                <span className="activity-node" />
                <span>
                  <strong>{human(item.action)}</strong>
                  <small>{item.detail}</small>
                </span>
                <time>
                  {date(item.createdAt, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            ))}
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
              <small>
                This action will be recorded in the workspace audit log.
              </small>
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

function ContentPreview({
  item,
  onEdit,
}: {
  item: ContentItem;
  onEdit: () => void;
}) {
  return (
    <article className="mini-content-card">
      <div className="content-channel">
        <span className="channel-icon">{initials(item.channel)}</span>
        <span>
          <strong>{item.channel}</strong>
          <small>{item.type}</small>
        </span>
        <Badge value={item.state} />
      </div>
      <div className="mini-content-canvas">
        <strong>{item.title}</strong>
        <p>{item.body}</p>
      </div>
      <footer>
        <span>Version {item.version}</span>
        <button onClick={onEdit}>
          Open <ArrowRight />
        </button>
      </footer>
    </article>
  );
}

function AudienceBuilder({ state }: { state: AppState }) {
  const audience = state.audiences[0];
  return (
    <section className="audience-builder">
      <div className="audience-rules card">
        <div className="card-head">
          <div>
            <span className="eyebrow">Audience definition</span>
            <h2>{audience.name}</h2>
            <p>{audience.description}</p>
          </div>
          <button className="button secondary">
            <Sparkles /> Refine with AI
          </button>
        </div>
        <div className="rule-group">
          <span className="logic-chip">AND</span>
          {audience.rules.map((rule, index) => (
            <div className="rule-row" key={`${rule.field}-${index}`}>
              <select defaultValue={rule.field}>
                {[
                  "Country",
                  "Lifecycle stage",
                  "Last active date",
                  "Plan",
                  "Total spend",
                  "Lead score",
                  "Email consent",
                  "Ad consent",
                ].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <select defaultValue={rule.operator}>
                <option>is</option>
                <option>is not</option>
                <option>within</option>
                <option>greater than</option>
              </select>
              <input defaultValue={rule.value} />
              <button className="icon-button">
                <X />
              </button>
            </div>
          ))}
          <button className="add-rule">
            <Plus /> Add rule
          </button>
          <button className="add-group">
            <Layers3 /> Add AND/OR group
          </button>
        </div>
      </div>
      <aside>
        <section className="card audience-estimate">
          <span className="eyebrow">Live estimate</span>
          <strong>{compact(audience.size)}</strong>
          <p>eligible people</p>
          <div className="estimate-bar">
            <span style={{ width: "94%" }} />
            <i style={{ width: "6%" }} />
          </div>
          <div>
            <span>
              <i className="dot teal" /> Eligible
            </span>
            <strong>{compact(audience.size)}</strong>
          </div>
          <div>
            <span>
              <i className="dot amber" /> Consent-filtered
            </span>
            <strong>{audience.excluded}</strong>
          </div>
          <div>
            <span>
              <i className="dot gray" /> Suppressed
            </span>
            <strong>74</strong>
          </div>
        </section>
        <section className="card">
          <span className="eyebrow">Eligible destinations</span>
          <div className="eligible-list">
            {audience.destinations.map((item) => (
              <span key={item}>
                <CheckCircle2 />
                {item}
              </span>
            ))}
          </div>
          <div className="alert amber compact-alert">
            <AlertTriangle />
            <span>
              <strong>Consent policy applied</strong>
              <small>Advertising consent required for paid destinations.</small>
            </span>
          </div>
        </section>
      </aside>
    </section>
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
          eyebrow="Create"
          title="Calendar"
          description="One approval-aware schedule across every campaign and channel."
          actions={
            <button className="button primary">
              <Plus /> Schedule content
            </button>
          }
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
        <div className="segmented">
          {["Month", "Week", "5 day", "List"].map((item) => (
            <button
              className={view === item ? "active" : ""}
              onClick={() => setView(item)}
              key={item}
            >
              {item}
            </button>
          ))}
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
  const [view, setView] = useState<"grid" | "table">("grid");
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState<Approval | null>(null);
  const [comment, setComment] = useState("");
  const pending = state.approvals.filter((item) => item.state === "PENDING");
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
          eyebrow="Create"
          title="Approvals"
          description="Make the human decisions that determine what can go live."
          actions={
            <>
              <button className="button secondary">
                <ListFilter /> Filters
              </button>
              <button
                className="button primary"
                disabled={!selected.length}
                onClick={() =>
                  void runAction(
                    {
                      type: "bulkApprove",
                      approvalIds: selected,
                      confirmed: true,
                    },
                    `${selected.length} items approved`,
                  )
                }
              >
                <Check /> Approve selected
              </button>
            </>
          }
        />
      )}
      <div className="approval-summary">
        <MetricCard
          label="Awaiting review"
          value={String(pending.length)}
          detail="Across 2 campaigns"
          icon={<Clock3 />}
          toneName="amber"
        />
        <MetricCard
          label="Approved this week"
          value={String(
            state.approvals.filter((item) => item.state === "APPROVED").length +
              9,
          )}
          detail="89% approval rate"
          icon={<CheckCircle2 />}
        />
        <MetricCard
          label="Average review time"
          value="3.2h"
          detail="↓ 24% this month"
          icon={<Gauge />}
          toneName="violet"
        />
        <div className="view-toggle">
          <button
            className={view === "grid" ? "active" : ""}
            onClick={() => setView("grid")}
          >
            <LayoutGrid />
          </button>
          <button
            className={view === "table" ? "active" : ""}
            onClick={() => setView("table")}
          >
            <Menu />
          </button>
        </div>
      </div>
      {pending.length ? (
        <div className={view === "grid" ? "approval-grid" : "approval-list"}>
          {pending.map((approval) => {
            const item = state.content.find(
              (content) => content.id === approval.contentId,
            )!;
            const campaign = state.campaigns.find(
              (campaignItem) => campaignItem.id === item.campaignId,
            );
            return (
              <article className="approval-card card" key={approval.id}>
                <header>
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
                  <span>
                    <strong>{item.channel}</strong>
                    <small>
                      {item.type} · v{item.version}
                    </small>
                  </span>
                  <Badge value="PENDING" />
                </header>
                <button
                  className="approval-preview"
                  onClick={() => setReview(approval)}
                >
                  <span className="eyebrow">{item.title}</span>
                  <p>{item.body}</p>
                </button>
                <div className="approval-meta">
                  <span>{campaign?.title}</span>
                  <span>Submitted by Priya</span>
                  <span>{date(approval.createdAt)}</span>
                </div>
                <footer>
                  <button
                    className="button ghost"
                    onClick={() => {
                      setReview(approval);
                      setComment(
                        "Please revise the opening and make the evidence more specific.",
                      );
                    }}
                  >
                    Request changes
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setReview(approval);
                      setComment("");
                    }}
                  >
                    Review
                  </button>
                  <button
                    className="button primary"
                    onClick={() => {
                      setReview(approval);
                      setComment("");
                      void runAction(
                        {
                          type: "decideApproval",
                          approvalId: approval.id,
                          decision: "APPROVED",
                        },
                        "Content approved",
                      );
                    }}
                  >
                    <Check /> Approve
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          icon={<CheckCircle2 />}
          title="Approval queue is clear"
          text="New submissions will appear here for review."
        />
      )}
      <section className="card approval-history">
        <div className="card-head">
          <div>
            <span className="eyebrow">Decision history</span>
            <h2>Recent reviews</h2>
          </div>
        </div>
        <div className="data-table">
          <div className="table-row table-header">
            <span>Content</span>
            <span>Decision</span>
            <span>Reviewer</span>
            <span>Comment</span>
            <span>Date</span>
          </div>
          {state.approvals
            .filter((item) => item.state !== "PENDING")
            .map((approval) => {
              const content = state.content.find(
                (item) => item.id === approval.contentId,
              );
              const reviewer = state.users.find(
                (item) => item.id === approval.reviewerId,
              );
              return (
                <div className="table-row" key={approval.id}>
                  <span>
                    <strong>{content?.title}</strong>
                    <small>{content?.channel}</small>
                  </span>
                  <span>
                    <Badge value={approval.state} />
                  </span>
                  <span>{reviewer?.name ?? "—"}</span>
                  <span>{approval.comment ?? "No comment"}</span>
                  <span>{date(approval.decidedAt)}</span>
                </div>
              );
            })}
        </div>
      </section>
      <Modal
        open={Boolean(review)}
        onClose={() => setReview(null)}
        title="Review content"
        eyebrow={
          state.content.find((item) => item.id === review?.contentId)?.channel
        }
        wide
      >
        <div className="modal-body review-layout">
          <div className="review-preview">
            <span className="eyebrow">
              {
                state.content.find((item) => item.id === review?.contentId)
                  ?.title
              }
            </span>
            <p>
              {
                state.content.find((item) => item.id === review?.contentId)
                  ?.body
              }
            </p>
          </div>
          <aside>
            <h3>Brand checks</h3>
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
      engagement: sum.engagement + item.engagement,
      clicks: sum.clicks + item.clicks,
      leads: sum.leads + item.leads,
      spend: sum.spend + item.spend,
      revenue: sum.revenue + item.revenue,
    }),
    {
      impressions: 0,
      engagement: 0,
      clicks: 0,
      leads: 0,
      spend: 0,
      revenue: 0,
    },
  );
  const [creating, setCreating] = useState<string | null>(null);
  const followup = async (insightId: string) => {
    setCreating(insightId);
    const result = await runAction<{ campaignId: string }>(
      { type: "createFollowup", insightId },
      "Follow-up campaign generated from recommendation",
    );
    setCreating(null);
    if (result.ok) navigate(`/app/campaigns/${result.data.campaignId}`);
  };
  return (
    <div className={embedded ? "embedded-page" : "page"}>
      {!embedded && (
        <PageHeader
          eyebrow="Measure"
          title="Insights"
          description="Understand what changed, why it matters, and what GrowthOS recommends next."
          actions={
            <div className="segmented">
              {[7, 30, 90, 365].map((item) => (
                <button
                  className={range === item ? "active" : ""}
                  onClick={() => setRange(Math.min(item, state.metrics.length))}
                  key={item}
                >
                  {item === 365 ? "12 months" : `${item} days`}
                </button>
              ))}
            </div>
          }
        />
      )}
      <div className="insight-metric-grid">
        <div>
          <span>Reach</span>
          <strong>{compact(Math.round(totals.impressions * 0.82))}</strong>
          <small className="trend-up">↑ 16.2%</small>
        </div>
        <div>
          <span>Impressions</span>
          <strong>{compact(totals.impressions)}</strong>
          <small className="trend-up">↑ 18.4%</small>
        </div>
        <div>
          <span>Engagement</span>
          <strong>{compact(totals.engagement)}</strong>
          <small className="trend-up">↑ 11.8%</small>
        </div>
        <div>
          <span>Clicks</span>
          <strong>{compact(totals.clicks)}</strong>
          <small className="trend-up">↑ 12.1%</small>
        </div>
        <div>
          <span>Leads</span>
          <strong>{compact(totals.leads)}</strong>
          <small className="trend-up">↑ 9.8%</small>
        </div>
        <div>
          <span>Revenue</span>
          <strong>{money(totals.revenue, state.workspace.currency)}</strong>
          <small className="trend-up">↑ 14.7%</small>
        </div>
        <div>
          <span>Spend</span>
          <strong>{money(totals.spend, state.workspace.currency)}</strong>
          <small>On plan</small>
        </div>
        <div>
          <span>Cost / result</span>
          <strong>
            {money(
              totals.spend / Math.max(totals.leads, 1),
              state.workspace.currency,
            )}
          </strong>
          <small className="trend-up">↓ 6.3%</small>
        </div>
      </div>
      <section className="card insight-chart">
        <div className="card-head">
          <div>
            <span className="eyebrow">Cross-channel trend</span>
            <h2>More reach is converting efficiently</h2>
          </div>
          <div className="legend">
            <span>
              <i className="teal" /> Impressions
            </span>
            <span>
              <i className="violet" /> Clicks ×20
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
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
            />
            <YAxis hide />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="impressions"
              stroke="#0f766e"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey={(item) => item.clicks * 20}
              name="Clicks ×20"
              stroke="#7357d8"
              strokeWidth={2.2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>
      <section className="recommendation-section">
        <div className="section-title">
          <div>
            <span className="eyebrow">
              <Sparkles /> AI recommendations
            </span>
            <h2>Four actions worth taking now</h2>
          </div>
          <p>
            Evidence, confidence, and expected effect are shown before you act.
          </p>
        </div>
        <div className="recommendation-grid">
          {state.insights.map((insight) => (
            <article className="recommendation-card card" key={insight.id}>
              <header>
                <span
                  className={`signal-icon ${insight.kind === "WARNING" ? "amber" : insight.kind === "CONNECTION" ? "red" : "violet"}`}
                >
                  {insight.kind === "WARNING" ? (
                    <AlertTriangle />
                  ) : insight.kind === "CONNECTION" ? (
                    <Link2 />
                  ) : (
                    <Sparkles />
                  )}
                </span>
                <Badge>{insight.kind}</Badge>
                <strong>{insight.confidence}% confidence</strong>
              </header>
              <h3>{insight.title}</h3>
              <p>{insight.evidence}</p>
              <div className="effect-box">
                <span>Expected effect</span>
                <strong>{insight.expectedEffect}</strong>
              </div>
              <footer>
                <span>{insight.action}</span>
                <button
                  className="button secondary"
                  disabled={creating === insight.id}
                  onClick={() => void followup(insight.id)}
                >
                  {creating === insight.id ? (
                    <Loader2 className="spin" />
                  ) : (
                    <Plus />
                  )}{" "}
                  Create campaign
                </button>
              </footer>
            </article>
          ))}
        </div>
      </section>
      <div className="two-column">
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Platform performance</span>
              <h2>Channel contribution</h2>
            </div>
          </div>
          <div className="platform-bars">
            {[
              ["LinkedIn", 82, "42% of qualified leads"],
              ["Email", 68, "Strongest conversion rate"],
              ["Meta Ads", 57, "Creative fatigue detected"],
              ["Google Analytics", 46, "Measurement source"],
            ].map(([name, width, note]) => (
              <div key={String(name)}>
                <span>
                  <strong>{name}</strong>
                  <small>{note}</small>
                </span>
                <div>
                  <i style={{ width: `${width}%` }} />
                </div>
                <em>{width}</em>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">Learning preferences</span>
              <h2>What GrowthOS has inferred</h2>
            </div>
            <button className="button secondary">
              <Pencil /> Edit
            </button>
          </div>
          <div className="learning-list">
            {state.learning.map((item) => (
              <div key={item.id}>
                <span
                  className={item.explicit ? "explicit-pref" : "inferred-pref"}
                >
                  {item.explicit ? <ShieldCheck /> : <Sparkles />}
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.value}</small>
                </span>
                <Badge>
                  {item.explicit ? "Explicit" : `${item.evidenceCount} signals`}
                </Badge>
              </div>
            ))}
          </div>
          <small className="security-note">
            <ShieldCheck /> Inferred preferences never overwrite explicit Brand
            Kit settings.
          </small>
        </section>
      </div>
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
  const allItems: Array<readonly [string, string, string]> = [];
  for (const section of navigation)
    for (const item of section.items) allItems.push(item);
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
