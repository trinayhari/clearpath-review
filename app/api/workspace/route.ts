import { NextRequest, NextResponse } from "next/server";
import { serverClient, configured } from "@/lib/supabase";
import { contentSchema, safeAssessment } from "@/lib/domain";
import { z } from "zod";
import { liveAnalysisForWorkspace } from "@/lib/server/analysis-access";
import { randomUUID } from "node:crypto";
import { runTrustedAnalysis } from "@/lib/server/trusted-analysis";
import {
  verifiedRequestOrigin,
  readJsonBody,
  RequestInputError,
  workflowFailure,
} from "@/lib/server/http";
export const maxDuration = 45;
const command = z.object({
  action: z.enum([
    "create",
    "revise",
    "analyze",
    "submit",
    "assign",
    "close",
    "reopen",
    "delete",
    "restore",
    "comment",
    "approve",
    "reject",
    "request_changes",
  ]),
  requestId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  versionId: z.string().uuid().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});
export async function GET() {
  try {
    const db = await serverClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Sign in to your workspace." },
        { status: 401 },
      );
    const results = await Promise.all(
      [
        "cp_members",
        "cp_campaigns",
        "cp_versions",
        "cp_analyses",
        "cp_events",
        "cp_workspaces",
      ].map((t) => db.from(t).select("*")),
    );
    for (const r of results) if (r.error) throw r.error;
    const [members, campaigns, versions, analyses, events, workspaces] =
      results.map((r) => r.data!);
    return NextResponse.json(
      {
        analysisMode: "mock",
        userId: user.id,
        email: user.email,
        members: members.map((m) => ({
          ...m,
          is_admin: workspaces.some(
            (w) => w.id === m.workspace_id && w.owner_id === m.user_id,
          ),
        })),
        workspaces: workspaces.map((w) => ({
          ...w,
          analysisMode: liveAnalysisForWorkspace(w.id) ? "openai" : "mock",
        })),
        campaigns: campaigns.map((c) => ({
          id: c.id,
          workspaceId: c.workspace_id,
          title: c.title,
          product: c.product,
          channel: c.channel,
          status: c.status,
          lifecycle: c.lifecycle ?? "open",
          closedAt: c.closed_at ?? undefined,
          deletedAt: c.deleted_at ?? undefined,
          ownerId: c.owner_id,
          reviewerId: c.reviewer_id ?? undefined,
          reviewer: members.find(
            (m) =>
              m.user_id === c.reviewer_id && m.workspace_id === c.workspace_id,
          )?.display_name,
          owner:
            members.find(
              (m) =>
                m.user_id === c.owner_id && m.workspace_id === c.workspace_id,
            )?.display_name ?? "Team member",
          updatedAt: c.updated_at,
          submittedAt: c.submitted_at,
          decidedAt: c.decided_at,
          versions: versions
            .filter((v) => v.campaign_id === c.id)
            .sort((a, b) => a.number - b.number)
            .map((v) => ({
              id: v.id,
              number: v.number,
              content: v.content,
              createdAt: v.created_at,
              ...safeAssessment(
                analyses.find((a) => a.version_id === v.id),
                v.content,
                c.product,
              ),
            })),
          events: events
            .filter((e) => e.campaign_id === c.id)
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((e) => ({
              id: e.id,
              actor:
                members.find(
                  (m) =>
                    m.user_id === e.actor_id &&
                    m.workspace_id === c.workspace_id,
                )?.display_name ?? "Team member",
              action: e.action,
              versionId: e.version_id,
              at: e.created_at,
              note: e.note,
            })),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Workspace could not be loaded. Check configuration and try again.",
      },
      { status: 503 },
    );
  }
}
export async function POST(req: NextRequest) {
  try {
    if (!configured())
      return NextResponse.json(
        { error: "Authenticated workspace is not configured." },
        { status: 503 },
      );
    if (!verifiedRequestOrigin(req))
      return NextResponse.json(
        { error: "Invalid request origin" },
        { status: 403 },
      );
    const db = await serverClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    const input = command.parse(await readJsonBody(req));
    if (input.action === "create")
      input.data = {
        ...contentSchema.parse(input.data),
        workspaceId: z.string().uuid().parse(input.data.workspaceId),
      };
    if (input.action === "revise")
      input.data = {
        content: z.string().trim().min(20).max(20000).parse(input.data.content),
      };
    if (
      ["comment", "approve", "reject", "request_changes"].includes(input.action)
    )
      input.data = {
        note: z.string().trim().min(3).max(4000).parse(input.data.note),
      };
    if (["close", "reopen", "delete", "restore"].includes(input.action))
      input.data = {
        note: z.string().trim().max(4000).optional().parse(input.data.note),
      };
    if (input.action === "assign")
      input.data = { reviewerId: z.uuid().parse(input.data.reviewerId) };
    if (input.action === "submit")
      input.data = {
        reviewerId: z.uuid().optional().parse(input.data.reviewerId),
      };
    let useLiveAnalysis = false;
    if (
      input.action === "analyze" &&
      process.env.CLEARPATH_LIVE_ANALYSIS_ENABLED === "true"
    ) {
      const campaign = await db
        .from("cp_campaigns")
        .select("workspace_id")
        .eq("id", z.uuid().parse(input.campaignId))
        .single();
      if (campaign.error || !campaign.data)
        return NextResponse.json(
          { error: "Campaign access denied." },
          { status: 403 },
        );
      useLiveAnalysis = liveAnalysisForWorkspace(campaign.data.workspace_id);
    }
    if (input.action === "analyze" && useLiveAnalysis) {
      const result = await runTrustedAnalysis(
        db,
        {
          actorId: user.id,
          campaignId: z.uuid().parse(input.campaignId),
          versionId: z.uuid().parse(input.versionId),
          requestId: input.requestId ?? randomUUID(),
        },
        {
          enabled: true,
          apiKey: process.env.OPENAI_API_KEY ?? "",
          keyId: process.env.CLEARPATH_ANALYSIS_KEY_ID ?? "",
          signingSecretHex: process.env.CLEARPATH_ANALYSIS_SIGNING_KEY ?? "",
        },
      );
      return NextResponse.json(result);
    }
    if (input.action === "analyze") input.data = {}; // Database computes trusted mock findings from stored copy.
    const { data, error } = await db.rpc("cp_command", {
      p_action: input.action,
      p_campaign: input.campaignId ?? null,
      p_version: input.versionId ?? null,
      p_data: input.data,
    });
    if (error) {
      const failure = workflowFailure(error);
      return NextResponse.json(
        { error: failure.message },
        { status: failure.status },
      );
    }
    return NextResponse.json({ id: data });
  } catch (e) {
    const failure =
      e instanceof RequestInputError
        ? { status: e.status, message: e.message }
        : e instanceof z.ZodError
          ? { status: 400, message: "Please check your input." }
          : workflowFailure(e);
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status },
    );
  }
}
