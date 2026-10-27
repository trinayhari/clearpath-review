import { test, expect } from "@playwright/test";
async function openReview(
  page: import("@playwright/test").Page,
  title = "A little breathing room",
) {
  await page.goto("/preview");
  await page.getByRole("button", { name: new RegExp(title) }).click();
}
async function lifecycle(
  page: import("@playwright/test").Page,
  action: string,
  confirm: string,
) {
  await page.locator(".review-action-menu summary").click();
  await page.getByRole("button", { name: action, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: confirm, exact: true })
    .click();
}
test("closed reviews keep their conversation and can reopen without changing review status", async ({
  page,
}) => {
  await openReview(page);
  await lifecycle(page, "Close review", "Close review");
  await expect(page.locator(".review-meta .badge")).toHaveText("Closed");
  await expect(
    page.getByLabel("Compliance reviewer", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page
    .getByLabel("Add a comment")
    .fill("Campaign is paused until the new launch date.");
  await page.getByRole("button", { name: "Comment on v1" }).click();
  await expect(
    page.getByText("Campaign is paused until the new launch date.", {
      exact: true,
    }),
  ).toBeVisible();
  await lifecycle(page, "Reopen review", "Reopen review");
  await expect(page.locator(".review-meta .badge")).toHaveText("In review");
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(
    page.getByText("closed the review", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("reopened the review", { exact: false }),
  ).toBeVisible();
});
test("delete moves a review to Trash and restore retains saved copy and approval history", async ({
  page,
}) => {
  await openReview(page, "A clearer way to consolidate");
  const copy = await page.getByLabel("Edit marketing copy").inputValue();
  await lifecycle(page, "Delete review…", "Move to Trash");
  await expect(page.locator(".review-meta .badge")).toHaveText("In Trash");
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(page.getByLabel("Add a comment")).toHaveCount(0);
  await page.getByRole("button", { name: "Review queue", exact: true }).click();
  await expect(
    page.locator(".lifecycle-tabs button[aria-pressed=true]"),
  ).toContainText("Trash");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .locator(".lifecycle-tabs")
    .getByRole("button", { name: /^Open/ })
    .click();
  await expect(
    page.getByRole("button", { name: /A clearer way to consolidate/ }),
  ).toHaveCount(0);
  await page
    .locator(".lifecycle-tabs")
    .getByRole("button", { name: /^Trash/ })
    .click();
  await page
    .getByRole("button", { name: /A clearer way to consolidate/ })
    .click();
  await lifecycle(page, "Restore review", "Restore review");
  await expect(page.locator(".review-meta .badge")).toHaveText("Approved");
  await expect(page.getByLabel("Edit marketing copy")).toHaveValue(copy);
  await expect(page.locator(".version-decision")).toContainText(
    "Version 1: Approved",
  );
});
test("reviewers cannot close or delete another author’s review and mobile actions stay in bounds", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReview(page);
  await page.getByLabel("Preview role").selectOption("reviewer");
  await expect(page.locator(".review-action-menu")).toHaveCount(0);
  await page.getByLabel("Preview role").selectOption("marketer");
  await page.locator(".review-action-menu summary").click();
  await expect(
    page.getByRole("button", { name: "Delete review…", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Delete review…", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".review-meta .badge")).toHaveText("In review");
});
test("changes compare complete immutable versions and warn before closing unsaved edits", async ({
  page,
}) => {
  await openReview(page, "The first step toward home");
  await page.getByRole("button", { name: "Changes", exact: true }).click();
  await expect(
    page.getByText("No earlier version", { exact: true }),
  ).toBeVisible();
  const original = await page.getByLabel("Edit marketing copy").inputValue();
  const revised = original + " Compare options at your own pace.";
  await page.getByLabel("Edit marketing copy").fill(revised);
  await page.locator(".review-action-menu summary").click();
  await page.getByRole("button", { name: "Close review", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "You have unsaved edits.",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.getByRole("button", { name: "Save as v2", exact: true }).click();
  await page.getByRole("button", { name: "Changes", exact: true }).click();
  await expect(page.locator(".changes-columns section").first()).toContainText(
    original,
  );
  await expect(page.locator(".changes-columns section").last()).toContainText(
    revised,
  );
  await expect(page.locator(".changes-columns ins")).toContainText(
    "Compare options at your own pace.",
  );
});

test("failed lifecycle actions keep the explanation visible inside the confirmation", async ({
  page,
}) => {
  const { seedCampaigns } = await import("../../lib/fixtures");
  const campaign = (await seedCampaigns())[0];
  const actor = "00000000-0000-4000-8000-000000000101";
  const workspace = "00000000-0000-4000-8000-000000000201";
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "POST")
      return route.fulfill({
        status: 409,
        json: {
          error:
            "An analysis is still running. Wait for it to finish before closing this review.",
        },
      });
    return route.fulfill({
      json: {
        userId: actor,
        email: "fictional@example.invalid",
        members: [
          {
            user_id: actor,
            workspace_id: workspace,
            role: "marketer",
            display_name: "Maya",
          },
        ],
        workspaces: [{ id: workspace, name: "Review team", owner_id: actor }],
        campaigns: [{ ...campaign, workspaceId: workspace, ownerId: actor }],
      },
    });
  });
  await page.goto("/preview?workspace=live");
  await page.getByRole("button", { name: /A little breathing room/ }).click();
  await page.locator(".review-action-menu summary").click();
  await page.getByRole("button", { name: "Close review", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close review", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "An analysis is still running",
  );
  await expect(page.locator(".review-meta .badge")).toHaveText("In review");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.locator(".review-action-menu summary")).toBeFocused();
});
