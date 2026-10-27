import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import pg from "pg";
export async function testSignupIsolation(
  t: TestContext,
  db: pg.Client,
  connectionString: string,
) {
  const ids = [
    "00000000-0000-4000-8000-000000009901",
    "00000000-0000-4000-8000-000000009902",
    "00000000-0000-4000-8000-000000009903",
  ];
  await db.query("reset role");
  await db.query("insert into auth.users(id) select unnest($1::uuid[])", [ids]);
  const as = async (client: pg.Client, id: string) => {
    await client.query("reset role");
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id,
    ]);
    await client.query("set role authenticated");
  };
  const initialize = async (client: pg.Client) =>
    (await client.query("select public.cp_initialize_workspace() id")).rows[0]
      .id as string;
  let first = "",
    second = "",
    campaign = "",
    version = "";
  await t.test(
    "new signup gets one isolated marketer workspace despite concurrent initialization",
    async () => {
      const other = new pg.Client({ connectionString });
      await other.connect();
      try {
        await as(db, ids[0]);
        await as(other, ids[0]);
        const results = await Promise.all([initialize(db), initialize(other)]);
        assert.equal(results[0], results[1]);
        first = results[0];
        assert.equal(await initialize(db), first);
        const memberships = (await db.query("select * from public.cp_members"))
          .rows;
        assert.equal(memberships.length, 1);
        assert.equal(memberships[0].role, "marketer");
        await assert.rejects(
          db.query("select public.cp_initialize_workspace($1)", [ids[1]]),
          /does not exist/,
        );
        await assert.rejects(
          db.query("update public.cp_members set role='reviewer'"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select * from private.cp_personal_workspaces"),
          /permission denied/,
        );
      } finally {
        await other.end();
      }
    },
  );
  await t.test(
    "bootstrap transaction rollback leaves no partial workspace and retry succeeds",
    async () => {
      await as(db, ids[1]);
      await db.query("begin");
      const rolledBack = await initialize(db);
      await db.query("rollback");
      assert.equal(
        (await db.query("select * from public.cp_workspaces")).rowCount,
        0,
      );
      second = await initialize(db);
      assert.notEqual(second, rolledBack);
      assert.notEqual(second, first);
    },
  );
  await t.test(
    "campaign survives fresh database session and another signup cannot read or mutate it",
    async () => {
      await as(db, ids[0]);
      campaign = (
        await db.query(
          "select public.cp_command('create',null,null,$1::jsonb) id",
          [
            JSON.stringify({
              workspaceId: first,
              title: "Isolated signup campaign",
              product: "Personal loans",
              channel: "Email",
              content:
                "Explore fictional personal loan options. Terms depend on eligibility.",
            }),
          ],
        )
      ).rows[0].id;
      version = (
        await db.query(
          "select current_version from public.cp_campaigns where id=$1",
          [campaign],
        )
      ).rows[0].current_version;
      const returning = new pg.Client({ connectionString });
      await returning.connect();
      try {
        await as(returning, ids[0]);
        assert.equal(await initialize(returning), first);
        assert.equal(
          (
            await returning.query(
              "select * from public.cp_campaigns where id=$1",
              [campaign],
            )
          ).rowCount,
          1,
        );
      } finally {
        await returning.end();
      }
      await as(db, ids[1]);
      assert.equal(
        (await db.query("select * from public.cp_campaigns")).rowCount,
        0,
      );
      await assert.rejects(
        db.query(
          "select public.cp_command('comment',$1,$2,'{\"note\":\"Spoof attempt\"}')",
          [campaign, version],
        ),
        /Workspace access denied/,
      );
      await assert.rejects(
        db.query("select public.cp_command('create',null,null,$1::jsonb)", [
          JSON.stringify({
            workspaceId: first,
            title: "Spoofed workspace",
            product: "Personal loans",
            channel: "Email",
            content: "This must never create a campaign in another workspace.",
          }),
        ]),
        /Marketer membership required/,
      );
    },
  );
  await t.test(
    "existing reviewer stays in approved workspace; anonymous and removed access cannot self-provision privileges",
    async () => {
      await as(db, "00000000-0000-4000-8000-000000000011");
      assert.equal(
        await initialize(db),
        "00000000-0000-4000-8000-000000000001",
      );
      assert.equal(
        (
          await db.query(
            "select role from public.cp_members where user_id=auth.uid()",
          )
        ).rows[0].role,
        "reviewer",
      );
      await db.query("reset role");
      await db.query("update auth.users set is_anonymous=true where id=$1", [
        ids[2],
      ]);
      await as(db, ids[2]);
      await assert.rejects(initialize(db), /Authenticated account required/);
      await db.query("reset role");
      await db.query("delete from public.cp_members where user_id=$1", [
        ids[1],
      ]);
      await as(db, ids[1]);
      await assert.rejects(initialize(db), /Workspace access denied/);
      await db.query("reset role");
      await db.query("set role anon");
      await assert.rejects(initialize(db), /permission denied/);
      await db.query("reset role");
    },
  );
}
