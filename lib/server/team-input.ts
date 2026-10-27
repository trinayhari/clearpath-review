import { z } from "zod";
const name = z.string().trim().min(2).max(80);
export const teamCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name,
    displayName: name,
    role: z.enum(["marketer", "reviewer"]).default("marketer"),
  }),
  z.object({
    action: z.literal("invite"),
    workspaceId: z.uuid(),
    role: z.enum(["marketer", "reviewer"]),
  }),
  z.object({
    action: z.literal("join"),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    displayName: name,
  }),
  z.object({ action: z.literal("rename"), workspaceId: z.uuid(), name }),
  z.object({
    action: z.literal("revoke"),
    workspaceId: z.uuid(),
    inviteId: z.uuid(),
  }),
]);
