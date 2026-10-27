import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { serverClient } from "@/lib/supabase";
import { runTrustedAnalysis } from "@/lib/server/trusted-analysis";
import {
  readJsonBody,
  RequestInputError,
  verifiedRequestOrigin,
  workflowFailure,
} from "@/lib/server/http";
export const maxDuration = 45;
export async function POST(req: NextRequest) {
  if (!verifiedRequestOrigin(req))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  // No enabled value or signing credential is deployed. Public preview never invokes this route.
  if (process.env.CLEARPATH_LIVE_ANALYSIS_ENABLED !== "true")
    return NextResponse.json(
      { error: "Live analysis is not enabled." },
      { status: 503 },
    );
  try {
    const input = z
      .object({
        campaignId: z.uuid(),
        versionId: z.uuid(),
        requestId: z.uuid(),
      })
      .strict()
      .parse(await readJsonBody(req, 2048));
    const db = await serverClient();
    const {
      data: { user },
      error,
    } = await db.auth.getUser();
    if (error || !user)
      return NextResponse.json(
        { error: "Sign in to your workspace." },
        { status: 401 },
      );
    const result = await runTrustedAnalysis(
      db,
      { ...input, actorId: user.id },
      {
        enabled: true,
        apiKey: process.env.OPENAI_API_KEY ?? "",
        keyId: process.env.CLEARPATH_ANALYSIS_KEY_ID ?? "",
        signingSecretHex: process.env.CLEARPATH_ANALYSIS_SIGNING_KEY ?? "",
      },
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const failure =
      error instanceof RequestInputError
        ? { status: error.status, message: error.message }
        : error instanceof z.ZodError
          ? { status: 400, message: "Check the analysis request." }
          : workflowFailure(error);
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status },
    );
  }
}
