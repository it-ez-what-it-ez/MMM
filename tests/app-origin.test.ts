import { describe, expect, it } from "vitest";
import { resolveAppOrigin } from "@/lib/supabase/config";

describe("application origin", () => {
  it("uses the explicit application origin first and normalizes paths", () => {
    expect(
      resolveAppOrigin({
        APP_ORIGIN: "https://app.example.com/ignored/path",
        NEXT_PUBLIC_APP_ORIGIN: "https://public.example.com",
        APP_BASE_URL: "https://legacy.example.com",
      }),
    ).toBe("https://app.example.com");
  });

  it("supports the hosted APP_BASE_URL compatibility variable", () => {
    expect(
      resolveAppOrigin({ APP_BASE_URL: "https://growth.example.com/" }),
    ).toBe("https://growth.example.com");
  });

  it("refuses an insecure production callback origin", () => {
    expect(() =>
      resolveAppOrigin({
        APP_ENV: "production",
        APP_ORIGIN: "http://growth.example.com",
      }),
    ).toThrow("must use HTTPS");
  });
});
