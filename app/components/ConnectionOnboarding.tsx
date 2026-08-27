"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  RefreshCw,
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

const connectionSections: Array<{
  title: string;
  detail: string;
  providers: ProviderKey[];
}> = [
  {
    title: "Advertising",
    detail: "Create provider resources paused, verify them, then launch only after final confirmation.",
    providers: [
      "meta_business",
      "google_ads",
      "tiktok_ads",
      "reddit_ads",
      "chatgpt_ads",
    ],
  },
  {
    title: "Organic social & measurement",
    detail: "Publish through approved business profiles and keep analytics source labels intact.",
    providers: ["tiktok_organic", "linkedin_pages", "ga4"],
  },
  {
    title: "Email & SMS",
    detail: "Verify sender identity, consent, compliance, and delivery callbacks before sending.",
    providers: ["sendgrid_email", "twilio_messaging"],
  },
];

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
  const setupRows = providerOnboardingOrder.map((provider) => ({
    provider,
    setup: setupForProvider(provider, props),
  }));
  const readyCount = setupRows.filter((row) => row.setup.status === "ready").length;
  const availableCount = setupRows.filter(
    (row) => row.setup.status !== "unavailable",
  ).length;
  const next = setupRows.find(
    (row) => row.setup.status !== "ready" && row.setup.status !== "unavailable",
  );
  return (
    <>
      <a className="back-link" href="/app/manage">
        <ArrowLeft size={17} /> Manage
      </a>
      <header className="page-header connection-page-header">
        <div>
          <h1>Channel setup</h1>
          <p>
            Connect each customer-owned account, choose the exact destination,
            and pass real readiness checks before it appears in a campaign.
          </p>
        </div>
        {next && (
          <a
            className="button primary"
            href={`/app/manage/connections/${next.provider}`}
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
      <section className="setup-overview-card">
        <div>
          <span className="setup-overview-icon">
            <ShieldCheck size={22} />
          </span>
          <div>
            <b>{readyCount} channels ready</b>
            <p>
              {availableCount
                ? `${availableCount} provider${availableCount === 1 ? " is" : "s are"} currently approved for customer setup in this environment.`
                : "No provider has passed the GrowthOS platform gate in this environment yet."}
            </p>
          </div>
        </div>
        <div className="setup-progress" aria-label={`${readyCount} of ${availableCount} available providers ready`}>
          <span style={{ width: `${availableCount ? (readyCount / availableCount) * 100 : 0}%` }} />
        </div>
      </section>
      <div className="setup-flow-strip" aria-label="Connection setup stages">
        {[
          ["1", "Prepare", "Know what the customer needs"],
          ["2", "Authorize", "Sign in on the provider"],
          ["3", "Choose", "Select accounts and identities"],
          ["4", "Verify", "Prove delivery readiness"],
        ].map(([number, label, detail]) => (
          <div key={number}>
            <b>{number}</b>
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
          </div>
        ))}
      </div>
      <div className="connection-sections">
        {connectionSections.map((section) => (
          <section key={section.title}>
            <header>
              <h2>{section.title}</h2>
              <p>{section.detail}</p>
            </header>
            <div className="connection-provider-list">
              {section.providers.map((provider) => {
                const definition = providerOnboarding[provider];
                const setup = setupForProvider(provider, props);
                const selected = props.accounts.filter(
                  (account) =>
                    account.provider_key === provider && account.selected,
                );
                return (
                  <a
                    href={`/app/manage/connections/${provider}`}
                    className="connection-provider-row"
                    key={provider}
                  >
                    <ProviderMark provider={provider} />
                    <div className="connection-provider-copy">
                      <div>
                        <h3>{providerCapabilities[provider].label}</h3>
                        <SetupStatus provider={provider} setup={setup} />
                      </div>
                      <p>{definition.summary}</p>
                      {selected.length > 0 && (
                        <small>
                          <Check size={13} /> {selected.map((account) => account.name).join(", ")}
                        </small>
                      )}
                    </div>
                    <ArrowRight size={18} />
                  </a>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <div className="notice info connection-safety-note">
        <LockKeyhole size={18} />
        <div>
          <strong>Customers always sign in with the provider</strong>
          <p>
            GrowthOS never asks for a Meta, Google, TikTok, Reddit, or LinkedIn
            password. API credentials used by ChatGPT Ads, SendGrid, and the
            current Twilio beta are encrypted server-side and never returned.
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
      window.location.assign(`/app/manage/connections/${provider}`);
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
      window.location.assign(`/app/manage/connections/${provider}`);
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
      window.location.assign("/app/manage/connections");
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
      <a className="back-link" href="/app/manage/connections">
        <ArrowLeft size={17} /> Channel setup
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
