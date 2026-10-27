import { test } from "node:test";
import assert from "node:assert/strict";
import { seedCampaigns, demoCommand } from "../lib/fixtures";
test("sample close/delete/restore preserve approved version and decision history", async () => {
  let campaign = (await seedCampaigns()).find((c) => c.status === "Approved")!;
  const original = structuredClone(campaign);
  const act = (action: string) =>
    (campaign = demoCommand(
      campaign,
      "marketer",
      action,
      campaign.versions.at(-1)!.id,
      { actorId: "demo-maya" },
    ));
  act("close");
  act("delete");
  assert.throws(() => act("revise"), /Trash/);
  act("restore");
  assert.equal(campaign.lifecycle, "closed");
  act("reopen");
  assert.equal(campaign.status, "Approved");
  assert.deepEqual(campaign.versions, original.versions);
  assert.deepEqual(
    campaign.events.slice(0, original.events.length),
    original.events,
  );
});
test("sample lifecycle models independent team ownership and blocks another reviewer", async () => {
  const campaign = (await seedCampaigns())[0];
  const v = campaign.versions.at(-1)!.id;
  assert.throws(
    () =>
      demoCommand(campaign, "reviewer", "delete", v, { actorId: "demo-alex" }),
    /review owner/,
  );
  const closed = demoCommand(campaign, "reviewer", "close", v, {
    actorId: "demo-alex",
    isTeamOwner: true,
  });
  assert.equal(closed.lifecycle, "closed");
  assert.throws(
    () =>
      demoCommand(closed, "reviewer", "approve", v, {
        note: "No decision on closed copy.",
      }),
    /closed/,
  );
  assert.equal(
    demoCommand(closed, "reviewer", "comment", v, {
      note: "A comment on a closed review.",
    }).events.at(-1)!.action,
    "comment",
  );
});
