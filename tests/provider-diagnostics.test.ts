import { test } from "node:test";
import assert from "node:assert/strict";
import {
  providerHttpFailure,
  checkModelAccess,
  safeProviderFailure,
} from "../lib/server/provider-diagnostics";
import { workflowFailure } from "../lib/server/http";
test("provider diagnostics preserve only allowlisted failure category and never raw echoed secrets", async () => {
  const error = await providerHttpFailure(
    new Response(
      JSON.stringify({
        error: {
          code: "invalid_api_key",
          message: "secret-key-and-private-copy",
        },
      }),
      { status: 401, headers: { "x-request-id": "req_test123" } },
    ),
  );
  assert.equal(error.diagnosticCode, "authentication");
  assert.equal(error.requestId, "req_test123");
  assert.doesNotMatch(JSON.stringify(error), /secret-key/);
  assert.doesNotMatch(error.message, /private-copy/);
  assert.equal(workflowFailure(error).status, 503);
  assert.match(workflowFailure(error).message, /server credential/);
});
test("oversized provider errors are bounded; unknown errors never echo their message", async () => {
  const error = await providerHttpFailure(
    new Response("x".repeat(20000), { status: 400 }),
  );
  assert.equal(error.diagnosticCode, "invalid_request");
  assert.equal(
    safeProviderFailure(new Error("private payload")).diagnosticCode,
    "invalid_output",
  );
});
test("model access diagnostic only retrieves fixed metadata and returns no provider body", async () => {
  const result = await checkModelAccess("synthetic", async (url, init) => {
    assert.equal(
      url,
      "https://api.openai.com/v1/models/gpt-5.4-mini-2026-03-17",
    );
    assert.equal(init?.method, "GET");
    assert.equal(init?.body, undefined);
    return new Response(JSON.stringify({ private: "not returned" }));
  });
  assert.equal(result.accessible, true);
  assert.doesNotMatch(JSON.stringify(result), /not returned/);
});
