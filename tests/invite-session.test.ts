import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  inspectInvitation,
  acceptInvitation,
} from "../lib/server/invite-session";
const user = {
  id: "verified-user",
  email: "fictional@example.invalid",
  email_confirmed_at: "2026-10-27",
  is_anonymous: false,
};
const asAuth = (value: unknown) => value as SupabaseClient["auth"];
test("invite preview uses verified Auth identity and never establishes cookies", async () => {
  const identity = await inspectInvitation(
    asAuth({ getUser: async () => ({ data: { user }, error: null }) }),
    "synthetic-access",
  );
  assert.equal(identity.email, user.email);
  await assert.rejects(
    inspectInvitation(
      asAuth({
        getUser: async () => ({
          data: { user: null },
          error: { message: "invalid" },
        }),
      }),
      "synthetic-access",
    ),
  );
  await assert.rejects(
    inspectInvitation(
      asAuth({
        getUser: async () => ({
          data: { user: { ...user, is_anonymous: true } },
          error: null,
        }),
      }),
      "synthetic-access",
    ),
  );
});
test("invite acceptance verifies refresh ownership before installing session cookies", async () => {
  let installed = 0;
  const cookies = asAuth({
    setSession: async () => {
      installed++;
      return { data: { user }, error: null };
    },
  });
  const verifier = (refreshedUser = user) =>
    asAuth({
      getUser: async () => ({ data: { user }, error: null }),
      refreshSession: async () => ({
        data: {
          user: refreshedUser,
          session: {
            access_token: "synthetic-new",
            refresh_token: "synthetic-refresh",
          },
        },
        error: null,
      }),
    });
  const input = {
    accessToken: "synthetic-access",
    refreshToken: "synthetic-refresh",
    expectedUserId: user.id,
  };
  await assert.rejects(
    acceptInvitation(verifier(), cookies, {
      ...input,
      expectedUserId: "wrong",
    }),
  );
  await assert.rejects(
    acceptInvitation(verifier({ ...user, id: "another-user" }), cookies, input),
  );
  assert.equal(installed, 0);
  await acceptInvitation(verifier(), cookies, input);
  assert.equal(installed, 1);
});
