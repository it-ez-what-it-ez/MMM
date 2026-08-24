"use client";

import { useState } from "react";
import { ArrowRight, Check, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { getAppOrigin } from "@/lib/supabase/config";

export function AuthScreen({ errorMessage }: { errorMessage?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState(errorMessage ?? "");

  async function signInWithGoogle() {
    setError("");
    const { error: authError } =
      await getBrowserSupabase().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${getAppOrigin()}/auth/callback` },
      });
    if (authError) setError(authError.message);
  }

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setStatus("sending");
    const { error: authError } = await getBrowserSupabase().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${getAppOrigin()}/auth/callback`,
        shouldCreateUser: false,
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
          <p className="kicker">Invite-only design partner beta</p>
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
          <h2>Sign in to your workspace</h2>
          <p className="muted">
            You need an invitation from GrowthOS or your workspace owner.
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
          >
            <span className="google-g">G</span> Continue with Google
          </button>
          <div className="or">
            <span />
            or
            <span />
          </div>
          {status === "sent" ? (
            <div className="magic-sent">
              <Mail size={22} />
              <strong>Check your inbox</strong>
              <p>We sent a secure sign-in link to {email}.</p>
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
                disabled={status === "sending"}
              >
                {status === "sending" ? (
                  "Sending…"
                ) : (
                  <>
                    Email me a sign-in link <ArrowRight size={17} />
                  </>
                )}
              </button>
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
