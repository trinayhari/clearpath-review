import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { passwordAuth } from "../lib/server/password-auth";
const user = {
  id: "auth-owned-id",
  email_confirmed_at: null,
  is_anonymous: false,
};
const input = {
  action: "signup" as const,
  email: "fictional@example.invalid",
  password: "synthetic-password-only",
};
function fixture(
  options: {
    collision?: boolean;
    session?: boolean;
    interrupted?: boolean;
    anonymous?: boolean;
  } = {},
) {
  const calls: unknown[] = [];
  let reads = 0;
  return {
    calls,
    db: {
      auth: {
        getUser: async () => ({
          data: {
            user:
              ++reads === 1
                ? null
                : { ...user, is_anonymous: options.anonymous ?? false },
          },
          error: null,
        }),
        signUp: async (payload: unknown) => {
          calls.push(payload);
          return {
            data: {
              session:
                options.session === false
                  ? null
                  : { access_token: "synthetic" },
            },
            error: options.collision ? { code: "user_already_exists" } : null,
          };
        },
        updateUser: async () => {
          throw new Error("Must never reset existing credentials");
        },
        signInWithPassword: async () => {
          throw new Error("Signup must not silently sign in another identity");
        },
      },
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        return {
          error: options.interrupted
            ? { message: "database unavailable" }
            : null,
        };
      },
    } as unknown as Pick<SupabaseClient, "auth" | "rpc">,
  };
}
test("signup uses only email/password and authenticates session before fixed no-argument initialization", async () => {
  const { calls, db } = fixture();
  const result = await passwordAuth(db, input);
  assert.equal(result.status, 200);
  assert.deepEqual(calls, [
    { email: input.email, password: input.password },
    { name: "cp_initialize_workspace", args: undefined },
  ]);
});
test("existing email collision never resets credentials or provisions workspace", async () => {
  const { calls, db } = fixture({ collision: true });
  assert.equal((await passwordAuth(db, input)).status, 400);
  assert.equal(calls.length, 1);
});
test("signup without session or with anonymous identity never provisions membership", async () => {
  for (const options of [{ session: false }, { anonymous: true }]) {
    const { calls, db } = fixture(options);
    assert.notEqual((await passwordAuth(db, input)).status, 200);
    assert.equal(calls.length, 1);
  }
});
test("interrupted setup preserves successful session and signals retry without a second signup", async () => {
  const { db } = fixture({ interrupted: true });
  assert.deepEqual(await passwordAuth(db, input), {
    status: 200,
    ok: true,
    onboardingPending: true,
  });
});
