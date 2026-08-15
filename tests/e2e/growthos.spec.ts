import { expect, test } from "@playwright/test";

test("adds Google Ads through the mock integration action", async ({
  page,
}) => {
  const response = await page.request.post("/api/action", {
    data: {
      type: "connectIntegration",
      definitionId: "int-google-ads",
      accountName: "Northstar Google Ads",
    },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/app/integrations");
  await expect(
    page.getByText("Integrations", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Google Ads", { exact: true }).first(),
  ).toBeVisible();
});

test("creates a coordinated campaign from a natural-language objective", async ({
  page,
}) => {
  const response = await page.request.post("/api/action", {
    data: {
      type: "createCampaign",
      prompt:
        "Launch the collaboration analytics feature and generate qualified demo bookings",
      channels: ["LinkedIn", "Email", "Meta Ads", "Google Ads"],
    },
  });
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  await page.goto(`/app/campaigns/${result.data.campaignId}`);
  await expect(page.getByText("Campaign workspace")).toBeVisible();
  await expect(page.getByText("Content in motion")).toBeVisible();
});

test("approves content with a reviewer identity", async ({ page }) => {
  await page.request.post("/api/identity", {
    data: { userId: "user-marketer" },
  });
  const campaignResponse = await page.request.post("/api/action", {
    data: {
      type: "createCampaign",
      prompt: "Create an approval workflow test campaign for qualified demos",
      channels: ["LinkedIn"],
    },
  });
  const campaignId = (await campaignResponse.json()).data.campaignId;
  const marketerState = await (await page.request.get("/api/state")).json();
  const draft = marketerState.content.find(
    (item: { campaignId: string }) => item.campaignId === campaignId,
  );
  await page.request.post("/api/action", {
    data: { type: "submitApproval", contentId: draft.id },
  });
  await page.request.post("/api/identity", {
    data: { userId: "user-reviewer" },
  });
  const state = await (await page.request.get("/api/state")).json();
  const pending = state.approvals.find(
    (item: { state: string }) => item.state === "PENDING",
  );
  expect(pending).toBeTruthy();
  const response = await page.request.post("/api/action", {
    data: {
      type: "decideApproval",
      approvalId: pending.id,
      decision: "APPROVED",
      comment: "Ready to publish",
    },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/app/approvals");
  await expect(
    page.getByText("Approvals", { exact: true }).first(),
  ).toBeVisible();
});

test("publishes approved content idempotently", async ({ page }) => {
  await page.request.post("/api/identity", { data: { userId: "user-owner" } });
  const first = await page.request.post("/api/action", {
    data: { type: "publishContent", contentId: "content-3", confirmed: true },
  });
  const second = await page.request.post("/api/action", {
    data: { type: "publishContent", contentId: "content-3", confirmed: true },
  });
  expect(first.ok()).toBeTruthy();
  expect(second.ok()).toBeTruthy();
  expect((await first.json()).data.externalId).toBe(
    (await second.json()).data.externalId,
  );
});

test("creates paid campaigns in paused state", async ({ page }) => {
  const response = await page.request.post("/api/action", {
    data: {
      type: "createPaidAd",
      name: "E2E Activation Campaign",
      platform: "Meta Ads",
      objective: "Leads",
      budget: 2500,
      headline: "Find your next growth signal",
      body: "Turn customer behavior into a practical next move.",
    },
  });
  expect(response.ok()).toBeTruthy();
  const state = await (await page.request.get("/api/state")).json();
  expect(
    state.paidAds.find(
      (item: { name: string }) => item.name === "E2E Activation Campaign",
    ).state,
  ).toBe("PAUSED");
});

test("shows resulting cross-channel insights and recommendations", async ({
  page,
}) => {
  await page.goto("/app/insights");
  await expect(
    page.getByText("Insights", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("AI recommendations")).toBeVisible();
  await expect(
    page.getByText("Reconnect Klaviyo before the next send"),
  ).toBeVisible();
});

test("creates a complete BFCM campaign from the template library", async ({
  page,
}) => {
  await page.request.post("/api/identity", { data: { userId: "user-owner" } });
  await page.goto("/app/campaigns/templates");
  await expect(
    page.getByRole("heading", {
      name: "Start with a complete campaign, not a blank page",
    }),
  ).toBeVisible();
  const template = page
    .locator("article")
    .filter({ hasText: "BFCM Revenue Sprint" });
  await template.getByRole("button", { name: "Use template" }).click();
  await expect(page.getByRole("dialog")).toContainText("11 assets");
  await page.getByLabel("Campaign name").fill("E2E BFCM Revenue Sprint");
  await page.getByRole("button", { name: "Create 11-asset campaign" }).click();
  await expect(page.getByText("Campaign workspace")).toBeVisible();
  const state = await (await page.request.get("/api/state")).json();
  const campaign = state.campaigns.find(
    (item: { title: string }) => item.title === "E2E BFCM Revenue Sprint",
  );
  expect(campaign).toBeTruthy();
  const assets = state.content.filter(
    (item: { campaignId: string }) => item.campaignId === campaign.id,
  );
  expect(assets).toHaveLength(11);
  expect(
    assets.every((item: { scheduledAt?: string }) => Boolean(item.scheduledAt)),
  ).toBe(true);
});
