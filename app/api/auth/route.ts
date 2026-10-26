import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { z } from "zod";
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== req.nextUrl.origin)
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const input = z
      .object({
        action: z.enum(["login", "logout"]),
        email: z.email().optional(),
        password: z.string().min(8).max(200).optional(),
      })
      .parse(await req.json());
    const db = await serverClient();
    const { error } =
      input.action === "logout"
        ? await db.auth.signOut()
        : await db.auth.signInWithPassword({
            email: input.email!,
            password: input.password!,
          });
    if (error)
      return NextResponse.json(
        { error: "Sign in failed. Check your email and password." },
        { status: 400 },
      );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      {
        error: "Sign in is unavailable. Contact your workspace administrator.",
      },
      { status: 400 },
    );
  }
}
