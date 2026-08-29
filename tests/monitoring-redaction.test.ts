import { describe, expect, it } from "vitest";

import { redactMonitoringEvent } from "@/lib/monitoring/redact";

describe("monitoring redaction", () => {
  it("removes customer content, credentials, recipient identity, and URL queries", () => {
    const event = redactMonitoringEvent({
      user: {
        id: "user-1",
        email: "customer@example.com",
        ip_address: "1.2.3.4",
      },
      request: {
        method: "POST",
        url: "https://growthos.example/api/callback?token=secret",
        data: { accessToken: "secret", body: "campaign copy" },
        headers: { authorization: "Bearer secret" },
      },
      breadcrumbs: [
        {
          category: "fetch",
          message: "Provider request failed",
          data: { phone: "+14165551234", apiKey: "secret" },
        },
      ],
      extra: { emailBody: "private content" },
      contexts: {
        runtime: { name: "cloudflare" },
        campaign: { copy: "private" },
      },
    });

    expect(event.user).toEqual({ id: "user-1" });
    expect(event.request).toEqual({
      method: "POST",
      url: "https://growthos.example/api/callback",
    });
    expect(event.breadcrumbs?.[0]).not.toHaveProperty("data");
    expect(event).not.toHaveProperty("extra");
    expect(event.contexts).toEqual({ runtime: { name: "cloudflare" } });
  });
});
