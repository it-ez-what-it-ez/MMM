import { expect, test } from "@playwright/test";

test("adds Google Ads through the mock integration action", async ({ page }) => {
  const response = await page.request.post("/api/action", { data: { type: "connectIntegration", definitionId: "int-google-ads", accountName: "Northstar Google Ads" } });
  expect(response.ok()).toBeTruthy();
  await page.goto("/app/integrations");
  await expect(page.getByText("Integrations", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Google Ads", { exact: true }).first()).toBeVisible();
});

test("creates a coordinated campaign from a natural-language objective", async ({ page }) => {
  const response = await page.request.post("/api/action", { data: { type: "createCampaign", prompt: "Launch the collaboration analytics feature and generate qualified demo bookings", channels: ["LinkedIn", "Email", "Meta Ads", "Google Ads"] } });
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  await page.goto(`/app/campaigns/${result.data.campaignId}`);
  await expect(page.getByText("Campaign workspace")).toBeVisible();
  await expect(page.getByText("Content in motion")).toBeVisible();
});

test("approves content with a reviewer identity", async ({ page }) => {
  await page.request.post("/api/identity", { data: { userId: "user-reviewer" } });
  const state = await (await page.request.get("/api/state")).json();
  const pending = state.approvals.find((item: { state: string }) => item.state === "PENDING");
  expect(pending).toBeTruthy();
  const response = await page.request.post("/api/action", { data: { type: "decideApproval", approvalId: pending.id, decision: "APPROVED", comment: "Ready to publish" } });
  expect(response.ok()).toBeTruthy();
  await page.goto("/app/approvals");
  await expect(page.getByText("Approvals", { exact: true }).first()).toBeVisible();
});

test("publishes approved content idempotently", async ({ page }) => {
  await page.request.post("/api/identity", { data: { userId: "user-owner" } });
  const first = await page.request.post("/api/action", { data: { type: "publishContent", contentId: "content-3", confirmed: true } });
  const second = await page.request.post("/api/action", { data: { type: "publishContent", contentId: "content-3", confirmed: true } });
  expect(first.ok()).toBeTruthy(); expect(second.ok()).toBeTruthy();
  expect((await first.json()).data.externalId).toBe((await second.json()).data.externalId);
});

test("creates paid campaigns in paused state", async ({ page }) => {
  const response = await page.request.post("/api/action", { data: { type: "createPaidAd", name: "E2E Activation Campaign", platform: "Meta Ads", objective: "Leads", budget: 2500, headline: "Find your next growth signal", body: "Turn customer behavior into a practical next move." } });
  expect(response.ok()).toBeTruthy();
  const state = await (await page.request.get("/api/state")).json();
  expect(state.paidAds.find((item: { name: string }) => item.name === "E2E Activation Campaign").state).toBe("PAUSED");
});

test("shows resulting cross-channel insights and recommendations", async ({ page }) => {
  await page.goto("/app/insights");
  await expect(page.getByText("Insights", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("AI recommendations")).toBeVisible();
  await expect(page.getByText("Reconnect Klaviyo before the next send")).toBeVisible();
});
