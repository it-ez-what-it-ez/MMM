import { expect, test } from "@playwright/test";

test("production entry refuses to fake a workspace", async ({ page }) => {
  await page.goto("/");
  const setupGate = page.getByRole("heading", {
    name: "Connect the real application foundation",
  });
  const realAuth = page.getByRole("heading", {
    name: "Create your account or sign in",
  });
  await expect(setupGate.or(realAuth)).toBeVisible();
  if (await setupGate.isVisible()) {
    await expect(
      page.getByText(
        "no seeded workspace, demo login, fake provider, or canned AI fallback",
        { exact: false },
      ),
    ).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: /Google/ })).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Email address" }),
    ).toBeVisible();
  }
  await expect(page.getByText("Northstar Analytics")).toHaveCount(0);
});

test("authenticated production shell exposes the primary product destinations", async ({
  page,
}) => {
  test.skip(
    !process.env.PLAYWRIGHT_AUTH_STORAGE,
    "Set PLAYWRIGHT_AUTH_STORAGE to a real invited-user Supabase session for this suite.",
  );
  await page.goto("/app");
  for (const label of [
    "Home",
    "Campaigns",
    "Calendar",
    "Results",
    "Integrations",
    "Manage",
  ])
    await expect(
      page.getByRole("link", { name: label, exact: true }).first(),
    ).toBeVisible();
  await expect(page.getByRole("link", { name: /New campaign/i })).toBeVisible();
});
