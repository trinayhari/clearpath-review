import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emailRateLimitMessage,
  setAccountPassword,
} from "../lib/server/account-auth";
const auth = (value: unknown) => value as SupabaseClient["auth"];
test("email quota is distinct from request throttling and promises no reset time", () => {
  assert.match(
    emailRateLimitMessage({ code: "over_email_send_rate_limit", status: 429 })!,
    /sending limit/,
  );
  assert.doesNotMatch(
    emailRateLimitMessage({ code: "over_email_send_rate_limit" })!,
    /minute/,
  );
  assert.match(
    emailRateLimitMessage({ code: "over_request_rate_limit" })!,
    /few minutes/,
  );
  assert.equal(emailRateLimitMessage({ status: 500 }), null);
});
test("password changes require a verified nonanonymous user before invoking updateUser", async () => {
  for (const user of [
    null,
    { id: "u" },
    { id: "u", email_confirmed_at: "now", is_anonymous: true },
  ]) {
    let writes = 0;
    const result = await setAccountPassword(
      auth({
        getUser: async () => ({ data: { user }, error: null }),
        updateUser: async () => {
          writes++;
        },
      }),
      "synthetic-test-password",
    );
    assert.equal(result.status, 401);
    assert.equal(writes, 0);
  }
});
test("password update sends only the entered password and safely handles Auth rejection", async () => {
  const getUser = async () => ({
    data: { user: { id: "u", email_confirmed_at: "now" } },
    error: null,
  });
  let input: unknown;
  const result = await setAccountPassword(
    auth({
      getUser,
      updateUser: async (value: unknown) => {
        input = value;
        return { error: null };
      },
    }),
    "synthetic-test-password",
  );
  assert.deepEqual(input, { password: "synthetic-test-password" });
  assert.equal(result.status, 200);
  const rejected = await setAccountPassword(
    auth({
      getUser,
      updateUser: async () => ({
        error: {
          code: "reauthentication_needed",
          message: "private internal detail",
        },
      }),
    }),
    "synthetic-test-password",
  );
  assert.match(rejected.error!, /fresh sign-in/);
  assert.doesNotMatch(rejected.error!, /private internal/);
});
