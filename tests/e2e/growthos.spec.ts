import { expect, test } from "@playwright/test";

test("home prioritizes today's next action", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByText("Recommended next action")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Work to continue" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "This week's plan" }),
  ).toBeVisible();
  await expect(page.getByText("Approval required before publishing")).toBeVisible();
});

test("each channel workspace uses the same three-part structure", async ({
  page,
}) => {
  const workspaces = [
    ["/app/channels/social", "Social", "Posts"],
    ["/app/channels/messaging", "Email & Messaging", "Messages"],
    ["/app/channels/paid", "Paid Ads", "Ad Campaigns"],
    ["/app/channels/web", "Web & Content", "Pages"],
  ] as const;

  for (const [route, heading, noun] of workspaces) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByRole("tab", { name: noun })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Templates" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Results" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: new RegExp(`Search ${noun}`, "i") })).toBeVisible();
  }
});

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
  await page.request.post("/api/identity", { data: { userId: "user-owner" } });
  await page.goto("/app/campaigns/new");
  await page
    .getByRole("button", { name: "Create a custom campaign with AI" })
    .click();
  await page
    .getByLabel("Campaign objective")
    .fill(
      "Launch the collaboration analytics feature and generate qualified demo bookings",
    );
  await page.getByRole("button", { name: "Create custom campaign" }).click();
  await expect(
    page.getByRole("tab", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Content", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Schedule", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Results", exact: true }),
  ).toBeVisible();
});

test("runs the marketing agent from objective to durable campaign drafts", async ({
  page,
}) => {
  await page.request.post("/api/identity", { data: { userId: "user-owner" } });
  await page.goto("/app");
  await page.getByRole("button", { name: "Ask GrowthOS" }).click();
  await expect(page).toHaveURL(/\/app\/agent$/);
  await expect(
    page.getByRole("heading", { name: "Agent workspace" }),
  ).toBeVisible();
  await page
    .getByLabel("Marketing outcome")
    .fill("Refresh paid creative that is losing performance across Meta Ads");
  await page.getByRole("radio", { name: /Performance/ }).check();
  await page
    .getByRole("button", { name: "Build campaign proposal" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review the agent's work" }),
  ).toBeVisible();
  await expect(page.getByText("What the agent did")).toBeVisible();
  await expect(page.getByText("Evidence used")).toBeVisible();
  await expect(page.getByText("Publish nothing")).toBeVisible();
  const execute = page.getByRole("button", { name: "Build campaign drafts" });
  await expect(execute).toBeDisabled();
  await page.getByLabel("I reviewed this proposal").check();
  await expect(execute).toBeEnabled();
  await execute.click();
  await expect(page).toHaveURL(/\/app\/campaigns\/[^/]+\/content$/);

  const state = await (await page.request.get("/api/state")).json();
  expect(state.agentRuns[0].status).toBe("EXECUTED");
  expect(state.agentRuns[0].steps).toHaveLength(7);
  expect(
    state.paidAds.find(
      (item: { id: string }) => item.id === state.agentRuns[0].result.paidAdId,
    ).state,
  ).toBe("PAUSED");
  const retry = await page.request.post("/api/action", {
    data: {
      type: "executeAgentRun",
      runId: state.agentRuns[0].id,
      confirmed: true,
    },
  });
  expect((await retry.json()).data).toMatchObject({
    campaignId: state.agentRuns[0].result.campaignId,
    idempotent: true,
  });
});

test("campaign workspaces use four route-addressable tabs", async ({
  page,
}) => {
  const response = await page.request.post("/api/action", {
    data: {
      type: "createCampaign",
      prompt: "Create a four tab workspace test campaign",
      channels: ["LinkedIn", "Email"],
    },
  });
  const result = await response.json();
  await page.goto(`/app/campaigns/${result.data.campaignId}/overview`);
  await expect(page.getByRole("tab")).toHaveCount(4);
  await page.getByRole("tab", { name: "Content" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/app/campaigns/${result.data.campaignId}/content$`),
  );
  await expect(page.getByText(/content items/)).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
  await expect(page.getByText(/awaiting review/).first()).toBeVisible();
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
  await page.goto("/app/channels/paid/manage");
  await expect(page.getByRole("heading", { name: "Paid Ads" })).toBeVisible();
});

test("calendar and approvals remain focused destinations", async ({ page }) => {
  await page.goto("/app/calendar");
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Month" })).toBeVisible();
  await expect(page.getByRole("button", { name: "List" })).toBeVisible();
  await page.goto("/app/approvals");
  await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
});

test("shows three primary insights and recommendations", async ({ page }) => {
  await page.goto("/app/insights");
  await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible();
  await expect(
    page.getByText("Qualified leads", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Revenue", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Cost per lead", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recommended next moves" }),
  ).toBeVisible();
  await expect(
    page.getByText("Reconnect Klaviyo before the next send"),
  ).toBeVisible();
  await expect(page.getByText("99% confidence")).toBeVisible();
  await expect(page.getByText("9900% confidence")).toHaveCount(0);
});

test("previews real product creative before choosing a template", async ({
  page,
}) => {
  await page.goto("/app/campaigns/new");
  const template = page
    .locator("article")
    .filter({ hasText: "Product Content Showcase" });
  await expect(template.getByText("Carousel", { exact: true })).toBeVisible();
  await expect(
    template.getByText("Short video", { exact: true }),
  ).toBeVisible();
  await expect(
    template.getByText("Facebook post", { exact: true }),
  ).toBeVisible();
  await expect(template.getByText("TikTok", { exact: true })).toBeVisible();
  await expect(template.getByText("Email", { exact: true })).toBeVisible();
  await template.getByRole("button", { name: "Preview 8 assets" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Every planned asset");
  await expect(dialog.locator(".asset-mockup-carousel")).toBeVisible();
  await expect(dialog.locator(".asset-mockup-tiktok")).toBeVisible();
  await expect(dialog.locator(".asset-mockup-email")).toBeVisible();
  await expect(dialog.locator(".asset-mockup-sms")).toBeVisible();
  await expect(dialog.getByText("Product name").first()).toBeVisible();

  await dialog.getByRole("button", { name: "Use this template" }).click();
  await expect(
    page.getByRole("heading", { name: "Customize essentials" }),
  ).toBeVisible();
  await page.getByLabel("Product name").fill("Northstar Signals");
  await page.getByRole("button", { name: "Review campaign" }).click();
  await expect(
    page.getByRole("heading", { name: "Review and create" }),
  ).toBeVisible();
  await expect(page.locator(".asset-mockup-carousel")).toBeVisible();
  await expect(
    page
      .locator(".template-placeholder")
      .filter({ hasText: "Northstar Signals" })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Looks good — create drafts" }),
  ).toBeDisabled();
  await page.getByLabel("I reviewed the campaign bundle").check();
  await expect(
    page.getByRole("button", { name: "Looks good — create drafts" }),
  ).toBeEnabled();
});

test("creates a complete BFCM campaign in three focused steps", async ({
  page,
}) => {
  await page.request.post("/api/identity", { data: { userId: "user-owner" } });
  await page.goto("/app/campaigns/new");
  await expect(
    page.getByRole("heading", { name: "Choose a template" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Seasonal" }).click();
  const template = page
    .locator("article")
    .filter({ hasText: "BFCM Revenue Sprint" });
  await template.getByRole("button", { name: "Preview 11 assets" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Use this template" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Customize essentials" }),
  ).toBeVisible();
  await page.getByLabel("Campaign name").fill("E2E Simplicity BFCM");
  await page.getByRole("button", { name: "Review campaign" }).click();
  await expect(
    page.getByRole("heading", { name: "Review and create" }),
  ).toBeVisible();
  await expect(page.getByText("11", { exact: true }).first()).toBeVisible();
  await page.getByLabel("I reviewed the campaign bundle").check();
  await page
    .getByRole("button", { name: "Looks good — create drafts" })
    .click();
  await expect(
    page.getByRole("heading", { name: "E2E Simplicity BFCM" }),
  ).toBeVisible();
  const state = await (await page.request.get("/api/state")).json();
  const campaign = state.campaigns.find(
    (item: { title: string }) => item.title === "E2E Simplicity BFCM",
  );
  const assets = state.content.filter(
    (item: { campaignId: string }) => item.campaignId === campaign.id,
  );
  expect(assets).toHaveLength(11);
  expect(
    assets.every((item: { scheduledAt?: string }) => Boolean(item.scheduledAt)),
  ).toBe(true);
});

test("Manage exposes advanced pages and mobile uses a bottom bar", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Manage" }).click();
  for (const label of [
    "Brand & Assets",
    "Audiences",
    "Connections & Syncs",
    "Team",
    "Audit",
    "Settings",
  ]) {
    await expect(page.getByRole("button", { name: label })).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileNav = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav.getByRole("button", { name: "More" })).toBeVisible();
});

test("audience previews explain overlap and activation safeguards", async ({
  page,
}) => {
  await page.goto("/app/audiences");
  await expect(page.getByText("Audience safeguards are active")).toBeVisible();
  await page.getByRole("button", { name: "Open builder" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Audience composition")).toBeVisible();
  await expect(dialog.getByText("Overlap preview")).toBeVisible();
  await expect(dialog.getByText(/Consent/).first()).toBeVisible();
});

test("sync diagnostics show accepted, filtered, and safe retry context", async ({
  page,
}) => {
  await page.goto("/app/syncs");
  await page.getByRole("button", { name: /Inspect Demo conversions/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Delivery debugger")).toBeVisible();
  await expect(dialog.getByText("Why records were filtered")).toBeVisible();
  await expect(dialog.getByText(/idempotent/)).toBeVisible();
});
