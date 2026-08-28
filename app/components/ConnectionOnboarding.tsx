"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Database,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  LockKeyhole,
  Megaphone,
  MessageSquareText,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import {
  channelLabels,
  providerCapabilities,
  type ProviderKey,
} from "@/lib/v1/domain";
import {
  deriveProviderSetup,
  providerOnboarding,
  providerOnboardingOrder,
} from "@/lib/v1/connection-onboarding";
import {
  integrationCatalog,
  integrationCategories,
  isIntegrationCategory,
  providerPrimaryCategory,
  type IntegrationCategoryKey,
} from "@/lib/v1/integration-catalog";

export type ConnectionWorkspace = {
  id: string;
  name: string;
  currency: "USD" | "CAD";
};

export type ConnectionRow = {
  id: string;
  provider_key: ProviderKey;
  status: string;
  health_checked_at: string | null;
  health_error: Record<string, unknown> | null;
  granted_scopes: string[];
  token_expires_at: string | null;
};

export type ConnectionAccountRow = {
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

export type ReadinessRow = {
  provider: ProviderKey;
  ready: boolean;
  reason: string | null;
};

type CommonProps = {
  workspace: ConnectionWorkspace;
  connections: ConnectionRow[];
  accounts: ConnectionAccountRow[];
  readiness: ReadinessRow[];
  messagingIdentityComplete: boolean;
  smsRequiresUsA2p: boolean;
  canManage: boolean;
  connectionNotice?: { type: "success" | "error"; message: string };
  initialCategory?: IntegrationCategoryKey;
};

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

function setupForProvider(
  provider: ProviderKey,
  props: Pick<
    CommonProps,
    | "connections"
    | "accounts"
    | "readiness"
    | "messagingIdentityComplete"
    | "smsRequiresUsA2p"
  >,
) {
  const connection = props.connections.find(
    (item) => item.provider_key === provider,
  );
  const platform = props.readiness.find((item) => item.provider === provider);
  return deriveProviderSetup({
    provider,
    platformReady: Boolean(platform?.ready),
    platformReason: platform?.reason,
    connection: connection
      ? {
          status: connection.status,
          healthError: connection.health_error,
        }
      : null,
    accounts: props.accounts
      .filter((account) => account.provider_key === provider)
      .map((account) => ({
        accountType: account.account_type,
        selected: account.selected,
        billingStatus: account.billing_status,
        capabilities: account.capabilities,
      })),
    messagingIdentityComplete: props.messagingIdentityComplete,
    smsRequiresUsA2p: props.smsRequiresUsA2p,
  });
}

const categoryIcons = {
  data: Database,
  advertising: Megaphone,
  messaging: MessageSquareText,
  social: Share2,
} satisfies Record<IntegrationCategoryKey, typeof Database>;

function ProviderMark({ provider }: { provider: ProviderKey }) {
  const label = providerCapabilities[provider].label;
  return (
    <span className={`provider-logo ${provider}`} aria-hidden="true">
      {label.slice(0, 1)}
    </span>
  );
}

function SetupStatus({ provider, setup }: { provider: ProviderKey; setup: ReturnType<typeof setupForProvider> }) {
  return (
    <span className={`setup-status ${setup.status}`}>
      <span />
      {setup.label}
      <span className="sr-only"> for {providerCapabilities[provider].label}</span>
    </span>
  );
}

export function ConnectionsSetupCenter(props: CommonProps) {
  const activeCategory = isIntegrationCategory(props.initialCategory)
    ? props.initialCategory
    : "data";
  const [query, setQuery] = useState("");
  const setupRows = providerOnboardingOrder.map((provider) => ({
    provider,
    setup: setupForProvider(provider, props),
  }));
  const connectedProviders = new Set(
    props.connections
      .filter((connection) =>
        ["connected", "degraded"].includes(connection.status),
      )
      .map((connection) => connection.provider_key),
  );
  const category = integrationCategories.find(
    (item) => item.key === activeCategory,
  )!;
  const categoryEntries = integrationCatalog.filter(
    (entry) =>
      entry.category === activeCategory &&
      [entry.label, entry.description, ...entry.capabilities]
        .join(" ")
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const liveEntries = categoryEntries.filter(
    (entry) => entry.availability !== "planned",
  );
  const plannedEntries = categoryEntries.filter(
    (entry) => entry.availability === "planned",
  );
  const next = liveEntries
    .filter((entry) => entry.provider)
    .map((entry) => ({
      entry,
      setup: setupForProvider(entry.provider!, props),
    }))
    .find(
      (row) =>
        row.setup.status !== "ready" && row.setup.status !== "unavailable",
    );
  const availableProviderCount = setupRows.filter(
    (row) => row.setup.status !== "unavailable",
  ).length;
  return (
    <>
      <header className="page-header connection-page-header">
        <div>
          <h1>Integrations</h1>
          <p>
            Connect the data, delivery, and publishing systems your business
            already owns. Nothing is marked connected until it passes a real
            provider check.
          </p>
        </div>
        {next && (
          <a
            className="button primary"
            href={`/app/integrations/${next.entry.provider}`}
          >
            Continue setup <ArrowRight size={17} />
          </a>
        )}
      </header>
      {props.connectionNotice && (
        <div className={`notice ${props.connectionNotice.type === "error" ? "error" : "info"}`}>
          {props.connectionNotice.type === "error" ? <CircleAlert size={18} /> : <Check size={18} />}
          <div>
            <strong>{props.connectionNotice.type === "error" ? "Authorization did not finish" : "Authorization complete"}</strong>
            <p>{props.connectionNotice.message}</p>
          </div>
        </div>
      )}
      <section className="integration-overview" aria-label="Integration summary">
        <div><b>{connectedProviders.size}</b><span>Connected</span></div>
        <div><b>{availableProviderCount + 1}</b><span>Available now</span></div>
        <div><b>{integrationCatalog.filter((entry) => entry.availability === "planned").length}</b><span>On the roadmap</span></div>
      </section>
      <nav className="integration-category-tabs" aria-label="Integration categories">
        {integrationCategories.map((item) => {
          const Icon = categoryIcons[item.key];
          const count = integrationCatalog.filter(
            (entry) => entry.category === item.key,
          ).length;
          return (
            <a
              key={item.key}
              className={item.key === activeCategory ? "active" : ""}
              href={`/app/integrations/${item.key}`}
              aria-current={item.key === activeCategory ? "page" : undefined}
            >
              <Icon size={18} />
              <span><b>{item.label}</b><small>{count} integrations</small></span>
            </a>
          );
        })}
      </nav>
      <section className="integration-catalog-section">
        <header className="integration-catalog-header">
          <div>
            <h2>{category.label}</h2>
            <p>{category.description}</p>
          </div>
          <label className="integration-search">
            <Search size={17} />
            <span className="sr-only">Search {category.noun}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${category.noun}`}
            />
          </label>
        </header>
        <div className="integration-catalog-list">
          {liveEntries.map((entry) => {
            const provider = entry.provider;
            const setup = provider ? setupForProvider(provider, props) : null;
            const selected = provider
              ? props.accounts.filter(
                  (account) =>
                    account.provider_key === provider && account.selected,
                )
              : [];
            const href = provider
              ? `/app/integrations/${provider}`
              : entry.nativeHref!;
            return (
              <a className="integration-catalog-row" href={href} key={entry.id}>
                {provider ? (
                  <ProviderMark provider={provider} />
                ) : (
                  <span className="provider-logo native" aria-hidden="true">G</span>
                )}
                <div className="integration-catalog-copy">
                  <div>
                    <h3>{entry.label}</h3>
                    {provider && setup ? (
                      <SetupStatus provider={provider} setup={setup} />
                    ) : (
                      <span className="setup-status ready"><span />Available</span>
                    )}
                  </div>
                  <p>{entry.description}</p>
                  <div className="integration-capabilities">
                    {entry.capabilities.map((capability) => (
                      <span key={capability}>{capability}</span>
                    ))}
                  </div>
                  {selected.length > 0 && (
                    <small><Check size={13} /> {selected.map((account) => account.name).join(", ")}</small>
                  )}
                </div>
                <span className="integration-row-action">
                  {provider && setup?.status === "ready"
                    ? "Manage"
                    : provider && setup?.status === "unavailable"
                      ? "View requirements"
                      : entry.availability === "native"
                        ? "Open"
                        : "Connect"}
                  <ArrowRight size={16} />
                </span>
              </a>
            );
          })}
          {!categoryEntries.length && (
            <div className="integration-empty">
              <Search size={20} />
              <div><strong>No matching integrations</strong><p>Try a provider name or capability such as audiences, reporting, email, or SMS.</p></div>
            </div>
          )}
        </div>
        {plannedEntries.length > 0 && (
          <div className="planned-integrations">
            <div className="planned-integrations-heading">
              <div><h3>On the roadmap</h3><p>These are visible for planning, but cannot be connected yet.</p></div>
              <span>{plannedEntries.length}</span>
            </div>
            <div className="planned-integration-grid">
              {plannedEntries.map((entry) => (
                <article key={entry.id}>
                  <div><span className="provider-logo planned" aria-hidden="true">{entry.label.slice(0, 1)}</span><span className="planned-label">Planned</span></div>
                  <h3>{entry.label}</h3>
                  <p>{entry.description}</p>
                  <div className="integration-capabilities">
                    {entry.capabilities.map((capability) => <span key={capability}>{capability}</span>)}
                  </div>
                  <small>{entry.note}</small>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
      <div className="notice info connection-safety-note">
        <LockKeyhole size={18} />
        <div>
          <strong>Customers always sign in with the provider</strong>
          <p>
            GrowthOS never asks for a provider password. OAuth happens on the
            provider’s domain; restricted credentials used by supported
            key-based integrations are encrypted server-side and never returned.
          </p>
        </div>
      </div>
    </>
  );
}

function StageRail({ stages }: { stages: ReturnType<typeof setupForProvider>["stages"] }) {
  return (
    <ol className="provider-stage-rail" aria-label="Provider setup progress">
      {stages.map((stage, index) => (
        <li className={stage.state} key={stage.key} aria-current={stage.state === "current" ? "step" : undefined}>
          <span>{stage.state === "complete" ? <Check size={15} /> : index + 1}</span>
          <div>
            <b>{stage.label}</b>
            <small>
              {stage.state === "complete"
                ? "Complete"
                : stage.state === "current"
                  ? "Do this now"
                  : stage.state === "blocked"
                    ? "Platform gate"
                    : "Next"}
            </small>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ProviderRequirements({ provider }: { provider: ProviderKey }) {
  const definition = providerOnboarding[provider];
  return (
    <section className="setup-section">
      <p className="kicker">Before you connect</p>
      <h2>Have these ready</h2>
      <p className="setup-section-intro">
        The customer owns {definition.customerOwns.toLowerCase()}. GrowthOS
        supplies the approved platform application and secure connection flow.
      </p>
      <ul className="setup-check-list">
        {definition.requirements.map((requirement) => (
          <li key={requirement}>
            <CheckCircle2 size={18} />
            <span>{requirement}</span>
          </li>
        ))}
      </ul>
      <a className="setup-doc-link" href={definition.helpUrl} target="_blank" rel="noreferrer">
        {definition.helpLabel} <ExternalLink size={14} />
      </a>
    </section>
  );
}

function PermissionSummary({ provider }: { provider: ProviderKey }) {
  const definition = providerOnboarding[provider];
  return (
    <aside className="setup-side-card">
      <ShieldCheck size={20} />
      <h2>What you are granting</h2>
      <ul>
        {definition.permissions.map((permission) => (
          <li key={permission}>{permission}</li>
        ))}
      </ul>
      <div>
        <LockKeyhole size={16} />
        <p>
          GrowthOS stores tokens encrypted, uses the minimum reviewed scopes,
          and records every consequential operation.
        </p>
      </div>
    </aside>
  );
}

function OAuthConnectAction({
  workspaceId,
  provider,
  enabled,
  canManage,
}: {
  workspaceId: string;
  provider: ProviderKey;
  enabled: boolean;
  canManage: boolean;
}) {
  return (
    <div className="setup-primary-action">
      <div>
        <h3>Continue on {providerCapabilities[provider].label}</h3>
        <p>
          You will sign in on the provider’s secure page, review permissions,
          and return here to choose destinations.
        </p>
      </div>
      {enabled && canManage ? (
        <a
          className="button primary"
          href={`/api/v1/oauth/${provider}/start?workspaceId=${workspaceId}`}
        >
          <Link2 size={17} /> Connect {providerCapabilities[provider].label}
        </a>
      ) : (
        <button className="button primary" disabled>
          <Link2 size={17} /> Connect {providerCapabilities[provider].label}
        </button>
      )}
    </div>
  );
}

export function ProviderSetupPage({
  provider,
  onRefresh,
  ...props
}: CommonProps & {
  provider: ProviderKey;
  onRefresh: () => Promise<void>;
}) {
  const definition = providerOnboarding[provider];
  const capability = providerCapabilities[provider];
  const connection = props.connections.find(
    (item) => item.provider_key === provider,
  );
  const accounts = props.accounts.filter(
    (account) => account.provider_key === provider,
  );
  const readiness = props.readiness.find((item) => item.provider === provider);
  const setup = setupForProvider(provider, props);
  const [selected, setSelected] = useState(
    accounts.filter((account) => account.selected).map((account) => account.id),
  );
  const [metaPageAccountId, setMetaPageAccountId] = useState(() => {
    const ad = accounts.find(
      (account) =>
        account.account_type === "ad_account" &&
        account.selected &&
        typeof account.capabilities.pageExternalId === "string",
    );
    return (
      accounts.find(
        (account) =>
          account.account_type === "facebook_page" &&
          account.external_id === ad?.capabilities.pageExternalId,
      )?.id ?? ""
    );
  });
  const [apiKey, setApiKey] = useState("");
  const [twilio, setTwilio] = useState({
    accountSid: "",
    apiKeySid: "",
    apiKeySecret: "",
    authToken: "",
    messagingServiceSid: "",
    configureInboundWebhook: true,
  });
  const [sendgrid, setSendgrid] = useState({
    apiKey: "",
    fromName: props.workspace.name,
    fromAddress: "",
    replyToAddress: "",
    unsubscribeGroupId: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selectedAccounts = useMemo(
    () => accounts.filter((account) => selected.includes(account.id)),
    [accounts, selected],
  );

  async function saveAccounts() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await authenticatedFetch("/api/v1/provider-accounts", {
        method: "PATCH",
        body: JSON.stringify({
          workspaceId: props.workspace.id,
          providerKey: provider,
          selectedAccountIds: selected,
          metaPageAccountId:
            provider === "meta_business" ? metaPageAccountId || null : null,
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        errors?: Array<{ message: string }>;
      };
      if (!result.ok)
        throw new Error(result.errors?.[0]?.message ?? "Account selection failed.");
      setMessage("Destinations saved. Run the live verification to finish setup.");
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Account selection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function connectChatGPT() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await authenticatedFetch("/api/v1/connections/chatgpt-ads", {
        method: "POST",
        body: JSON.stringify({ workspaceId: props.workspace.id, apiKey }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        errors?: Array<{ message: string }>;
      };
      if (!result.ok)
        throw new Error(result.errors?.[0]?.message ?? "ChatGPT Ads connection failed.");
      setApiKey("");
      await onRefresh();
      window.location.assign(`/app/integrations/${provider}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ChatGPT Ads connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function connectMessagingProvider() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const isTwilio = provider === "twilio_messaging";
      const response = await authenticatedFetch(
        isTwilio ? "/api/v1/connections/twilio" : "/api/v1/connections/sendgrid",
        {
          method: "POST",
          body: JSON.stringify(
            isTwilio
              ? { workspaceId: props.workspace.id, ...twilio }
              : {
                  workspaceId: props.workspace.id,
                  ...sendgrid,
                  replyToAddress: sendgrid.replyToAddress || null,
                  unsubscribeGroupId: Number(sendgrid.unsubscribeGroupId),
                },
          ),
        },
      );
      const result = (await response.json()) as {
        ok: boolean;
        errors?: Array<{ message: string }>;
      };
      if (!result.ok)
        throw new Error(
          result.errors?.map((entry) => entry.message).join(" · ") ??
            `${capability.label} connection failed.`,
        );
      await onRefresh();
      window.location.assign(`/app/integrations/${provider}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `${capability.label} connection failed.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function runHealthCheck() {
    if (!connection) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await authenticatedFetch(
        `/api/v1/connections/${connection.id}/health`,
        {
          method: "POST",
          body: JSON.stringify({ workspaceId: props.workspace.id }),
        },
      );
      const result = (await response.json()) as {
        ok: boolean;
        data?: { healthy: boolean; detail: string; warning?: string | null };
        errors?: Array<{ message: string }>;
      };
      if (!result.ok)
        throw new Error(result.errors?.[0]?.message ?? "Live verification failed.");
      setMessage(result.data?.detail ?? "Live verification completed.");
      if (result.data?.warning) setError(result.data.warning);
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Live verification failed.");
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!connection) return;
    if (
      !window.confirm(
        `Disconnect ${capability.label}? Existing provider resources will not be deleted.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch(
        `/api/v1/connections/${connection.id}`,
        {
          method: "DELETE",
          body: JSON.stringify({ workspaceId: props.workspace.id }),
        },
      );
      const result = (await response.json()) as {
        ok: boolean;
        errors?: Array<{ message: string }>;
      };
      if (!result.ok)
        throw new Error(result.errors?.[0]?.message ?? "Disconnect failed.");
      window.location.assign(
        `/app/integrations/${providerPrimaryCategory[provider]}`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Disconnect failed.");
      setBusy(false);
    }
  }

  const showCredentialForm =
    !connection &&
    ["chatgpt_ads", "twilio_messaging", "sendgrid_email"].includes(provider);
  const selectedAdAccount = selectedAccounts.some(
    (account) => account.account_type === "ad_account",
  );
  return (
    <>
      <a
        className="back-link"
        href={`/app/integrations/${providerPrimaryCategory[provider]}`}
      >
        <ArrowLeft size={17} /> Integrations
      </a>
      <header className="provider-setup-header">
        <div className="provider-setup-title">
          <ProviderMark provider={provider} />
          <div>
            <SetupStatus provider={provider} setup={setup} />
            <h1>{definition.setupTitle}</h1>
            <p>{definition.summary}</p>
          </div>
        </div>
        <div className="channel-chip-row">
          {capability.channels.map((channel) => (
            <span key={channel}>{channelLabels[channel]}</span>
          ))}
          {!capability.channels.length && <span>Read-only measurement</span>}
        </div>
      </header>
      <StageRail stages={setup.stages} />
      {props.connectionNotice && (
        <div className={`notice ${props.connectionNotice.type === "error" ? "error" : "info"}`}>
          {props.connectionNotice.type === "error" ? <CircleAlert size={18} /> : <Check size={18} />}
          <div>
            <strong>{props.connectionNotice.type === "error" ? "Authorization did not finish" : "Authorization complete"}</strong>
            <p>{props.connectionNotice.message}</p>
          </div>
        </div>
      )}
      {error && (
        <div className="notice error">
          <CircleAlert size={18} />
          <div><strong>Setup needs attention</strong><p>{error}</p></div>
        </div>
      )}
      {message && (
        <div className="notice info">
          <Check size={18} />
          <div><strong>Setup updated</strong><p>{message}</p></div>
        </div>
      )}
      {!props.canManage && (
        <div className="notice warning">
          <CircleAlert size={18} />
          <div>
            <strong>An owner or administrator must finish setup</strong>
            <p>You can review the requirements and current state, but cannot authorize or change provider accounts.</p>
          </div>
        </div>
      )}
      {!readiness?.ready && (
        <div className="notice warning platform-gate-notice">
          <ShieldCheck size={18} />
          <div>
            <strong>This channel is not available to customers yet</strong>
            <p>{readiness?.reason ?? "GrowthOS has not completed provider review and production acceptance."}</p>
            <small>No fake authorization or simulated connection is offered while this gate is closed.</small>
          </div>
        </div>
      )}
      <div className="provider-setup-layout">
        <div className="provider-setup-main">
          {!connection && <ProviderRequirements provider={provider} />}
          {!connection && definition.connectionMethod === "oauth" && (
            <OAuthConnectAction
              workspaceId={props.workspace.id}
              provider={provider}
              enabled={Boolean(readiness?.ready)}
              canManage={props.canManage}
            />
          )}
          {showCredentialForm && (
            <section className="setup-section credential-setup-section">
              <p className="kicker">Authorize</p>
              <h2>
                {provider === "twilio_messaging"
                  ? "Verify the customer-owned Messaging Service"
                  : provider === "sendgrid_email"
                    ? "Verify the customer-owned sender"
                    : "Verify the advertiser account"}
              </h2>
              <p className="setup-section-intro">
                Credentials are submitted once over TLS, encrypted with AES-GCM,
                and never returned to the browser.
              </p>
              {provider === "chatgpt_ads" && (
                <div className="credential-form">
                  <label>
                    Account-scoped Advertiser API key
                    <input
                      type="password"
                      autoComplete="off"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder="Paste the key from OpenAI Ads Manager"
                    />
                  </label>
                  <p><KeyRound size={15} /> The key is verified with the Advertiser API before it is stored.</p>
                  <button
                    className="button primary"
                    disabled={busy || !readiness?.ready || !props.canManage || apiKey.length < 20}
                    onClick={() => void connectChatGPT()}
                  >
                    {busy ? <Loader2 className="spin" size={17} /> : <ShieldCheck size={17} />}
                    Verify and connect
                  </button>
                </div>
              )}
              {provider === "twilio_messaging" && (
                <div className="credential-form form-grid">
                  <label>Account SID<input autoComplete="off" value={twilio.accountSid} onChange={(event) => setTwilio({ ...twilio, accountSid: event.target.value })} placeholder="AC…" /></label>
                  <label>Messaging Service SID<input autoComplete="off" value={twilio.messagingServiceSid} onChange={(event) => setTwilio({ ...twilio, messagingServiceSid: event.target.value })} placeholder="MG…" /></label>
                  <label>Restricted API Key SID<input autoComplete="off" value={twilio.apiKeySid} onChange={(event) => setTwilio({ ...twilio, apiKeySid: event.target.value })} placeholder="SK…" /></label>
                  <label>Restricted API Key secret<input type="password" autoComplete="new-password" value={twilio.apiKeySecret} onChange={(event) => setTwilio({ ...twilio, apiKeySecret: event.target.value })} /></label>
                  <label className="span-2">Auth Token <small>Used only to verify callbacks signed by Twilio.</small><input type="password" autoComplete="new-password" value={twilio.authToken} onChange={(event) => setTwilio({ ...twilio, authToken: event.target.value })} /></label>
                  <label className="span-2 inline-check"><input type="checkbox" checked={twilio.configureInboundWebhook} onChange={(event) => setTwilio({ ...twilio, configureInboundWebhook: event.target.checked })} />Configure the signed GrowthOS inbound STOP webhook on this Messaging Service.</label>
                  <div className="span-2 credential-help"><MessageSquareText size={16} /><p>Use a restricted key that can read the Messaging Service and compliance state and create messages. The Auth Token is not used to send.</p></div>
                  <button className="button primary span-2" disabled={busy || !readiness?.ready || !props.canManage} onClick={() => void connectMessagingProvider()}>
                    {busy ? <Loader2 className="spin" size={17} /> : <ShieldCheck size={17} />} Verify service and registration
                  </button>
                </div>
              )}
              {provider === "sendgrid_email" && (
                <div className="credential-form form-grid">
                  <label className="span-2">Restricted SendGrid API key<input type="password" autoComplete="new-password" value={sendgrid.apiKey} onChange={(event) => setSendgrid({ ...sendgrid, apiKey: event.target.value })} /></label>
                  <label>From name<input value={sendgrid.fromName} onChange={(event) => setSendgrid({ ...sendgrid, fromName: event.target.value })} /></label>
                  <label>Verified From address<input type="email" value={sendgrid.fromAddress} onChange={(event) => setSendgrid({ ...sendgrid, fromAddress: event.target.value })} /></label>
                  <label>Reply-to address<input type="email" value={sendgrid.replyToAddress} onChange={(event) => setSendgrid({ ...sendgrid, replyToAddress: event.target.value })} /></label>
                  <label>Unsubscribe group ID<input type="number" min="1" value={sendgrid.unsubscribeGroupId} onChange={(event) => setSendgrid({ ...sendgrid, unsubscribeGroupId: event.target.value })} /></label>
                  <div className="span-2 credential-help"><MessageSquareText size={16} /><p>GrowthOS verifies the exact sender and domain, validates the unsubscribe group, and creates a signed delivery Event Webhook.</p></div>
                  <button className="button primary span-2" disabled={busy || !readiness?.ready || !props.canManage} onClick={() => void connectMessagingProvider()}>
                    {busy ? <Loader2 className="spin" size={17} /> : <ShieldCheck size={17} />} Verify sender and connect
                  </button>
                </div>
              )}
            </section>
          )}
          {connection && (
            <>
              <section className="setup-section destination-setup-section">
                <p className="kicker">Choose destinations</p>
                <h2>{definition.destinationLabel}</h2>
                <p className="setup-section-intro">
                  Only selected destinations appear in campaign creation. GrowthOS
                  never chooses an account or visible identity on the customer’s behalf.
                </p>
                {provider === "meta_business" && selectedAdAccount && (
                  <label className="meta-identity-select">
                    Facebook Page identity for selected ad accounts
                    <select value={metaPageAccountId} onChange={(event) => setMetaPageAccountId(event.target.value)}>
                      <option value="">Choose the exact Page</option>
                      {accounts.filter((account) => account.account_type === "facebook_page").map((account) => (
                        <option key={account.id} value={account.id}>{account.name}</option>
                      ))}
                    </select>
                    <small>This is the Page people will see on the Meta ad.</small>
                  </label>
                )}
                <div className="destination-choice-list">
                  {accounts.map((account) => {
                    const ineligible = account.capabilities.manager === true;
                    return (
                      <label className={selected.includes(account.id) ? "selected" : ""} key={account.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(account.id)}
                          disabled={ineligible || !props.canManage}
                          onChange={() => setSelected((current) => current.includes(account.id) ? current.filter((id) => id !== account.id) : [...current, account.id])}
                        />
                        <span>
                          <strong>{account.name}</strong>
                          <small>
                            {account.account_type.replaceAll("_", " ")}
                            {account.currency ? ` · ${account.currency}` : ""}
                            {account.timezone ? ` · ${account.timezone}` : ""}
                          </small>
                        </span>
                        <span className={`destination-state ${ineligible ? "blocked" : account.selected ? "selected" : "available"}`}>
                          {ineligible ? "Manager only" : account.selected ? "Selected" : "Available"}
                        </span>
                      </label>
                    );
                  })}
                  {!accounts.length && (
                    <div className="destination-empty">
                      <CircleAlert size={20} />
                      <div><strong>No eligible destinations were discovered</strong><p>Check the customer’s provider role and account eligibility, then reconnect.</p></div>
                    </div>
                  )}
                </div>
                {accounts.length > 0 && (
                  <button className="button primary" disabled={busy || !props.canManage} onClick={() => void saveAccounts()}>
                    {busy ? <Loader2 className="spin" size={17} /> : <Check size={17} />} Save destinations
                  </button>
                )}
              </section>
              <section className="setup-section verification-section">
                <p className="kicker">Verify</p>
                <h2>Prove this channel is ready</h2>
                <p className="setup-section-intro">
                  A live check reads provider state now. It does not create a campaign,
                  publish content, or spend money.
                </p>
                <ul className="setup-check-list compact">
                  {definition.verificationChecks.map((check) => (
                    <li key={check}><ShieldCheck size={17} /><span>{check}</span></li>
                  ))}
                </ul>
                {setup.blockers.length > 0 && (
                  <div className="verification-blockers">
                    <CircleAlert size={18} />
                    <div><strong>Finish before using this channel</strong><ul>{setup.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div>
                  </div>
                )}
                {["twilio_messaging", "sendgrid_email"].includes(provider) && !props.messagingIdentityComplete && (
                  <a className="button secondary" href="/app/manage/contacts">Add legal sender & consent settings <ArrowRight size={16} /></a>
                )}
                {provider === "twilio_messaging" && (
                  <div className="webhook-callout">
                    <b>Inbound STOP webhook</b>
                    <code>{`${typeof window === "undefined" ? "" : window.location.origin}/api/v1/webhooks/twilio/${connection.id}`}</code>
                    <p>Add this as the Messaging Service inbound request URL. GrowthOS rejects invalid Twilio signatures.</p>
                  </div>
                )}
                <button className="button primary" disabled={busy || !selected.length || !props.canManage} onClick={() => void runHealthCheck()}>
                  {busy ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />} Run live verification
                </button>
                {connection.health_checked_at && (
                  <small className="last-checked">Last checked {new Date(connection.health_checked_at).toLocaleString()}</small>
                )}
              </section>
              <section className="disconnect-section">
                <div><h2>Disconnect {capability.label}</h2><p>Encrypted credentials are removed. Existing provider resources remain in the customer’s account.</p></div>
                <button className="button danger" disabled={busy || !props.canManage} onClick={() => void disconnect()}>Disconnect</button>
              </section>
            </>
          )}
        </div>
        {!connection && <PermissionSummary provider={provider} />}
        {connection && (
          <aside className="setup-side-card connection-summary-card">
            <ShieldCheck size={20} />
            <h2>Connection summary</h2>
            <dl>
              <div><dt>Status</dt><dd>{connection.status.replaceAll("_", " ")}</dd></div>
              <div><dt>Selected</dt><dd>{accounts.filter((account) => account.selected).length}</dd></div>
              <div><dt>Method</dt><dd>{definition.connectionMethod === "oauth" ? "Provider sign-in" : "Encrypted credentials"}</dd></div>
              {connection.token_expires_at && <div><dt>Token expiry</dt><dd>{new Date(connection.token_expires_at).toLocaleDateString()}</dd></div>}
            </dl>
            {connection.granted_scopes.length > 0 && (
              <details>
                <summary>Granted permissions</summary>
                <ul>{connection.granted_scopes.map((scope) => <li key={scope}>{scope}</li>)}</ul>
              </details>
            )}
          </aside>
        )}
      </div>
    </>
  );
}

export function isSetupProvider(value: string): value is ProviderKey {
  return Object.prototype.hasOwnProperty.call(providerOnboarding, value);
}
