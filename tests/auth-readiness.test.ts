import { describe, expect, it } from "vitest";
import { parseSupabaseAuthSettings } from "@/lib/supabase/auth-readiness";

describe("Supabase authentication readiness", () => {
  it("enables only providers confirmed by Supabase", () => {
    expect(
      parseSupabaseAuthSettings({
        external: { email: true, google: false },
      }),
    ).toEqual({ emailEnabled: true, googleEnabled: false, checked: true });

    expect(
      parseSupabaseAuthSettings({
        external: { email: true, google: true },
      }),
    ).toEqual({ emailEnabled: true, googleEnabled: true, checked: true });
  });

  it("fails closed when the provider settings response is invalid", () => {
    expect(parseSupabaseAuthSettings(null)).toEqual({
      emailEnabled: false,
      googleEnabled: false,
      checked: false,
    });
    expect(parseSupabaseAuthSettings({ external: null })).toEqual({
      emailEnabled: false,
      googleEnabled: false,
      checked: false,
    });
  });
});
