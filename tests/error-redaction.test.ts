import { describe, expect, it } from "vitest";

import { safeOperationalErrorMessage } from "@/lib/v1/errors";

describe("operational error messages", () => {
  it("keeps useful provider diagnostics", () => {
    expect(
      safeOperationalErrorMessage(
        new Error("The selected ad account has no active billing profile."),
      ),
    ).toBe("The selected ad account has no active billing profile.");
  });

  it("redacts common credential forms and database URLs", () => {
    const message = safeOperationalErrorMessage(
      new Error(
        "Bearer top.secret.token password=hunter2 postgresql://user:pass@db.example/db access_token=abc123",
      ),
    );
    expect(message).not.toContain("top.secret.token");
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("user:pass");
    expect(message).not.toContain("abc123");
    expect(message).toContain("[redacted]");
  });
});
