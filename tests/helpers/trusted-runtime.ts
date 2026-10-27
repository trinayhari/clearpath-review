import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID, createHmac } from "node:crypto";
import { mockProvider } from "../../lib/domain";
import {
  signAnalysisPayload,
  signReservationRequest,
  type Reservation,
  runTrustedAnalysis,
} from "../../lib/server/trusted-analysis";
import type { SupabaseClient } from "@supabase/supabase-js";
const uid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const synthetic = "ab".repeat(32); // Noncredential test-only bytes, never hosted.
export async function testTrustedRuntime(
  t: TestContext,
  db: pg.Client,
  connectionString: string,
) {
  const as = async (n: number, client = db) => {
    await client.query("reset role");
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid(n),
    ]);
    await client.query("set role authenticated");
  };
  const cmd = async (
    action: string,
    cid: string | null,
    vid: string | null,
    data: unknown = {},
  ) =>
    (
      await db.query("select public.cp_command($1,$2,$3,$4::jsonb) value", [
        action,
        cid,
        vid,
        JSON.stringify(data),
      ])
    ).rows[0].value;
  const create = async (workspace = uid(1)) => {
    const id = await cmd("create", null, null, {
      workspaceId: workspace,
      title: "Runtime " + randomUUID(),
      product: "Personal loans",
      channel: "Email",
      content: "Get guaranteed approval for a fictional personal loan today.",
    });
    const v = (
      await db.query(
        "select current_version from public.cp_campaigns where id=$1",
        [id],
      )
    ).rows[0].current_version;
    return { id, v };
  };
  const reserve = async (
    c: { id: string; v: string },
    request = randomUUID(),
    client = db,
  ) => {
    const actorId = (await client.query("select auth.uid() id")).rows[0].id;
    const proof = signReservationRequest(
      { actorId, campaignId: c.id, versionId: c.v, requestId: request },
      "local-test-key",
      synthetic,
    );
    return (
      await client.query(
        "select public.cp_reserve_analysis($1,$2,$3,$4,$5) value",
        [c.id, c.v, request, proof.p_payload, proof.p_signature],
      )
    ).rows[0].value as Reservation;
  };
  const signed = (
    r: Reservation,
    final = false,
    extra: Record<string, unknown> = {},
  ) =>
    signAnalysisPayload(
      r,
      synthetic,
      final ? "clearpath-analysis-finalize-v1" : "clearpath-analysis-start-v1",
      extra,
    );
  const resign = (
    value: ReturnType<typeof signed>,
    changes: Record<string, unknown>,
  ) => {
    const p_payload = JSON.stringify({
      ...JSON.parse(value.p_payload),
      ...changes,
    });
    return {
      ...value,
      p_payload,
      p_signature: createHmac("sha256", Buffer.from(synthetic, "hex"))
        .update(p_payload)
        .digest("hex"),
    };
  };
  const execute = async (
    kind: "start" | "finalize",
    p: ReturnType<typeof signed>,
    client = db,
  ) =>
    (
      await client.query(`select public.cp_${kind}_analysis($1,$2,$3) value`, [
        p.p_execution,
        p.p_payload,
        p.p_signature,
      ])
    ).rows[0].value;
  const completed = async (r: Reservation) =>
    signed(r, true, {
      outcome: "succeeded",
      findings: (await mockProvider.analyze(r.content, r.product)).map((f) => ({
        ...f,
        uncertainty:
          f.uncertainty ?? "Approved product terms were not supplied.",
      })),
      responseId: "resp_synthetic",
      inputTokens: 1000,
      outputTokens: 200,
    });
  await db.query("reset role");
  await t.test(
    "runtime disabled without administrative configuration",
    async () => {
      await as(10);
      const c = await create();
      await assert.rejects(reserve(c), /not enabled|key unavailable/);
    },
  );
  await db.query("reset role");
  await db.query(
    "insert into private.cp_ai_keys values('local-test-key',decode($1,'hex'),true),('revoked-test-key',decode($1,'hex'),false)",
    [synthetic],
  );
  await db.query(
    "insert into private.cp_ai_limits values(true,true,'local-test-key',2000000,10,20)",
  );
  await db.query(
    "insert into private.cp_ai_workspaces values($1,true),($2,true)",
    [uid(1), uid(2)],
  );
  const reset = async () => {
    await db.query("reset role");
    // Isolated local fixture cleanup, never available to an authenticated application role.
    await db.query("truncate private.cp_ai_runs cascade");
    await db.query(
      "update private.cp_ai_limits set enabled=true,active_key='local-test-key',total_budget_microusd=2000000,per_user_hour=10,per_workspace_day=20",
    );
    await db.query(
      "update private.cp_ai_keys set enabled=(id='local-test-key')",
    );
    await db.query("update private.cp_ai_workspaces set enabled=true");
    await as(10);
  };
  await t.test(
    "private keys, budget rows and execution writes are inaccessible to callers",
    async () => {
      await reset();
      for (const table of [
        "cp_ai_keys",
        "cp_ai_limits",
        "cp_ai_runs",
        "cp_ai_workspaces",
      ])
        await assert.rejects(
          db.query(`select * from private.${table}`),
          /permission denied/,
        );
      await assert.rejects(
        db.query("truncate private.cp_ai_runs cascade"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select private.cp_ai_verify('{}','x','x')"),
        /permission denied/,
      );
    },
  );
  await t.test(
    "idempotent reservation and signed start prevent duplicate provider claims",
    async () => {
      await reset();
      const c = await create(),
        request = randomUUID(),
        r = await reserve(c, request);
      assert.equal((await reserve(c, request)).id, r.id);
      assert.equal((await reserve(c)).id, r.id);
      const c2 = await create();
      await assert.rejects(reserve(c2, request), /already used/);
      const other = new pg.Client({ connectionString });
      await other.connect();
      await as(10, other);
      try {
        const outcomes = await Promise.all([
          execute("start", signed(r)),
          execute("start", signed(r), other),
        ]);
        assert.deepEqual(outcomes.sort(), [false, true]);
      } finally {
        await other.end();
      }
    },
  );
  await t.test(
    "direct-RPC forgery, null signatures and incorrect binding cannot start or finalize",
    async () => {
      await reset();
      const c = await create(),
        r = await reserve(c),
        p = await completed(r);
      await assert.rejects(
        cmd("analyze", c.id, c.v, {
          findings: [],
          trusted: true,
          provider: "openai-responses-v1",
        }),
        /Client-supplied/,
      );
      await assert.rejects(
        db.query("select public.cp_start_analysis($1,$2,null)", [
          r.id,
          signed(r).p_payload,
        ]),
        /signature/,
      );
      await assert.rejects(
        execute("start", { ...signed(r), p_signature: "0".repeat(64) }),
        /signature/,
      );
      await assert.rejects(
        execute("start", resign(signed(r), { nonce: randomUUID() })),
        /binding mismatch/,
      );
      await assert.rejects(execute("finalize", p), /not started/);
      await execute("start", signed(r));
      await assert.rejects(
        execute("finalize", { ...p, p_signature: "0".repeat(64) }),
        /signature/,
      );
      for (const changes of [
        { actorId: uid(11) },
        { workspaceId: uid(2) },
        { contentHash: "f".repeat(64) },
        { policyBundle: "wrong" },
        { versionId: randomUUID() },
        { audience: "clearpath-analysis-start-v1" },
      ])
        await assert.rejects(execute("finalize", resign(p, changes)));
    },
  );
  await t.test(
    "signed full schema and exact evidence are validated in PostgreSQL",
    async () => {
      await reset();
      const r = await reserve(await create());
      await execute("start", signed(r));
      const p = await completed(r),
        f = JSON.parse(p.p_payload).findings[0];
      for (const bad of [
        { ...f, title: {} },
        { ...f, uncertainty: null },
        { ...f, evidence: "invented" },
        { ...f, start: 0.5 },
        { ...f, source: "https://evil.invalid" },
        { ...f, policyId: "CP-310" },
        { ...f, extra: "field" },
      ])
        await assert.rejects(
          execute("finalize", resign(p, { findings: [bad] })),
          /Invalid analysis findings/,
        );
      await assert.rejects(
        execute("finalize", resign(p, { outputTokens: 4501 })),
        /Invalid analysis usage/,
      );
      assert.equal(
        (
          await db.query(
            "select * from public.cp_analyses where version_id=$1",
            [r.versionId],
          )
        ).rowCount,
        0,
      );
    },
  );
  await t.test(
    "expired payloads, revoked keys and removed membership fail closed",
    async () => {
      await reset();
      const r = await reserve(await create());
      await assert.rejects(
        execute("start", resign(signed(r), { issuedAt: 1, expiresAt: 2 })),
        /Expired/,
      );
      await db.query("reset role");
      await db.query(
        "update private.cp_ai_keys set enabled=false where id='local-test-key'",
      );
      await as(10);
      await assert.rejects(execute("start", signed(r)), /key unavailable/);
      await db.query("reset role");
      await db.query(
        "update private.cp_ai_keys set enabled=true where id='local-test-key'",
      );
      await db.query(
        "delete from public.cp_members where workspace_id=$1 and user_id=$2",
        [uid(1), uid(10)],
      );
      await as(10);
      await assert.rejects(execute("start", signed(r)), /owner required/);
      await db.query("reset role");
      await db.query(
        "insert into public.cp_members values($1,$2,'marketer','Maya')",
        [uid(1), uid(10)],
      );
    },
  );
  await t.test(
    "cross-role and cross-workspace identities cannot claim or finish an execution",
    async () => {
      await reset();
      const r = await reserve(await create()),
        p = await completed(r);
      for (const actor of [11, 12, 13]) {
        await as(actor);
        await assert.rejects(execute("start", signed(r)), /owner required/);
        await assert.rejects(execute("finalize", p), /owner required/);
      }
    },
  );
  await t.test(
    "stale version rejects finalization and never changes current workflow",
    async () => {
      await reset();
      const c = await create(),
        r = await reserve(c);
      await execute("start", signed(r));
      await cmd("revise", c.id, c.v, {
        content: "A revised campaign with different consumer-facing copy.",
      });
      await assert.rejects(
        execute("finalize", await completed(r)),
        /Stale or locked/,
      );
      assert.equal(
        (
          await db.query(
            "select * from public.cp_analyses where version_id=$1",
            [r.versionId],
          )
        ).rowCount,
        0,
      );
    },
  );
  await t.test(
    "atomic finalization is replay-safe, preserves live provenance and leaves human approval separate",
    async () => {
      await reset();
      const c = await create(),
        r = await reserve(c);
      await execute("start", signed(r));
      const p = await completed(r);
      const other = new pg.Client({ connectionString });
      await other.connect();
      await as(10, other);
      try {
        assert.deepEqual(
          await Promise.all([
            execute("finalize", p),
            execute("finalize", p, other),
          ]),
          [c.id, c.id],
        );
      } finally {
        await other.end();
      }
      await assert.rejects(
        execute("finalize", resign(p, { findings: [] })),
        /already finalized/,
      );
      assert.equal(
        (
          await db.query(
            "select * from public.cp_events where version_id=$1 and action='analyze'",
            [c.v],
          )
        ).rowCount,
        1,
      );
      const assessment = (
        await db.query("select * from public.cp_analyses where version_id=$1", [
          c.v,
        ])
      ).rows[0];
      assert.equal(assessment.execution_id, r.id);
      assert.equal(assessment.provider, "openai-responses-v1");
      assert.equal(
        (
          await db.query("select status from public.cp_campaigns where id=$1", [
            c.id,
          ])
        ).rows[0].status,
        "Draft",
      );
      await cmd("submit", c.id, c.v);
      await assert.rejects(
        cmd("approve", c.id, c.v, { note: "Own decision" }),
        /Independent reviewer/,
      );
      await as(11);
      await cmd("approve", c.id, c.v, {
        note: "Reviewed exact fictional terms independently of the model.",
      });
    },
  );
  await t.test(
    "per-user and workspace quotas are durable across requests",
    async () => {
      await reset();
      await db.query("reset role");
      await db.query(
        "update private.cp_ai_limits set per_user_hour=1,per_workspace_day=1",
      );
      await as(10);
      await reserve(await create());
      await assert.rejects(reserve(await create()), /user quota/);
      await as(13);
      await assert.rejects(reserve(await create()), /workspace quota/);
    },
  );
  await t.test(
    "global budget serializes concurrent reservations across workspaces and retains failed spend",
    async () => {
      await reset();
      await db.query("reset role");
      await db.query(
        "update private.cp_ai_limits set total_budget_microusd=200000",
      );
      await db.query(
        "update public.cp_members set role='marketer' where user_id=$1",
        [uid(12)],
      );
      await as(10);
      const a = await create();
      await as(12);
      const b = await create(uid(2));
      await as(10);
      const other = new pg.Client({ connectionString });
      await other.connect();
      await as(12, other);
      try {
        const outcomes = await Promise.allSettled([
          reserve(a),
          reserve(b, randomUUID(), other),
        ]);
        assert.equal(
          outcomes.filter((r) => r.status === "fulfilled").length,
          1,
        );
        const winner = outcomes.find(
          (r) => r.status === "fulfilled",
        ) as PromiseFulfilledResult<Reservation>;
        await as(winner.value.actorId === uid(10) ? 10 : 12);
        await execute("start", signed(winner.value));
        await execute(
          "finalize",
          signed(winner.value, true, {
            outcome: "failed",
            errorCode: "timeout",
          }),
        );
      } finally {
        await other.end();
      }
      await as(10);
      await assert.rejects(reserve(await create()), /global budget/);
      await db.query("reset role");
      assert.equal(
        Number(
          (
            await db.query(
              "select sum(reserved_microusd) amount from private.cp_ai_runs",
            )
          ).rows[0].amount,
        ),
        200000,
      );
      await db.query(
        "update public.cp_members set role='reviewer' where user_id=$1",
        [uid(12)],
      );
    },
  );
  await t.test(
    "server runtime uses stored copy and one signed claim with synthetic provider transport",
    async () => {
      await reset();
      const c = await create();
      let calls = 0;
      const adapter = {
        rpc: async (name: string, args: Record<string, unknown>) => {
          try {
            const keys = Object.keys(args);
            const result = await db.query(
              `select public.${name}(${keys.map((_, i) => "$" + (i + 1)).join(",")}) value`,
              Object.values(args),
            );
            return { data: result.rows[0].value, error: null };
          } catch (error) {
            return { data: null, error };
          }
        },
      } as unknown as Pick<SupabaseClient, "rpc">;
      const run = () =>
        runTrustedAnalysis(
          adapter,
          {
            actorId: uid(10),
            campaignId: c.id,
            versionId: c.v,
            requestId: randomUUID(),
          },
          {
            enabled: true,
            apiKey: "synthetic-not-a-credential",
            keyId: "local-test-key",
            signingSecretHex: synthetic,
            transport: async (_url, init) => {
              calls++;
              assert.ok(
                JSON.parse(String(init?.body)).input.includes(
                  "guaranteed approval",
                ),
              );
              return new Response(
                JSON.stringify({
                  id: "resp_synthetic",
                  status: "completed",
                  usage: { input_tokens: 900, output_tokens: 200 },
                  output: [
                    {
                      type: "message",
                      content: [
                        {
                          type: "output_text",
                          text: JSON.stringify({
                            findings: [
                              {
                                policyId: "CP-101",
                                severity: "High",
                                title: "Approval claim needs evidence",
                                evidence: "guaranteed approval",
                                rationale: "Unsupported guarantee.",
                                replacement: null,
                                uncertainty:
                                  "Approved product terms were not supplied.",
                              },
                            ],
                          }),
                        },
                      ],
                    },
                  ],
                }),
              );
            },
          },
        );
      assert.equal((await run()).alreadyRecorded, false);
      assert.equal((await run()).alreadyRecorded, true);
      assert.equal(calls, 1);
    },
  );

  await t.test(
    "database reservation expiry is enforced independently of signed payload time",
    async () => {
      await reset();
      const original = await reserve(await create());
      const c = await create();
      await db.query("reset role");
      const expired = (
        await db.query(
          `insert into private.cp_ai_runs(request_id,actor_id,workspace_id,campaign_id,version_id,content_hash,policy_bundle,model,key_id,reserved_microusd,created_at,expires_at) select $1,actor_id,workspace_id,$2,$3,content_hash,policy_bundle,model,key_id,reserved_microusd,clock_timestamp()-interval '3 minutes',clock_timestamp()-interval '1 second' from private.cp_ai_runs where id=$4 returning id`,
          [randomUUID(), c.id, c.v, original.id],
        )
      ).rows[0].id;
      await as(10);
      const stale = await reserve(c);
      assert.equal(stale.id, expired);
      const freshSigned = resign(signed(stale), {
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 30,
      });
      await assert.rejects(
        execute("start", freshSigned),
        /reservation expired/,
      );
    },
  );
  await t.test(
    "failed or uncertain runtime calls cannot automatically retry or release global budget",
    async () => {
      await reset();
      const c = await create();
      let calls = 0;
      const adapter = {
        rpc: async (name: string, args: Record<string, unknown>) => {
          try {
            const result = await db.query(
              `select public.${name}(${Object.keys(args)
                .map((_, i) => "$" + (i + 1))
                .join(",")}) value`,
              Object.values(args),
            );
            return { data: result.rows[0].value, error: null };
          } catch (error) {
            return { data: null, error };
          }
        },
      } as unknown as Pick<SupabaseClient, "rpc">;
      const run = () =>
        runTrustedAnalysis(
          adapter,
          {
            actorId: uid(10),
            campaignId: c.id,
            versionId: c.v,
            requestId: randomUUID(),
          },
          {
            enabled: true,
            apiKey: "synthetic-not-a-credential",
            keyId: "local-test-key",
            signingSecretHex: synthetic,
            transport: async () => {
              calls++;
              throw new Error("Synthetic unknown network outcome");
            },
          },
        );
      await assert.rejects(run(), /No assessment was saved/);
      await assert.rejects(run(), /already attempted/);
      assert.equal(calls, 1);
      await db.query("reset role");
      const saved = (
        await db.query(
          "select state,reserved_microusd from private.cp_ai_runs where version_id=$1",
          [c.v],
        )
      ).rows[0];
      assert.equal(saved.state, "failed");
      assert.equal(Number(saved.reserved_microusd), 200000);
    },
  );

  await t.test(
    "untrusted direct reservations cannot consume any allowance",
    async () => {
      await reset();
      const c = await create(),
        request = randomUUID();
      await assert.rejects(
        db.query("select public.cp_reserve_analysis($1,$2,$3,null,null)", [
          c.id,
          c.v,
          request,
        ]),
        /signature/,
      );
      const proof = signReservationRequest(
        {
          actorId: uid(10),
          campaignId: c.id,
          versionId: c.v,
          requestId: request,
        },
        "local-test-key",
        synthetic,
      );
      await assert.rejects(
        db.query("select public.cp_reserve_analysis($1,$2,$3,$4,$5)", [
          c.id,
          c.v,
          request,
          proof.p_payload,
          "0".repeat(64),
        ]),
        /signature/,
      );
      await assert.rejects(
        db.query("select public.cp_reserve_analysis($1,$2,$3,$4,$5)", [
          c.id,
          c.v,
          randomUUID(),
          proof.p_payload,
          proof.p_signature,
        ]),
        /proof mismatch/,
      );
      await db.query("reset role");
      assert.equal(
        (await db.query("select * from private.cp_ai_runs")).rowCount,
        0,
      );
    },
  );
  await t.test(
    "mock analysis cannot race or replace a reserved external execution",
    async () => {
      await reset();
      const c = await create(),
        r = await reserve(c);
      await assert.rejects(cmd("analyze", c.id, c.v), /External analysis owns/);
      await execute("start", signed(r));
      await assert.rejects(cmd("analyze", c.id, c.v), /External analysis owns/);
      await execute(
        "finalize",
        signed(r, true, { outcome: "failed", errorCode: "timeout" }),
      );
      await assert.rejects(cmd("analyze", c.id, c.v), /External analysis owns/);
      assert.equal(
        (
          await db.query(
            "select * from public.cp_analyses where version_id=$1",
            [c.v],
          )
        ).rowCount,
        0,
      );
    },
  );
  await t.test(
    "concurrent mock analysis and external reservation have exactly one owner",
    async () => {
      await reset();
      const c = await create();
      const other = new pg.Client({ connectionString });
      await other.connect();
      await as(10, other);
      try {
        const outcomes = await Promise.allSettled([
          reserve(c),
          other.query("select public.cp_command('analyze',$1,$2,'{}'::jsonb)", [
            c.id,
            c.v,
          ]),
        ]);
        assert.equal(
          outcomes.filter((r) => r.status === "fulfilled").length,
          1,
        );
      } finally {
        await other.end();
      }
      await db.query("reset role");
      const totals = (
        await db.query(
          "select (select count(*) from private.cp_ai_runs where version_id=$1)+(select count(*) from public.cp_analyses where version_id=$1) total",
          [c.v],
        )
      ).rows[0];
      assert.equal(Number(totals.total), 1);
    },
  );
  await db.query("reset role");
}
