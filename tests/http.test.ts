import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readJsonBody,
  RequestInputError,
  workflowFailure,
} from "../lib/server/http";
const request = (
  body: string,
  headers: Record<string, string> = { "content-type": "application/json" },
) =>
  new Request("https://example.invalid/api", { method: "POST", body, headers });
test("JSON parser caps declared and actual byte size, even without content length", async () => {
  assert.deepEqual(await readJsonBody(request('{"ok":true}')), { ok: true });
  for (const r of [
    request("0123456789"),
    request("{}", {
      "content-type": "application/json",
      "content-length": "999",
    }),
  ])
    await assert.rejects(
      readJsonBody(r, 5),
      (e: unknown) => e instanceof RequestInputError && e.status === 413,
    );
  await assert.rejects(readJsonBody(request("not JSON")), /valid JSON/);
  await assert.rejects(
    readJsonBody(request("{}", { "content-type": "text/plain" })),
    (e: unknown) => e instanceof RequestInputError && e.status === 415,
  );
});
test("workflow errors expose only stable approved messages and classify stale/concurrent actions", () => {
  assert.equal(
    workflowFailure({ message: "Stale version. Refresh before continuing." })
      .status,
    409,
  );
  assert.equal(
    workflowFailure({ message: "Independent reviewer required" }).status,
    403,
  );
  assert.equal(
    workflowFailure({ code: "23505", message: "private table detail" }).status,
    409,
  );
  const unknown = workflowFailure(
    new Error("private query and submitted personal content"),
  );
  assert.equal(unknown.status, 503);
  assert.ok(!unknown.message.includes("private"));
});
test("same-origin validation uses requested host, rejects foreign or forwarded origins and nonsecure remote HTTP", async () => {
  const { verifiedRequestOrigin } = await import("../lib/server/http");
  const make = (origin: string, host: string, forwarded?: string) =>
    new Request("http://0.0.0.0:3000/api/auth", {
      headers: {
        origin,
        host,
        ...(forwarded ? { "x-forwarded-host": forwarded } : {}),
      },
    });
  assert.equal(
    verifiedRequestOrigin(make("http://127.0.0.1:3000", "127.0.0.1:3000")),
    "http://127.0.0.1:3000",
  );
  assert.equal(
    verifiedRequestOrigin(
      make(
        "https://clearpath-review-livid.vercel.app",
        "clearpath-review-livid.vercel.app",
      ),
    ),
    "https://clearpath-review-livid.vercel.app",
  );
  assert.equal(
    verifiedRequestOrigin(
      make(
        "https://evil.invalid",
        "clearpath-review-livid.vercel.app",
        "evil.invalid",
      ),
    ),
    null,
  );
  assert.equal(
    verifiedRequestOrigin(
      make(
        "http://clearpath-review-livid.vercel.app",
        "clearpath-review-livid.vercel.app",
      ),
    ),
    null,
  );
  assert.equal(
    verifiedRequestOrigin(make("null", "clearpath-review-livid.vercel.app")),
    null,
  );
});
