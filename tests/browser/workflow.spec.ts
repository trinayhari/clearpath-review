import { test, expect } from "@playwright/test";
test("complete isolated evaluator workflow and preserved approval history", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (e) => browserErrors.push(e.message));
  await page.goto("/preview");
  await expect(
    page.getByRole("heading", { name: "Review queue", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/queue-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "New submission" }).click();
  await page.getByLabel("Campaign name").fill("A thoughtful launch");
  await page
    .getByLabel("Marketing copy")
    .fill(
      "Get guaranteed approval for your personal loan today. Explore a brighter financial future with ClearPath.",
    );
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  await page.getByLabel("Test analysis recovery").selectOption("timeout");
  await page.getByRole("button", { name: "Run precheck", exact: true }).click();
  await expect(page.locator(".alert.error")).toContainText("timed out");
  await expect(page.getByLabel("Edit marketing copy")).toHaveValue(
    /guaranteed approval/,
  );
  await page.getByLabel("Test analysis recovery").selectOption("normal");
  await page.getByRole("button", { name: "Run precheck", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Approval cannot be guaranteed" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview edit" }).click();
  await page.getByRole("button", { name: "Save as v2" }).click();
  await page.getByRole("button", { name: "Run precheck", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No rule matches found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit v2 for review" }).click();
  await expect(page.getByLabel("Edit marketing copy")).toHaveCount(0);
  await page.getByLabel("Demo role").selectOption("reviewer");
  await page.screenshot({
    path: "artifacts/review-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await page
    .getByLabel("Rationale")
    .fill("Verified the revised wording and product eligibility conditions.");
  await expect(page.getByLabel("Decision", { exact: true })).toHaveValue(
    "choose",
  );
  await expect(
    page.getByRole("button", { name: "Confirm decision · v2" }),
  ).toBeDisabled();
  await page.getByLabel("Decision", { exact: true }).selectOption("approve");
  await page.getByRole("button", { name: "Confirm decision · v2" }).click();
  await expect(page.getByRole("status")).toContainText("Decision recorded");
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByText("approved this version")).toBeVisible();
  await page.getByLabel("Demo role").selectOption("marketer");
  await page.getByRole("button", { name: "Save as v3" }).click();
  await expect(page.getByRole("status")).toContainText("New immutable version");
  await page.getByLabel("Content version").selectOption("1");
  await expect(page.getByText("approved this version")).toBeVisible();
  expect(browserErrors).toEqual([]);
});
test("queue filters, policy library, analytics, mobile layout and auth denial", async ({
  page,
}) => {
  await page.goto("/preview");
  await page.getByLabel("Search campaigns").fill("nothing matches");
  await expect(
    page.getByRole("heading", { name: "No campaigns match" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await page
    .getByRole("button", { name: "Policy library", exact: true })
    .click();
  await expect(
    page.getByText("Fictional policies for demonstration"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review insights" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Review queue/ }).click();
  await page.screenshot({ path: "artifacts/queue-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const status = await page.evaluate(
    async () =>
      (
        await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
        })
      ).status,
  );
  expect([401, 403, 503]).toContain(status);
});
test("workspace switching scopes queue counters and analytics consistently", async ({
  page,
}) => {
  const { seedCampaigns } = await import("../../lib/fixtures");
  const seed = await seedCampaigns();
  const campaigns = [
    { ...seed[0], workspaceId: "one", ownerId: "evaluator" },
    { ...seed[3], workspaceId: "one", ownerId: "evaluator" },
    { ...seed[4], workspaceId: "two" },
  ];
  await page.route("**/api/workspace", (route) =>
    route.fulfill({
      json: {
        userId: "evaluator",
        members: [
          { user_id: "evaluator", workspace_id: "one", role: "marketer" },
          { user_id: "evaluator", workspace_id: "two", role: "reviewer" },
        ],
        workspaces: [
          { id: "one", name: "Workspace one" },
          { id: "two", name: "Workspace two" },
        ],
        campaigns,
      },
    }),
  );
  await page.goto("/preview?workspace=live");
  await expect(page.getByLabel("Active workspace")).toHaveValue("one");
  await expect(
    page
      .locator(".stat")
      .filter({ hasText: "Awaiting review" })
      .locator("strong"),
  ).toContainText("1");
  await expect(
    page.locator(".stat").filter({ hasText: "Approved" }).locator("strong"),
  ).toContainText("0");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByLabel("Active workspace").selectOption("two");
  await page.getByRole("button", { name: "All work", exact: false }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page
      .locator(".stat")
      .filter({ hasText: "Awaiting review" })
      .locator("strong"),
  ).toContainText("0");
  await expect(
    page.locator(".stat").filter({ hasText: "Approved" }).locator("strong"),
  ).toContainText("1");
  await expect(
    page.getByRole("button", { name: "New submission" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(
    page
      .locator(".stat")
      .filter({ hasText: "Decision throughput" })
      .locator("strong"),
  ).toContainText("1");
  await expect(
    page
      .locator(".chart-row")
      .filter({ hasText: "Approved" })
      .locator("strong"),
  ).toHaveText("1");
  await expect(
    page
      .locator(".chart-row")
      .filter({ hasText: "In review" })
      .locator("strong"),
  ).toHaveText("0");
});
test("review dialogs trap keyboard focus, restore their trigger, and policy citations preserve review context", async ({
  page,
}) => {
  await page.goto("/preview");
  await page.getByRole("button", { name: /A little breathing room/ }).click();
  const citation = page.getByRole("link", { name: /View CP-101:/ });
  await citation.click();
  await expect(page.locator("#CP-101")).toBeFocused();
  await expect(page.locator("#CP-101")).toHaveClass(/policy-selected/);
  await page.getByRole("button", { name: /Return to review/ }).click();
  await expect(citation).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "A little breathing room", exact: true }),
  ).toBeVisible();
  for (const strip of await page.locator(".detail-tabs").all()) {
    expect(await strip.evaluate((el) => getComputedStyle(el).overflowY)).toBe(
      "hidden",
    );
    expect(await strip.evaluate((el) => getComputedStyle(el).flexWrap)).toBe(
      "nowrap",
    );
  }
  await page.getByLabel("Demo role").selectOption("reviewer");
  const trigger = page.getByRole("button", {
    name: "Record decision",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Record a decision on v1" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('label[for="review-decision"]')).toHaveText(
    /Decision/,
  );
  await expect(dialog.locator('label[for="decision-rationale"]')).toHaveText(
    /Rationale/,
  );
  const close = page.getByRole("button", { name: "Close decision" }),
    cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page
    .getByLabel("Rationale")
    .fill("Reviewed the exact version and verified remaining terms.");
  await page.getByLabel("Decision", { exact: true }).selectOption("approve");
  const confirm = page.getByRole("button", { name: "Confirm decision · v1" });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("button", { name: "Close decision" }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(trigger).toBeFocused();
  await page
    .getByRole("button", { name: "Review queue", exact: false })
    .first()
    .click();
  expect(
    await page
      .locator(".queue-tabs")
      .evaluate((el) => getComputedStyle(el).overflowY),
  ).toBe("hidden");
});

test("persisted external failure offers a new immutable version without retrying the same analysis", async ({
  page,
}) => {
  const { seedCampaigns } = await import("../../lib/fixtures");
  const original = (await seedCampaigns())[0];
  const version = { ...original.versions[0], analyzed: false, findings: [] };
  const campaign = {
    ...original,
    status: "Draft",
    ownerId: "qa-owner",
    workspaceId: "qa-workspace",
    versions: [version],
    events: [
      {
        id: "failed-event",
        action: "analysis_failed",
        actor: "QA owner",
        versionId: version.id,
        at: "2026-10-27T00:00:00Z",
        note: "External analysis failed; no assessment was stored.",
      },
    ],
  };
  await page.route("**/api/workspace", (route) =>
    route.fulfill({
      json: {
        userId: "qa-owner",
        email: "fictional@example.invalid",
        members: [
          {
            user_id: "qa-owner",
            workspace_id: "qa-workspace",
            role: "marketer",
          },
        ],
        workspaces: [
          { id: "qa-workspace", name: "QA workspace", analysisMode: "openai" },
        ],
        campaigns: [campaign],
      },
    }),
  );
  await page.goto(`/preview?workspace=live&campaign=${campaign.id}`);
  await expect(
    page.getByText(/the external analysis failed. Save a new version to retry/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: `Save as v${version.number + 1}`,
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Run precheck", exact: true }),
  ).toHaveCount(0);
});
