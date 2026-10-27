import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { configured, serverClient } from "@/lib/supabase";
import { teamCommandSchema } from "@/lib/server/team-input";
import {
  readJsonBody,
  RequestInputError,
  verifiedRequestOrigin,
  workflowFailure,
} from "@/lib/server/http";
export async function POST(request: NextRequest) {
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  };
  try {
    if (!verifiedRequestOrigin(request))
      return NextResponse.json(
        { error: "Invalid request origin" },
        { status: 403, headers },
      );
    const input = teamCommandSchema.parse(await readJsonBody(request, 4096));
    if (!configured())
      return NextResponse.json(
        { error: "Teams require a configured authenticated workspace." },
        { status: 503, headers },
      );
    const db = await serverClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user || user.is_anonymous)
      return NextResponse.json(
        { error: "Sign in to manage your teams." },
        { status: 401, headers },
      );
    const { action, ...data } = input;
    const result = await db.rpc("cp_team_command", {
      p_action: action,
      p_data: data,
    });
    if (result.error) throw result.error;
    return NextResponse.json(result.data, { headers });
  } catch (error) {
    const failure =
      error instanceof RequestInputError
        ? { status: error.status, message: error.message }
        : error instanceof z.ZodError
          ? {
              status: 400,
              message:
                "Check the team name, display name, role and invitation.",
            }
          : workflowFailure(error);
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status, headers },
    );
  }
}
