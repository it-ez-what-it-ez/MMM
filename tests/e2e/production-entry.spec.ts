import { expect, test } from "@playwright/test";

test("unconfigured local build refuses to fake a workspace", async ({
  page,
}) => {
  test.skip(
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    "Configured environments run the authenticated acceptance suite.",
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Connect the real application foundation",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "no seeded workspace, demo login, fake provider, or canned AI fallback",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.getByText("Northstar Analytics")).toHaveCount(0);
});

test("authenticated production shell has the five-destination information architecture", async ({
  page,
}) => {
  test.skip(
    !process.env.PLAYWRIGHT_AUTH_STORAGE,
    "Set PLAYWRIGHT_AUTH_STORAGE to a real invited-user Supabase session for this suite.",
  );
  await page.goto("/app");
  for (const label of ["Home", "Campaigns", "Calendar", "Results", "Manage"])
    await expect(
      page.getByRole("link", { name: label, exact: true }).first(),
    ).toBeVisible();
  await expect(page.getByRole("link", { name: /New campaign/i })).toBeVisible();
});
