import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import fs from "node:fs";
const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres@127.0.0.1:55432/postgres";
if (!["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname))
  throw new Error(
    "Database tests only run against an isolated local PostgreSQL instance.",
  );
const uid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("PostgreSQL RLS and transactional workflow security", async (t) => {
  const db = new pg.Client({ connectionString });
  await db.connect();
  try {
    await db.query(
      `drop schema if exists public cascade;create schema public;drop schema if exists private cascade;drop schema if exists auth cascade;create schema auth;create table auth.users(id uuid primary key, is_anonymous boolean default false);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;do $$begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;end$$;grant usage on schema public,auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
    );
    for (const file of fs
      .readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.query(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
    await db.query(`insert into auth.users(id) values($1),($2),($3),($4);`, [
      uid(10),
      uid(11),
      uid(12),
      uid(13),
    ]);
    await db.query(`insert into public.cp_workspaces values($1,'A'),($2,'B')`, [
      uid(1),
      uid(2),
    ]);
    await db.query(
      `insert into public.cp_members values($1,$2,'marketer','Maya'),($1,$3,'reviewer','Alex'),($4,$5,'reviewer','Other')`,
      [uid(1), uid(10), uid(11), uid(2), uid(12)],
    );
    await db.query(
      "insert into public.cp_members values($1,$2,'marketer','Second marketer')",
      [uid(1), uid(13)],
    );
    const as = async (id: number) => {
      await db.query("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        uid(id),
      ]);
      await db.query("set role authenticated");
    };
    const cmd = async (
      action: string,
      cid: string | null,
      vid: string | null,
      data: unknown = {},
    ) =>
      (
        await db.query("select public.cp_command($1,$2,$3,$4::jsonb) id", [
          action,
          cid,
          vid,
          JSON.stringify(data),
        ])
      ).rows[0].id;
    await as(10);
    const cid = await cmd("create", null, null, {
      workspaceId: uid(1),
      title: "Fictional loan campaign",
      product: "Personal loans",
      channel: "Email",
      content: "Get guaranteed approval with your personal loan today.",
    });
    const v1 = (
      await db.query("select current_version from cp_campaigns where id=$1", [
        cid,
      ])
    ).rows[0].current_version;
    await t.test(
      "owner cannot submit without assessment",
      async () =>
        await assert.rejects(
          cmd("submit", cid, v1),
          /Trusted precheck required/,
        ),
    );
    await t.test("direct writes and immutable tampering denied", async () => {
      await assert.rejects(
        db.query(
          "update cp_versions set content='tampered marketing content' where id=$1",
          [v1],
        ),
        /permission denied/,
      );
      await assert.rejects(
        db.query("delete from cp_events"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("update cp_members set role='reviewer'"),
        /permission denied/,
      );
    });
    await t.test(
      "fabricated evidence rejected",
      async () =>
        await assert.rejects(
          cmd("analyze", cid, v1, {
            findings: [
              { evidence: "fabricated", policyId: "CP-101", severity: "High" },
            ],
          }),
          /Client-supplied findings/,
        ),
    );
    await assert.rejects(
      cmd("analyze", cid, v1, { findings: [] }),
      /Client-supplied findings/,
    );
    await t.test(
      "same-workspace marketer cannot mutate another owner's draft",
      async () => {
        await as(13);
        assert.equal(
          (await db.query("select id from cp_campaigns where id=$1", [cid]))
            .rowCount,
          1,
        );
        for (const action of ["revise", "analyze", "submit"])
          await assert.rejects(
            cmd(action, cid, v1, {
              content: "Another marketer must not overwrite this copy.",
            }),
            /owner required/,
          );
        await as(10);
      },
    );
    await cmd("analyze", cid, v1);
    const persisted = (
      await db.query("select findings from cp_analyses where version_id=$1", [
        v1,
      ])
    ).rows[0].findings;
    assert.ok(
      persisted.some((f: { policyId: string }) => f.policyId === "CP-101"),
    );
    assert.equal(
      persisted[0].evidence,
      "Get guaranteed approval with your personal loan today.",
    );
    await cmd("submit", cid, v1);
    await t.test(
      "marketer cannot approve",
      async () =>
        await assert.rejects(
          cmd("approve", cid, v1, { note: "approve" }),
          /Independent reviewer/,
        ),
    );
    await t.test(
      "submitted content locked",
      async () =>
        await assert.rejects(
          cmd("revise", cid, v1, {
            content: "A completely new consumer-facing sentence.",
          }),
          /locked/,
        ),
    );
    await as(12);
    await t.test("cross-workspace reads and mutations denied", async () => {
      assert.equal((await db.query("select * from cp_campaigns")).rowCount, 0);
      assert.equal((await db.query("select * from cp_versions")).rowCount, 0);
      assert.equal((await db.query("select * from cp_events")).rowCount, 0);
      await assert.rejects(
        cmd("approve", cid, v1, { note: "approve" }),
        /access denied/,
      );
    });
    await as(11);
    await t.test(
      "reviewer cannot edit",
      async () =>
        await assert.rejects(
          cmd("revise", cid, v1, {
            content: "A completely new consumer-facing sentence.",
          }),
          /owner required/,
        ),
    );
    await cmd("request_changes", cid, v1, {
      note: "Remove unsupported guarantees.",
    });
    await as(10);
    await assert.rejects(cmd("submit", cid, v1), /revised version/);
    await cmd("revise", cid, v1, {
      content:
        "Explore your options. Subject to eligibility and credit approval.",
    });
    const v2 = (
      await db.query("select current_version from cp_campaigns where id=$1", [
        cid,
      ])
    ).rows[0].current_version;
    await cmd("analyze", cid, v2);
    await cmd("submit", cid, v2);
    await as(11);
    await t.test(
      "stale version approval rejected",
      async () =>
        await assert.rejects(
          cmd("approve", cid, v1, { note: "Old review" }),
          /Stale version/,
        ),
    );
    await t.test(
      "concurrent approval yields exactly one decision",
      async () => {
        const other = new pg.Client({ connectionString });
        await other.connect();
        await other.query(
          "select set_config('request.jwt.claim.sub',$1,false)",
          [uid(11)],
        );
        await other.query("set role authenticated");
        const results = await Promise.allSettled([
          cmd("approve", cid, v2, { note: "Verified this exact revision." }),
          other.query("select public.cp_command($1,$2,$3,$4::jsonb)", [
            "approve",
            cid,
            v2,
            JSON.stringify({ note: "Concurrent review" }),
          ]),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        await other.end();
        assert.equal(
          (
            await db.query(
              "select * from cp_events where version_id=$1 and action='approve'",
              [v2],
            )
          ).rowCount,
          1,
        );
      },
    );
    await t.test(
      "new revision invalidates current approval but preserves its exact-version event",
      async () => {
        await as(10);
        await cmd("revise", cid, v2, {
          content:
            "Explore a revised personal loan message. Eligibility and underwriting apply.",
        });
        const campaign = (
          await db.query(
            "select status,current_version,decided_at,submitted_at from cp_campaigns where id=$1",
            [cid],
          )
        ).rows[0];
        assert.equal(campaign.status, "Draft");
        assert.notEqual(campaign.current_version, v2);
        assert.equal(campaign.decided_at, null);
        assert.equal(campaign.submitted_at, null);
        assert.equal(
          (
            await db.query(
              "select id from cp_events where version_id=$1 and action='approve'",
              [v2],
            )
          ).rowCount,
          1,
        );
        assert.equal(
          (
            await db.query(
              "select id from cp_events where version_id=$1 and action='approve'",
              [campaign.current_version],
            )
          ).rowCount,
          0,
        );
        await cmd("analyze", cid, campaign.current_version);
        await cmd("submit", cid, campaign.current_version);
        await db.query("reset role");
        await db.query(
          "update cp_members set role='reviewer' where workspace_id=$1 and user_id=$2",
          [uid(1), uid(10)],
        );
        await as(10);
        await assert.rejects(
          cmd("approve", cid, campaign.current_version, {
            note: "I must not approve my own work.",
          }),
          /Independent reviewer/,
        );
        await db.query("reset role");
        await db.query(
          "update cp_members set role='marketer' where workspace_id=$1 and user_id=$2",
          [uid(1), uid(10)],
        );
      },
    );
    await db.query("reset role");
    await t.test(
      "audit and versions immutable even for direct table owner writes",
      async () => {
        await assert.rejects(
          db.query("update cp_events set note='tamper'"),
          /Immutable/,
        );
        await assert.rejects(
          db.query(
            "update cp_versions set content='tampered marketing content'",
          ),
          /Immutable/,
        );
      },
    );
    await t.test(
      "database-generated findings pass full output validation for every product",
      async () => {
        const { safeAssessment } = await import("../lib/domain");
        for (const [product, copy] of [
          [
            "Personal loans",
            "🌱 A brighter future. Get guaranteed approval at 7.99% APR. Act now!",
          ],
          [
            "Mortgage",
            "Find a home. Get pre-approved for your mortgage in minutes.",
          ],
          [
            "Affiliate",
            "Compare our partner options and find a financial product that suits you.",
          ],
          [
            "Credit cards",
            "Enjoy 3% cash back with no annual fee. Terms apply.",
          ],
        ]) {
          const findings = (
            await db.query("select private.cp_mock_analysis($1,$2) findings", [
              copy,
              product,
            ])
          ).rows[0].findings;
          const checked = safeAssessment(
            { trusted: true, provider: "deterministic-mock-v2-db", findings },
            copy,
            product,
          );
          assert.equal(checked.analyzed, true, product);
          assert.ok(checked.findings.length > 0, product);
        }
      },
    );
    await as(10);
    const legacyId = await cmd("create", null, null, {
      workspaceId: uid(1),
      title: "Legacy assessment fixture",
      product: "Personal loans",
      channel: "Email",
      content:
        "Everyone qualifies for a personal loan. Explore our options today.",
    });
    const legacyVersion = (
      await db.query("select current_version from cp_campaigns where id=$1", [
        legacyId,
      ])
    ).rows[0].current_version;
    await t.test(
      "direct RPC rejects empty and malformed caller assessment payloads",
      async () => {
        for (const findings of [
          [],
          [
            {
              title: { object: "child" },
              evidence: "Everyone qualifies",
              policyId: "CP-101",
              severity: "High",
              rationale: { object: "child" },
              replacement: { object: "child" },
            },
          ],
        ])
          await assert.rejects(
            cmd("analyze", legacyId, legacyVersion, { findings }),
            /Client-supplied findings/,
          );
        assert.equal(
          (
            await db.query("select * from cp_analyses where version_id=$1", [
              legacyVersion,
            ])
          ).rowCount,
          0,
        );
      },
    );
    await db.query("reset role");
    await db.query(
      "insert into cp_analyses(version_id,findings,provider) values($1,'[]','deterministic-mock-v1')",
      [legacyVersion],
    );
    await as(10);
    await t.test(
      "legacy assessments cannot authorize submission or approval",
      async () => {
        await assert.rejects(
          cmd("submit", legacyId, legacyVersion),
          /Trusted precheck required/,
        );
        await db.query("reset role");
        await db.query(
          "update cp_campaigns set status='In review', reviewer_id=$2 where id=$1",
          [legacyId, uid(11)],
        );
        await as(11);
        await assert.rejects(
          cmd("approve", legacyId, legacyVersion, { note: "Legacy approval" }),
          /Trusted precheck required/,
        );
      },
    );
    await db.query("reset role");
    await db.query("set role anon");
    await t.test("anonymous access denied", async () => {
      await assert.rejects(
        db.query("select * from cp_campaigns"),
        /permission denied/,
      );
      await assert.rejects(
        cmd("approve", cid, v2, { note: "anonymous" }),
        /permission denied/,
      );
    });
    const { testSignupIsolation } = await import("./helpers/signup-isolation");
    await db.query("reset role");
    await testSignupIsolation(t, db, connectionString);
    const { testTrustedRuntime } = await import("./helpers/trusted-runtime");
    await db.query("reset role");
    await testTrustedRuntime(t, db, connectionString);
    const { testTeams } = await import("./helpers/teams");
    await testTeams(t, db, connectionString);
    const { testReviewLifecycle } = await import("./helpers/review-lifecycle");
    await testReviewLifecycle(t, db, connectionString);
  } finally {
    await db.end();
  }
});
