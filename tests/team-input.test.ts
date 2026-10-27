import { test } from "node:test";
import assert from "node:assert/strict";
import { teamCommandSchema } from "../lib/server/team-input";
test("team requests validate bounded names and roles without trusting privilege fields", () => {
  const result = teamCommandSchema.parse({
    action: "create",
    name: " Lending ",
    displayName: " Morgan ",
    is_admin: true,
  });
  assert.deepEqual(result, {
    action: "create",
    name: "Lending",
    displayName: "Morgan",
    role: "marketer",
  });
  assert.throws(() =>
    teamCommandSchema.parse({
      action: "create",
      name: "Lending",
      displayName: "Morgan",
      role: "admin",
    }),
  );
  assert.throws(() =>
    teamCommandSchema.parse({
      action: "create",
      name: "a".repeat(81),
      displayName: "Morgan",
    }),
  );
});
test("join accepts only the complete opaque invitation and strips caller-supplied roles", () => {
  const input = {
    action: "join",
    token: "a".repeat(64),
    displayName: "Alex",
    role: "reviewer",
  };
  assert.deepEqual(teamCommandSchema.parse(input), {
    action: "join",
    token: input.token,
    displayName: "Alex",
  });
  assert.throws(() => teamCommandSchema.parse({ ...input, token: "guess" }));
});
