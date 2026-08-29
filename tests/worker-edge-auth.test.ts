import { describe, expect, it } from "vitest";
import { constantTimeEqual } from "../supabase/functions/_shared/forward-worker";

describe("scheduled worker authentication", () => {
  it("accepts only an exact secret match", () => {
    const secret = "a".repeat(64);
    expect(constantTimeEqual(secret, secret)).toBe(true);
    expect(constantTimeEqual(secret, `${secret.slice(0, -1)}b`)).toBe(false);
    expect(constantTimeEqual(secret, secret.slice(0, -1))).toBe(false);
    expect(constantTimeEqual("", secret)).toBe(false);
  });
});
