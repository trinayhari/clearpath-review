import { test, expect } from "@playwright/test";
test("signed-out entry is login with optional preview and no automatic membership", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "Sign in to ClearPath Review" }),
  ).toBeVisible();
  await expect(page.getByLabel("Preview role")).toHaveCount(0);
  await page.goto("/login");
  await page.getByText("Joining your team for the first time?").click();
  await expect(
    page.getByText(/Signing in alone does not grant access/),
  ).toBeVisible();
  await page.getByRole("link", { name: /Explore a sample workspace/ }).click();
  await expect(page).toHaveURL(/\/preview/);
  await expect(page.getByLabel("Preview role")).toBeVisible();
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
  await expect(page.getByLabel("Preview role")).toHaveCount(0);
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
test("auth rejects oversized and malformed bodies before contacting identity provider", async ({
  page,
}) => {
  await page.goto("/login");
  const results = await page.evaluate(async () => {
    const cases = [
      ["application/json", "x".repeat(9000)],
      ["application/json", "{"],
      ["text/plain", "{}"],
    ];
    return Promise.all(
      cases.map(async ([type, body]) => {
        const response = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": type },
          body,
        });
        return {
          status: response.status,
          cache: response.headers.get("cache-control"),
          body: await response.json(),
        };
      }),
    );
  });
  expect(results.map((r) => r.status)).toEqual([413, 400, 415]);
  for (const result of results) {
    expect(result.cache).toContain("no-store");
    expect(result.body.error).toBeTruthy();
  }
});
test("default invite fragments are scrubbed and require explicit verified-account confirmation", async ({
  page,
}) => {
  const actions: string[] = [];
  await page.route("**/api/auth", (route) => {
    const action = route.request().postDataJSON().action;
    actions.push(action);
    return route.fulfill({
      json:
        action === "preview_invite"
          ? {
              ok: true,
              userId: "00000000-0000-4000-8000-000000000001",
              email: "fictional@example.invalid",
            }
          : { error: "Synthetic expired invitation" },
      status: action === "preview_invite" ? 200 : 400,
    });
  });
  await page.goto(
    "/#type=invite&access_token=synthetic-invitation-access-token&refresh_token=synthetic-invitation-refresh-token",
  );
  await expect(page).toHaveURL(/\/auth\/confirm$/);
  await expect(
    page.getByRole("heading", { name: "Confirm your account" }),
  ).toBeVisible();
  await expect(
    page.getByText("fictional@example.invalid", { exact: true }),
  ).toBeVisible();
  expect(actions).toEqual(["preview_invite"]);
  expect(await page.locator("body").textContent()).not.toContain(
    "synthetic-invitation-access-token",
  );
  await page
    .getByRole("button", { name: "Continue with this account" })
    .click();
  await expect(page.locator("p[role=alert]")).toHaveText(
    "Synthetic expired invitation",
  );
  expect(actions).toEqual(["preview_invite", "accept_invite"]);
});

test("account settings reject signed-out access and password writes", async ({
  page,
}) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
  const status = await page.evaluate(async () => {
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_password",
        password: "synthetic-test-password",
      }),
    });
    return response.status;
  });
  expect(status).toBe(401);
});

test("password signup explains isolation and preserves existing-account collision without reset", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await expect(page.getByText(/No confirmation email required/)).toBeVisible();
  await expect(page.getByText(/Email ownership is not verified/)).toBeVisible();
  let payload: Record<string, unknown> = {};
  await page.route("**/api/auth", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({
      status: 400,
      json: {
        error:
          "Unable to create this account. If you already have an account, sign in with your existing password.",
      },
    });
  });
  await page
    .getByLabel("Email", { exact: true })
    .fill("fictional@example.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("synthetic-password-only");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.locator("p[role=alert]")).toContainText("existing password");
  expect(Object.keys(payload).sort()).toEqual(["action", "email", "password"]);
  expect(payload.action).toBe("signup");
  await page
    .getByRole("button", { name: "Already have an account? Sign in" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sign in to ClearPath Review" }),
  ).toBeVisible();
});
