import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import {
  inspectInvitation,
  acceptInvitation,
} from "@/lib/server/invite-session";
import {
  verifiedRequestOrigin,
  readJsonBody,
  RequestInputError,
} from "@/lib/server/http";
import {
  emailRateLimitMessage,
  setAccountPassword,
} from "@/lib/server/account-auth";
import { passwordAuth } from "@/lib/server/password-auth";
const inputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("login"),
    email: z.email().max(254),
    password: z.string().min(8).max(200),
  }),
  z
    .object({
      action: z.literal("signup"),
      email: z.email().max(254),
      password: z.string().min(12).max(200),
    })
    .strict(),
  z.object({ action: z.literal("initialize_workspace") }).strict(),
  z.object({ action: z.literal("email_link"), email: z.email().max(254) }),
  z.object({
    action: z.literal("exchange"),
    code: z.string().min(1).max(4096),
  }),
  z.object({
    action: z.literal("verify_link"),
    tokenHash: z.string().min(1).max(4096),
    type: z.enum(["email", "invite", "recovery"]),
  }),
  z.object({
    action: z.literal("preview_invite"),
    accessToken: z.string().min(20).max(6000),
  }),
  z.object({
    action: z.literal("accept_invite"),
    accessToken: z.string().min(20).max(6000),
    refreshToken: z.string().min(10).max(1000),
    expectedUserId: z.uuid(),
  }),
  z.object({ action: z.literal("logout") }),
  z
    .object({
      action: z.literal("set_password"),
      password: z.string().min(12).max(200),
    })
    .strict(),
]);
export async function POST(req: NextRequest) {
  try {
    if (!verifiedRequestOrigin(req))
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    const input = inputSchema.parse(await readJsonBody(req, 8192)),
      db = await serverClient();
    if (input.action === "signup" || input.action === "login") {
      const result = await passwordAuth(db, input);
      return NextResponse.json(result, {
        status: result.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (input.action === "initialize_workspace") {
      const {
        data: { user },
        error,
      } = await db.auth.getUser();
      if (error || !user || user.is_anonymous)
        return NextResponse.json(
          { error: "Sign in to initialize your workspace." },
          { status: 401 },
        );
      const result = await db.rpc("cp_initialize_workspace");
      if (result.error)
        return NextResponse.json(
          {
            error:
              "Your account is signed in, but workspace setup could not finish. Retry without creating another account.",
          },
          { status: 503 },
        );
      return NextResponse.json({ ok: true });
    }
    if (input.action === "set_password") {
      const result = await setAccountPassword(db.auth, input.password);
      return NextResponse.json(result, {
        status: result.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (input.action === "preview_invite" || input.action === "accept_invite") {
      const verifier = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      );
      try {
        const identity =
          input.action === "preview_invite"
            ? await inspectInvitation(verifier.auth, input.accessToken)
            : await acceptInvitation(verifier.auth, db.auth, input);
        return NextResponse.json(
          { ok: true, ...identity },
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch {
        return NextResponse.json(
          {
            error:
              "This invitation is invalid or expired. Request a new invitation.",
          },
          { status: 400 },
        );
      }
    }
    if (input.action === "email_link") {
      // Never creates a public signup or grants membership. Generic reply avoids email enumeration.
      const { error } = await db.auth.signInWithOtp({
        email: input.email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${verifiedRequestOrigin(req)}/auth/confirm`,
        },
      });
      const rateMessage = error && emailRateLimitMessage(error);
      if (rateMessage)
        return NextResponse.json({ error: rateMessage }, { status: 429 });
      if (error && error.status && error.status >= 500)
        return NextResponse.json(
          {
            error:
              "Email sign-in is temporarily unavailable. Try again shortly.",
          },
          { status: 503 },
        );
      return NextResponse.json(
        {
          ok: true,
          message:
            "If this email has an account, a sign-in link is on its way. Open it in this browser.",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const result =
      input.action === "logout"
        ? await db.auth.signOut({ scope: "local" })
        : input.action === "exchange"
          ? await db.auth.exchangeCodeForSession(input.code)
          : await db.auth.verifyOtp({
              token_hash: input.tokenHash,
              type: input.type,
            });
    if (result.error)
      return NextResponse.json(
        {
          error:
            input.action === "logout"
              ? "Unable to sign out. Please try again."
              : "This sign-in link is invalid or expired. Request a new link.",
        },
        { status: 400 },
      );
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof RequestInputError
            ? e.message
            : e instanceof z.ZodError
              ? "Check the required sign-in fields."
              : "Sign-in is temporarily unavailable. Please try again.",
      },
      {
        status:
          e instanceof RequestInputError
            ? e.status
            : e instanceof z.ZodError
              ? 400
              : 503,
      },
    );
  }
}
