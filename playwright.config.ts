import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure", screenshot: "only-on-failure", storageState: process.env.PLAYWRIGHT_AUTH_STORAGE || undefined },
});
