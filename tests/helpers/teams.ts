import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import pg from "pg";
export async function testTeams(
  t: TestContext,
  db: pg.Client,
  connectionString: string,
) {
  const ids = [1, 2, 3, 4, 5].map(
    (i) => `00000000-0000-4000-8000-00000000880${i}`,
  );
  await db.query("reset role");
  await db.query("insert into auth.users(id) select unnest($1::uuid[])", [ids]);
  const as = async (id: string, client = db) => {
    await client.query("reset role");
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id,
    ]);
    await client.query("set role authenticated");
  };
  const team = async (action: string, data: unknown, client = db) =>
    (
      await client.query("select public.cp_team_command($1,$2::jsonb) result", [
        action,
        JSON.stringify(data),
      ])
    ).rows[0].result;
  const command = async (
    action: string,
    data: unknown = {},
    cid = campaign,
    vid = version,
  ) =>
    (
      await db.query("select public.cp_command($1,$2,$3,$4::jsonb) id", [
        action,
        cid,
        vid,
        JSON.stringify(data),
      ])
    ).rows[0].id;
  let workspaceId = "",
    campaign: string | null = null,
    version: string | null = null;
  await t.test(
    "team creation sets an independent admin permission and rejects forged roles",
    async () => {
      await as(ids[0]);
      await assert.rejects(
        team("create", { name: "Bad", displayName: "Owner", role: "admin" }),
        /Invalid team role/,
      );
      ({ workspaceId } = await team("create", {
        name: "Lending team",
        displayName: "Morgan",
        role: "marketer",
      }));
      assert.equal(
        (
          await db.query("select owner_id from cp_workspaces where id=$1", [
            workspaceId,
          ])
        ).rows[0].owner_id,
        ids[0],
      );
      assert.equal(
        (
          await db.query("select role from cp_members where workspace_id=$1", [
            workspaceId,
          ])
        ).rows[0].role,
        "marketer",
      );
    },
  );
  await t.test(
    "only team owner can rename or create invitations; invite secrets cannot be read",
    async () => {
      await as(ids[1]);
      await assert.rejects(
        team("invite", { workspaceId, role: "reviewer" }),
        /Team owner required/,
      );
      await assert.rejects(
        team("rename", { workspaceId, name: "Stolen" }),
        /Team owner required/,
      );
      await assert.rejects(
        db.query("select * from private.cp_team_invites"),
        /permission denied/,
      );
      await as(ids[0]);
      await team("rename", { workspaceId, name: "Consumer marketing" });
      assert.equal(
        (
          await db.query("select name from cp_workspaces where id=$1", [
            workspaceId,
          ])
        ).rows[0].name,
        "Consumer marketing",
      );
    },
  );
  await t.test(
    "invitation joins its scoped reviewer once and cannot elevate existing membership",
    async () => {
      const invite = await team("invite", { workspaceId, role: "reviewer" });
      assert.match(invite.token, /^[a-f0-9]{64}$/);
      await as(ids[1]);
      assert.equal(
        (await team("join", { token: invite.token, displayName: "Alex" }))
          .workspaceId,
        workspaceId,
      );
      await assert.rejects(
        team("join", { token: invite.token, displayName: "Alex" }),
        /already used/,
      );
      assert.equal(
        (
          await db.query(
            "select role from cp_members where workspace_id=$1 and user_id=$2",
            [workspaceId, ids[1]],
          )
        ).rows[0].role,
        "reviewer",
      );
      await assert.rejects(
        team("invite", { workspaceId, role: "reviewer" }),
        /Team owner required/,
      );
      await as(ids[0]);
      const elevate = await team("invite", { workspaceId, role: "reviewer" });
      await assert.rejects(
        team("join", { token: elevate.token, displayName: "Owner" }),
        /already belong/,
      );
    },
  );
  await t.test("revoked and expired invitations fail closed", async () => {
    const revoked = await team("invite", { workspaceId, role: "reviewer" });
    await team("revoke", { workspaceId, inviteId: revoked.id });
    const expired = await team("invite", { workspaceId, role: "reviewer" });
    await db.query("reset role");
    await db.query(
      "update private.cp_team_invites set expires_at=now()-interval '1 second' where id=$1",
      [expired.id],
    );
    await as(ids[2]);
    for (const invitation of [revoked, expired])
      await assert.rejects(
        team("join", { token: invitation.token, displayName: "Riley" }),
        /invalid, expired or already used/,
      );
  });
  await t.test(
    "concurrent invitation acceptance grants exactly one membership",
    async () => {
      await as(ids[0]);
      const invite = await team("invite", { workspaceId, role: "reviewer" });
      const other = new pg.Client({ connectionString });
      await other.connect();
      try {
        await as(ids[2]);
        await as(ids[3], other);
        const results = await Promise.allSettled([
          team("join", { token: invite.token, displayName: "Riley" }),
          team("join", { token: invite.token, displayName: "Taylor" }, other),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      } finally {
        await other.end();
      }
    },
  );
  await t.test(
    "submission requires an eligible reviewer and only assigned reviewer can decide",
    async () => {
      await as(ids[0]);
      campaign = await command("create", {
        workspaceId,
        title: "New lending campaign",
        product: "Personal loans",
        channel: "Email",
        content:
          "Explore our personal loan options and compare rates and terms today.",
      });
      version = (
        await db.query("select current_version from cp_campaigns where id=$1", [
          campaign,
        ])
      ).rows[0].current_version;
      await command("analyze");
      await assert.rejects(command("submit"), /Choose a compliance reviewer/);
      await assert.rejects(
        command("submit", { reviewerId: ids[0] }),
        /Choose a compliance reviewer/,
      );
      await assert.rejects(
        command("submit", { reviewerId: ids[4] }),
        /Choose a compliance reviewer/,
      );
      await command("submit", { reviewerId: ids[1] });
      assert.equal(
        (
          await db.query("select reviewer_id from cp_campaigns where id=$1", [
            campaign,
          ])
        ).rows[0].reviewer_id,
        ids[1],
      );
      const otherReviewer = (
        await db.query(
          "select user_id from cp_members where workspace_id=$1 and role='reviewer' and user_id<>$2",
          [workspaceId, ids[1]],
        )
      ).rows[0].user_id;
      await as(otherReviewer);
      await assert.rejects(
        command("approve", { note: "Looks fine" }),
        /Assigned reviewer required/,
      );
      await assert.rejects(
        command("assign", { reviewerId: otherReviewer }),
        /Campaign owner or team owner required/,
      );
      await as(ids[0]);
      await command("assign", { reviewerId: otherReviewer });
      await as(ids[1]);
      await assert.rejects(
        command("approve", { note: "Looks fine" }),
        /Assigned reviewer required/,
      );
      await as(otherReviewer);
      await command("approve", { note: "Copy and disclosures reviewed" });
      assert.equal(
        (
          await db.query("select status from cp_campaigns where id=$1", [
            campaign,
          ])
        ).rows[0].status,
        "Approved",
      );
    },
  );
  await t.test(
    "anonymous callers cannot create teams or redeem invitations",
    async () => {
      await db.query("reset role");
      await db.query("set role anon");
      await assert.rejects(
        team("create", { name: "Anonymous", displayName: "No identity" }),
        /permission denied/,
      );
      await assert.rejects(
        team("join", { token: "a".repeat(64), displayName: "No identity" }),
        /permission denied/,
      );
    },
  );
}
