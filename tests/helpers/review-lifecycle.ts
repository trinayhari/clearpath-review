import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import pg from "pg";
export async function testReviewLifecycle(
  t: TestContext,
  db: pg.Client,
  connectionString: string,
) {
  const [author, reviewer, admin, outsider, workspace] = Array.from(
    { length: 5 },
    () => randomUUID(),
  );
  await db.query("reset role");
  await db.query("insert into auth.users(id) select unnest($1::uuid[])", [
    [author, reviewer, admin, outsider],
  ]);
  await db.query(
    "insert into cp_workspaces(id,name,owner_id) values($1,'Lifecycle test team',$2)",
    [workspace, admin],
  );
  await db.query(
    "insert into cp_members values($1,$2,'marketer','Author'),($1,$3,'reviewer','Reviewer'),($1,$4,'reviewer','Team owner')",
    [workspace, author, reviewer, admin],
  );
  const as = async (actor: string, client = db) => {
    await client.query("reset role");
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [
      actor,
    ]);
    await client.query("set role authenticated");
  };
  const command = async (
    action: string,
    data: unknown = {},
    id = campaign,
    vid = version,
    client = db,
  ) =>
    (
      await client.query("select public.cp_command($1,$2,$3,$4::jsonb) id", [
        action,
        id,
        vid,
        JSON.stringify(data),
      ])
    ).rows[0].id;
  let campaign: string | null = null,
    version: string | null = null;
  await as(author);
  campaign = await command("create", {
    workspaceId: workspace,
    title: "Lifecycle review",
    product: "Personal loans",
    channel: "Email",
    content:
      "Explore personal loan options. Subject to eligibility and credit approval.",
  });
  version = (
    await db.query("select current_version from cp_campaigns where id=$1", [
      campaign,
    ])
  ).rows[0].current_version;
  const row = async () =>
    (await db.query("select * from cp_campaigns where id=$1", [campaign]))
      .rows[0];
  await t.test(
    "lifecycle requires author or team owner and cannot bypass the gate through the private implementation",
    async () => {
      await as(reviewer);
      for (const action of ["close", "delete", "restore", "reopen"])
        await assert.rejects(
          command(action),
          /Review owner or team owner required/,
        );
      await as(outsider);
      await assert.rejects(command("delete"), /Workspace access denied/);
      await as(author);
      await assert.rejects(
        db.query("select private.cp_workflow_command('close',$1,$2,'{}')", [
          campaign,
          version,
        ]),
        /permission denied/,
      );
    },
  );
  await t.test(
    "closing preserves status and versions, permits discussion and blocks workflow mutations",
    async () => {
      await command("close", { note: "Pausing this campaign." });
      assert.equal((await row()).lifecycle, "closed");
      assert.equal((await row()).status, "Draft");
      await command("comment", {
        note: "We will resume after the launch plan changes.",
      });
      for (const action of ["analyze", "revise", "submit", "assign"])
        await assert.rejects(command(action), /Review is closed/);
      await assert.rejects(command("close"), /already closed/);
      await as(admin);
      await command("reopen");
      assert.equal((await row()).current_version, version);
      assert.equal((await row()).closed_at, null);
      await as(author);
    },
  );
  await t.test(
    "Trash retains immutable history and approval; restoring does not reopen a closed review",
    async () => {
      await command("analyze");
      await command("submit", { reviewerId: reviewer });
      await command("close");
      await as(reviewer);
      await assert.rejects(
        command("approve", { note: "Must not decide a closed review." }),
        /Review is closed/,
      );
      await as(author);
      await command("reopen");
      await as(reviewer);
      await command("approve", {
        note: "Reviewed the exact wording and eligibility conditions.",
      });
      await as(author);
      await command("close");
      const before = (
        await db.query(
          "select count(*)::int n from cp_events where campaign_id=$1",
          [campaign],
        )
      ).rows[0].n;
      await command("delete");
      assert.ok((await row()).deleted_at);
      assert.equal((await row()).status, "Approved");
      for (const action of ["comment", "approve", "reopen", "revise", "delete"])
        await assert.rejects(
          command(action, { note: "No mutations in Trash." }),
          /Review is in Trash/,
        );
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from cp_events where campaign_id=$1",
            [campaign],
          )
        ).rows[0].n,
        before + 1,
      );
      await as(admin);
      await command("restore");
      assert.equal((await row()).deleted_at, null);
      assert.equal((await row()).lifecycle, "closed");
      assert.equal((await row()).status, "Approved");
      await command("reopen");
      assert.equal((await row()).status, "Approved");
      await assert.rejects(command("restore"), /not in Trash/);
      await as(author);
    },
  );
  await t.test(
    "stale lifecycle actions fail and concurrent close produces one audit event",
    async () => {
      const previous = version;
      await command("revise", {
        content:
          "Compare personal lending options. Credit approval and eligibility requirements apply.",
      });
      version = (await row()).current_version;
      await assert.rejects(
        command("delete", {}, campaign, previous),
        /Stale version/,
      );
      const other = new pg.Client({ connectionString });
      await other.connect();
      try {
        await as(author, other);
        const outcomes = await Promise.allSettled([
          command("close"),
          command("close", {}, campaign, version, other),
        ]);
        assert.equal(
          outcomes.filter((x) => x.status === "fulfilled").length,
          1,
        );
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from cp_events where version_id=$1 and action='close'",
              [version],
            )
          ).rows[0].n,
          1,
        );
      } finally {
        await other.end();
      }
      await command("reopen");
    },
  );
  await t.test(
    "live analysis cannot start on closed or trashed reviews and active reservations prevent closing/deleting",
    async () => {
      await db.query("reset role");
      await db.query(
        "insert into private.cp_ai_keys(id,secret) values('lifecycle-test',decode(repeat('cd',32),'hex'))",
      );
      const insert = () =>
        db.query(
          `insert into private.cp_ai_runs(request_id,actor_id,workspace_id,campaign_id,version_id,content_hash,policy_bundle,model,key_id,reserved_microusd)
      values($1,$2,$3,$4,$5,'test-content','test-policy','test-model','lifecycle-test',200000)`,
          [randomUUID(), author, workspace, campaign, version],
        );
      await as(author);
      await command("close");
      await db.query("reset role");
      await assert.rejects(insert(), /Review is closed/);
      await as(author);
      await command("reopen");
      await command("delete");
      await db.query("reset role");
      await assert.rejects(insert(), /Review is in Trash/);
      await as(author);
      await command("restore");
      await db.query("reset role");
      await insert();
      await as(author);
      await assert.rejects(command("close"), /Analysis is in progress/);
      await assert.rejects(command("delete"), /Analysis is in progress/);
      assert.equal((await row()).lifecycle, "open");
      assert.equal((await row()).deleted_at, null);
    },
  );
}
