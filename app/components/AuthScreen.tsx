"use client";

import { useState } from "react";
import { ArrowRight, Check, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { getAppOrigin } from "@/lib/supabase/config";
import type { SupabaseAuthReadiness } from "@/lib/supabase/auth-readiness";

export function AuthScreen({
  authReadiness,
  errorMessage,
}: {
  authReadiness: SupabaseAuthReadiness;
  errorMessage?: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [googleStatus, setGoogleStatus] = useState<"idle" | "opening">("idle");
  const [error, setError] = useState(errorMessage ?? "");

  async function signInWithGoogle() {
    if (!authReadiness.googleEnabled) {
      setError("Google sign-in is not enabled for this GrowthOS environment yet.");
      return;
    }
    setError("");
    setGoogleStatus("opening");
    try {
      const { data, error: authError } =
        await getBrowserSupabase().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${getAppOrigin()}/auth/callback?next=/app`,
          skipBrowserRedirect: true,
        },
      });
      if (authError) throw authError;
      if (!data.url) throw new Error("Google did not return a secure sign-in URL.");
      window.location.assign(data.url);
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "Google sign-in could not be started.",
      );
      setGoogleStatus("idle");
    }
  }

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setStatus("sending");
    const { error: authError } = await getBrowserSupabase().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${getAppOrigin()}/auth/callback?next=/app`,
        shouldCreateUser: true,
      },
    });
    if (authError) {
      setError(authError.message);
      setStatus("idle");
      return;
    }
    setStatus("sent");
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <a
          className="wordmark wordmark-light"
          href="/"
          aria-label="GrowthOS home"
        >
          <span>G</span>GrowthOS
        </a>
        <div className="auth-copy">
          <p className="kicker">GrowthOS early access</p>
          <h1>From campaign idea to real delivery, in one calm workflow.</h1>
          <p>
            Choose a professionally designed template or let AI build a draft.
            Review the exact creative, account, audience, budget, destination,
            and schedule before anything goes live.
          </p>
          <ul>
            <li>
              <Check size={18} /> Your real products and brand assets
            </li>
            <li>
              <Check size={18} /> Paid campaigns created paused first
            </li>
            <li>
              <Check size={18} /> No simulated connections or silent AI
              fallbacks
            </li>
          </ul>
        </div>
        <div className="auth-proof">
          <ShieldCheck size={18} /> Provider passwords stay with the provider.
          GrowthOS uses approved OAuth access.
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="icon-tile">
            <Sparkles size={22} />
          </div>
          <p className="kicker">Welcome to GrowthOS</p>
          <h2>Create your account or sign in</h2>
          <p className="muted">
            Start with Google or a secure email link. New accounts continue
            directly into workspace setup.
          </p>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          <button
            className="button google-button"
            onClick={signInWithGoogle}
            type="button"
            disabled={!authReadiness.googleEnabled || googleStatus === "opening"}
          >
            <span className="google-g">G</span>{" "}
            {googleStatus === "opening"
              ? "Opening Google…"
              : authReadiness.googleEnabled
                ? "Continue with Google"
                : "Google sign-in unavailable"}
          </button>
          {!authReadiness.googleEnabled && (
            <div className="notice info" role="status">
              <ShieldCheck size={18} />
              <div>
                <strong>Google sign-in is awaiting provider setup</strong>
                <p>
                  GrowthOS will enable this automatically after the real Google
                  OAuth client passes the Supabase readiness check.
                </p>
              </div>
            </div>
          )}
          <div className="or">
            <span />
            or
            <span />
          </div>
          {status === "sent" ? (
            <div className="magic-sent">
              <Mail size={22} />
              <strong>Check your inbox</strong>
              <p>
                We sent a secure link to {email}. It will create your account
                if this is your first time using GrowthOS.
              </p>
            </div>
          ) : (
            <form onSubmit={sendMagicLink} className="stack">
              <label>
                Email address
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </label>
              <button
                className="button primary"
                type="submit"
                disabled={status === "sending" || !authReadiness.emailEnabled}
              >
                {status === "sending" ? (
                  "Sending…"
                ) : (
                  <>
                    Continue with email <ArrowRight size={17} />
                  </>
                )}
              </button>
              {!authReadiness.emailEnabled && (
                <p className="fine-print" role="status">
                  Email sign-in is not enabled for this environment.
                </p>
              )}
            </form>
          )}
          <p className="fine-print">
            By continuing, you agree to the GrowthOS <a href="/terms">Terms</a>{" "}
            and <a href="/privacy">Privacy Policy</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
