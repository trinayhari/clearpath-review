import { test, expect } from "@playwright/test";
test("signed-out entry is login with optional preview and no automatic membership", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "Sign in to ClearPath Review" }),
  ).toBeVisible();
  await expect(page.getByLabel("Demo role")).toHaveCount(0);
  await page.goto("/login");
  await page.getByText("Joining your team for the first time?").click();
  await expect(
    page.getByText(/Signing in alone does not grant access/),
  ).toBeVisible();
  await page.getByRole("link", { name: /Explore a sample workspace/ }).click();
  await expect(page).toHaveURL(/\/preview/);
  await expect(page.getByLabel("Demo role")).toBeVisible();
});
// Synthetic API responses exercise presentation only, never claim actual Supabase Auth verification.
test("authenticated presentation distinguishes missing membership and errors without fixture fallback", async ({
  page,
}) => {
  await page.route("**/api/workspace", (route) =>
    route.fulfill({
      json: {
        userId: "isolated-account",
        email: "fictional@example.invalid",
        members: [],
        workspaces: [],
        campaigns: [],
      },
    }),
  );
  await page.goto("/preview?workspace=live");
  await expect(
    page.getByText("fictional@example.invalid", { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText(/does not have workspace access/)).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(page.getByLabel("Demo role")).toHaveCount(0);
  await page.unroute("**/api/workspace");
  await page.route("**/api/workspace", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Workspace temporarily unavailable." },
    }),
  );
  await page.reload();
  await expect(
    page.getByText("Workspace temporarily unavailable."),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Try loading again/ }),
  ).toBeVisible();
});
test("reusable URL session tokens are rejected and removed without being exchanged", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/auth", (route) => {
    calls++;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto(
    "/auth/confirm#access_token=synthetic-invalid&refresh_token=synthetic-invalid",
  );
  await expect(
    page.getByRole("heading", { name: /Let’s try a new link/ }),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  expect(calls).toBe(0);
});
