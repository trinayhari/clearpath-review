import { test, expect } from "@playwright/test";

test("sample team creation, colleague setup and switching keep campaigns scoped", async ({
  page,
}) => {
  await page.goto("/preview");
  await page
    .getByRole("button", { name: "Team & people", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ClearPath Financial", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Alex Morgan", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New team", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Create a team" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "New team", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "New team", exact: true }).click();
  await page.getByLabel("Team name", { exact: true }).fill("Consumer lending");
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Consumer lending", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Your team needs a compliance reviewer/),
  ).toBeVisible();
  await page.getByLabel("Sample colleague name").fill("Jordan Lee");
  await page
    .getByRole("combobox", { name: "Team role", exact: true })
    .selectOption("reviewer");
  await page
    .getByRole("button", { name: "Add sample colleague", exact: true })
    .click();
  await expect(page.getByText("Jordan Lee", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Your team needs a compliance reviewer/),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^Review queue/ }).click();
  await expect(
    page.getByRole("heading", { name: "No campaigns yet" }),
  ).toBeVisible();
  await page.getByLabel("Active workspace").selectOption("demo-team");
  await expect(
    page.getByRole("button", { name: /A little breathing room/ }),
  ).toBeVisible();
  await page
    .getByLabel("Active workspace")
    .selectOption({ label: "Consumer lending" });
  await expect(
    page.getByRole("heading", { name: "No campaigns yet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /A little breathing room/ }),
  ).toHaveCount(0);
});

test("named reviewer receives the submission and only their sample persona sees a decision action", async ({
  page,
}) => {
  await page.goto("/preview");
  await page
    .getByRole("button", { name: "Team & people", exact: true })
    .click();
  await page.getByLabel("Sample colleague name").fill("Jordan Lee");
  await page
    .getByRole("button", { name: "Add sample colleague", exact: true })
    .click();
  await page.getByRole("button", { name: /^Review queue/ }).click();
  await page
    .getByRole("button", { name: "New submission", exact: true })
    .click();
  await page.getByLabel("Campaign name").fill("Assigned lending launch");
  await page
    .getByLabel("Marketing copy")
    .fill(
      "Explore our personal loan options and compare rates and terms today.",
    );
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  await page.getByRole("button", { name: "Run precheck", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Submit v1 for review" }),
  ).toBeDisabled();
  await page
    .getByLabel("Compliance reviewer", { exact: true })
    .selectOption({ label: "Jordan Lee" });
  await page.getByRole("button", { name: "Submit v1 for review" }).click();
  await expect(
    page
      .locator(".review-context-strip")
      .getByText("Jordan Lee", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Compliance reviewer", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Change reviewer", exact: true })
    .click();
  await expect(
    page.getByLabel("Compliance reviewer", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel reassignment", exact: true })
    .click();
  await expect(
    page.getByLabel("Compliance reviewer", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Preview role").selectOption("reviewer");
  await expect(
    page.getByRole("button", { name: "Record decision", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Preview role")
    .selectOption({ label: "Jordan Lee · Reviewer" });
  await page
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await page.getByLabel("Decision", { exact: true }).selectOption("approve");
  await page
    .getByLabel("Rationale")
    .fill("Reviewed this exact copy and the lending disclosures.");
  await page.getByRole("button", { name: "Confirm decision · v1" }).click();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByText("approved this version")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record decision", exact: true }),
  ).toHaveCount(0);
});

// API fixtures verify presentation and request wiring, not hosted identity or invitations.
test("team create, invitation and join controls send scoped authenticated API requests", async ({
  page,
}) => {
  const actor = "00000000-0000-4000-8000-000000000101";
  const original = "00000000-0000-4000-8000-000000000201";
  const created = "00000000-0000-4000-8000-000000000202";
  const joined = "00000000-0000-4000-8000-000000000203";
  const token = "a".repeat(64);
  const workspaces = [{ id: original, name: "Original team", owner_id: actor }];
  const members = [
    {
      workspace_id: original,
      user_id: actor,
      display_name: "Morgan",
      role: "marketer",
      is_admin: true,
    },
  ];
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/workspace", (route) =>
    route.fulfill({
      json: {
        userId: actor,
        email: "fictional@example.invalid",
        campaigns: [],
        workspaces,
        members,
      },
    }),
  );
  await page.route("**/api/teams", async (route) => {
    const input = route.request().postDataJSON();
    requests.push(input);
    if (input.action === "create") {
      workspaces.push({ id: created, name: input.name, owner_id: actor });
      members.push({
        workspace_id: created,
        user_id: actor,
        display_name: input.displayName,
        role: "marketer",
        is_admin: true,
      });
      return route.fulfill({ json: { workspaceId: created } });
    }
    if (input.action === "invite")
      return route.fulfill({
        json: {
          id: "invite",
          token,
          expiresAt: "2026-11-03T00:00:00Z",
          role: input.role,
        },
      });
    workspaces.push({
      id: joined,
      name: "Compliance collaboration",
      owner_id: "someone-else",
    });
    members.push({
      workspace_id: joined,
      user_id: actor,
      display_name: input.displayName,
      role: "reviewer",
      is_admin: false,
    });
    return route.fulfill({ json: { workspaceId: joined } });
  });
  await page.goto("/preview?workspace=live");
  await page
    .getByRole("button", { name: "Team & people", exact: true })
    .click();
  await page.getByRole("button", { name: "New team", exact: true }).click();
  const create = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Create a team", exact: true }),
  });
  await create
    .getByLabel("Team name", { exact: true })
    .fill("Growth marketing");
  await create.getByLabel("Your display name").fill("Morgan");
  await create
    .getByRole("button", { name: "Create team", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Growth marketing", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create invitation code" }).click();
  await expect(
    page.getByRole("textbox", { name: "One-use invitation code", exact: true }),
  ).toHaveValue(token);
  expect(requests[0]).toEqual({
    action: "create",
    name: "Growth marketing",
    displayName: "Morgan",
    role: "marketer",
  });
  expect(requests[1]).toEqual({
    action: "invite",
    workspaceId: created,
    role: "reviewer",
  });
  await page.getByRole("button", { name: "Join a team", exact: true }).click();
  const join = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Join a team", exact: true }),
  });
  await join.getByLabel("Invitation code", { exact: true }).fill(token);
  await join.getByLabel("Your display name").fill("Morgan");
  await join.getByRole("button", { name: "Join team", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Compliance collaboration",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create invitation code" }),
  ).toHaveCount(0);
  expect(requests[2]).toEqual({ action: "join", token, displayName: "Morgan" });
});
