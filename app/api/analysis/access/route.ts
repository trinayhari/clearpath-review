import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { serverClient } from "@/lib/supabase";
import { liveAnalysisForWorkspace } from "@/lib/server/analysis-access";
import {
  checkModelAccess,
  safeProviderFailure,
} from "@/lib/server/provider-diagnostics";
import {
  readJsonBody,
  verifiedRequestOrigin,
  RequestInputError,
} from "@/lib/server/http";
export const maxDuration = 15;
// Read-only provider permission diagnostic for the approved live workspace.
// No inference, campaign copy, key value, provider body, or account metadata returned.
export async function POST(req: NextRequest) {
  if (!verifiedRequestOrigin(req))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  try {
    const { workspaceId } = z
      .object({ workspaceId: z.uuid() })
      .strict()
      .parse(await readJsonBody(req, 1024));
    if (!liveAnalysisForWorkspace(workspaceId))
      return NextResponse.json(
        { error: "Provider diagnostics are not enabled for this workspace." },
        { status: 403 },
      );
    const db = await serverClient();
    const {
      data: { user },
      error,
    } = await db.auth.getUser();
    if (error || !user || user.is_anonymous)
      return NextResponse.json(
        { error: "Sign in to your workspace." },
        { status: 401 },
      );
    const member = await db
      .from("cp_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();
    if (member.error || member.data?.role !== "marketer")
      return NextResponse.json(
        { error: "Workspace marketer access required." },
        { status: 403 },
      );
    try {
      return NextResponse.json(
        await checkModelAccess(process.env.OPENAI_API_KEY ?? ""),
      );
    } catch (error) {
      const failure = safeProviderFailure(error);
      return NextResponse.json(
        {
          error: failure.message,
          code: failure.diagnosticCode,
          upstreamStatus: failure.upstreamStatus,
        },
        { status: 503 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Provider diagnostic request could not complete." },
      {
        status:
          error instanceof RequestInputError
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : 503,
      },
    );
  }
}
