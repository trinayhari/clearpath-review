import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { z } from "zod";
const inputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("login"),
    email: z.email(),
    password: z.string().min(8).max(200),
  }),
  z.object({ action: z.literal("email_link"), email: z.email() }),
  z.object({
    action: z.literal("exchange"),
    code: z.string().min(1).max(4096),
  }),
  z.object({
    action: z.literal("verify_link"),
    tokenHash: z.string().min(1).max(4096),
    type: z.enum(["email", "invite", "recovery"]),
  }),
  z.object({ action: z.literal("logout") }),
]);
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== req.nextUrl.origin)
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    const input = inputSchema.parse(await req.json()),
      db = await serverClient();
    if (input.action === "email_link") {
      // Never creates a public signup or grants membership. Generic reply avoids email enumeration.
      const { error } = await db.auth.signInWithOtp({
        email: input.email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${req.nextUrl.origin}/auth/confirm`,
        },
      });
      if (error && error.status === 429)
        return NextResponse.json(
          {
            error:
              "Please wait a minute before requesting another sign-in link.",
          },
          { status: 429 },
        );
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
        : input.action === "login"
          ? await db.auth.signInWithPassword({
              email: input.email,
              password: input.password,
            })
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
            input.action === "login"
              ? "Unable to sign in. Check your email and password."
              : input.action === "logout"
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
          e instanceof z.ZodError
            ? "Check the required sign-in fields."
            : "Sign-in is temporarily unavailable. Please try again.",
      },
      { status: 400 },
    );
  }
}
