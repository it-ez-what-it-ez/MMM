"use client";

import * as Sentry from "@sentry/browser";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="onboarding-page">
          <section className="onboarding-card">
            <p className="kicker">GrowthOS</p>
            <h1>Something went wrong</h1>
            <p className="muted">
              Your work is still saved. Try this page again; if the problem
              continues, contact GrowthOS support and include the time it
              happened.
            </p>
            <button className="primary-button" type="button" onClick={reset}>
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
