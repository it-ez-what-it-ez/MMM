import { expect, test } from "@playwright/test";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/identity", { data: { userId: "user-owner" } });
});

test("home presents one next action and the two lists that matter", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /Good morning/ })).toBeVisible();
  await expect(page.getByText("Recommended next step")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Campaigns in progress" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Coming up" })).toBeVisible();
});

test("desktop and mobile navigation stay focused on the V1", async ({ page }) => {
  await page.goto("/app");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  for (const label of [
    "Home",
    "Campaigns",
    "Products & Brand",
    "Approvals",
    "Calendar",
    "Results",
  ]) {
    await expect(navigation.getByRole("button", { name: label })).toBeVisible();
  }
  await expect(navigation.getByRole("button")).toHaveCount(6);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(mobile).toBeVisible();
  await expect(mobile.getByRole("button", { name: "Products" })).toBeVisible();
});

test("adds a product with a real stored image and keeps it after refresh", async ({
  page,
}) => {
  const productName = `E2E Running Shoe ${Date.now()}`;
  await page.goto("/app/products");
  await page.getByRole("button", { name: "Add product" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Product name").fill(productName);
  await dialog
    .getByLabel("Short product description")
    .fill("A lightweight everyday running shoe built for comfortable miles.");
  await dialog.getByLabel("Price or offer").fill("$129");
  await dialog.getByLabel("Product page").fill("https://example.com/running-shoe");
  await dialog.getByLabel("Product image").setInputFiles({
    name: "running-shoe.png",
    mimeType: "image/png",
    buffer: png,
  });
  await dialog.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("heading", { name: productName })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: productName })).toBeVisible();
});

test("creates a BFCM campaign through the three focused decisions", async ({
  page,
}) => {
  await page.goto("/app/campaigns/new?product=product-growth-signals");
  await page
    .getByPlaceholder(/Launch Growth Signals/)
    .fill("Run a Black Friday promotion for our annual plan");
  await page.getByRole("button", { name: "Recommend", exact: true }).click();
  await page.getByLabel("Campaign name").fill(`BFCM V1 ${Date.now()}`);
  await page.getByRole("button", { name: "Review creative" }).click();
  await expect(
    page.getByRole("heading", { name: "Would you approve this campaign?" }),
  ).toBeVisible();
  await expect(page.locator(".asset-mockup")).toHaveCount(11);
  await page.getByLabel("I reviewed every campaign asset").check();
  await page.getByRole("button", { name: "Create campaign drafts" }).click();
  await expect(page).toHaveURL(/\/app\/campaigns\/[^/]+\/content$/);
  await expect(page.getByRole("tab")).toHaveCount(4);
});

test("shows actual ChatGPT and Reddit ad previews before campaign creation", async ({
  page,
}) => {
  await page.goto("/app/campaigns/new?product=product-growth-signals");
  await page
    .getByRole("button", { name: /Product Content Showcase/ })
    .click();
  await page.getByRole("button", { name: "Review creative" }).click();
  await expect(page.getByText("ChatGPT Ads", { exact: true }).first()).toBeVisible();
  const preview = page.locator(".asset-mockup-chatgpt");
  await expect(preview).toBeVisible();
  await expect(preview.getByText("Sponsored", { exact: false })).toBeVisible();
  await expect(preview.getByRole("button", { name: "See the product" })).toBeVisible();
  const redditPreview = page.locator(".asset-mockup-reddit");
  await expect(redditPreview).toBeVisible();
  await expect(redditPreview.getByText(/Promoted by Northstar Analytics/i)).toBeVisible();
  await expect(redditPreview.getByRole("button", { name: "See the product" })).toBeVisible();
  await expect(page.getByText(/upload a real product image/i)).toBeVisible();
  await expect(page.getByText(/connect a Reddit developer app/i)).toBeVisible();
});

test("keeps real ad providers gated by approval and server credentials", async ({
  page,
}) => {
  const upload = await page.request.post("/api/media", {
    multipart: {
      file: { name: "chatgpt-ad.png", mimeType: "image/png", buffer: png },
    },
  });
  const mediaId = (await upload.json()).assetId;
  const productResponse = await page.request.post("/api/action", {
    data: {
      type: "createProduct",
      name: `ChatGPT Ads Product ${Date.now()}`,
      description: "A product created to verify the real ChatGPT Ads safety gate.",
      price: "$99",
      productUrl: "https://example.com/chatgpt-ads-product",
      mediaId,
    },
  });
  const productId = (await productResponse.json()).data.productId;
  const state = await (await page.request.get("/api/state")).json();
  expect(state.chatGptAdsConfigured).toBe(false);
  expect(state.redditAdsConfigured).toBe(false);
  const template = state.templates.find(
    (item: { id: string }) => item.id === "template-product-content-showcase",
  );
  const variables = Object.fromEntries(
    template.variables.map((item: { key: string; defaultValue: string }) => [
      item.key,
      item.defaultValue,
    ]),
  );
  const campaignResponse = await page.request.post("/api/action", {
    data: {
      type: "useCampaignTemplate",
      templateId: template.id,
      productId,
      name: `ChatGPT API Gate ${Date.now()}`,
      startDate: "2026-09-01",
      variables: {
        ...variables,
        productName: "ChatGPT Ads Product",
        productBenefit: "Make product discovery useful and relevant",
        productPrice: "$99",
        productUrl: "https://example.com/chatgpt-ads-product",
      },
    },
  });
  const campaignId = (await campaignResponse.json()).data.campaignId;
  const draftState = await (await page.request.get("/api/state")).json();
  const creative = draftState.content.find(
    (item: { campaignId: string; channel: string }) =>
      item.campaignId === campaignId && item.channel === "ChatGPT Ads",
  );
  await page.request.post("/api/action", {
    data: { type: "submitApproval", contentId: creative.id },
  });
  await page.request.post("/api/identity", { data: { userId: "user-reviewer" } });
  const reviewState = await (await page.request.get("/api/state")).json();
  const approval = reviewState.approvals.find(
    (item: { contentId: string; state: string }) =>
      item.contentId === creative.id && item.state === "PENDING",
  );
  await page.request.post("/api/action", {
    data: {
      type: "decideApproval",
      approvalId: approval.id,
      decision: "APPROVED",
      comment: "Creative verified",
    },
  });
  await page.request.post("/api/identity", { data: { userId: "user-owner" } });
  const result = await page.request.post("/api/action", {
    data: {
      type: "createChatGPTAdCampaign",
      campaignId,
      contentId: creative.id,
      budget: 500,
      confirmed: true,
    },
  });
  expect(result.status()).toBe(400);
  expect((await result.json()).error).toContain("not connected");

  const redditCreative = draftState.content.find(
    (item: { campaignId: string; channel: string }) =>
      item.campaignId === campaignId && item.channel === "Reddit Ads",
  );
  await page.request.post("/api/action", {
    data: { type: "submitApproval", contentId: redditCreative.id },
  });
  await page.request.post("/api/identity", { data: { userId: "user-reviewer" } });
  const redditReviewState = await (await page.request.get("/api/state")).json();
  const redditApproval = redditReviewState.approvals.find(
    (item: { contentId: string; state: string }) =>
      item.contentId === redditCreative.id && item.state === "PENDING",
  );
  await page.request.post("/api/action", {
    data: {
      type: "decideApproval",
      approvalId: redditApproval.id,
      decision: "APPROVED",
      comment: "Reddit creative verified",
    },
  });
  await page.request.post("/api/identity", { data: { userId: "user-owner" } });
  const redditResult = await page.request.post("/api/action", {
    data: {
      type: "createRedditAdCampaign",
      campaignId,
      contentId: redditCreative.id,
      budget: 500,
      confirmed: true,
    },
  });
  expect(redditResult.status()).toBe(400);
  expect((await redditResult.json()).error).toContain("not connected");
});

test("approval decisions and publishing remain server-enforced", async ({
  page,
}) => {
  await page.request.post("/api/identity", { data: { userId: "user-marketer" } });
  const campaignResponse = await page.request.post("/api/action", {
    data: {
      type: "createCampaign",
      prompt: "Create a campaign for the V1 approval workflow test",
      channels: ["LinkedIn"],
    },
  });
  const campaignId = (await campaignResponse.json()).data.campaignId;
  const state = await (await page.request.get("/api/state")).json();
  const draft = state.content.find(
    (item: { campaignId: string }) => item.campaignId === campaignId,
  );
  const premature = await page.request.post("/api/action", {
    data: { type: "publishContent", contentId: draft.id, confirmed: true },
  });
  expect(premature.status()).toBe(400);
  await page.request.post("/api/action", {
    data: { type: "submitApproval", contentId: draft.id },
  });
  await page.request.post("/api/identity", { data: { userId: "user-reviewer" } });
  const review = await (await page.request.get("/api/state")).json();
  const approval = review.approvals.find(
    (item: { contentId: string; state: string }) =>
      item.contentId === draft.id && item.state === "PENDING",
  );
  await page.request.post("/api/action", {
    data: {
      type: "decideApproval",
      approvalId: approval.id,
      decision: "APPROVED",
    },
  });
  await page.request.post("/api/identity", { data: { userId: "user-owner" } });
  const first = await page.request.post("/api/action", {
    data: { type: "publishContent", contentId: draft.id, confirmed: true },
  });
  const second = await page.request.post("/api/action", {
    data: { type: "publishContent", contentId: draft.id, confirmed: true },
  });
  expect((await first.json()).data.externalId).toBe(
    (await second.json()).data.externalId,
  );
});

test("exports the complete campaign handoff as CSV", async ({ page }) => {
  const state = await (await page.request.get("/api/state")).json();
  const campaign = state.campaigns[0];
  const response = await page.request.get(
    `/api/campaign-export?campaignId=${campaign.id}`,
  );
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toContain("text/csv");
  const csv = await response.text();
  expect(csv).toContain('"channel","type","title"');
  expect(csv).toContain('"target_url"');
});

test("calendar, approvals, and results remain separate one-click workspaces", async ({
  page,
}) => {
  for (const [route, heading] of [
    ["/app/calendar", "Calendar"],
    ["/app/approvals", "Approvals"],
    ["/app/results", "Results"],
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
});

test("viewer access cannot mutate products or campaigns", async ({ page }) => {
  await page.request.post("/api/identity", { data: { userId: "user-viewer" } });
  const response = await page.request.post("/api/action", {
    data: {
      type: "createProduct",
      name: "Unauthorized product",
      description: "This product should never be persisted by a viewer.",
      price: "$10",
      productUrl: "https://example.com/blocked",
    },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toContain("viewer access");
});
