import "server-only";
import { safeProviderFailure } from "./provider-diagnostics";
import { createHmac, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { products, validateFindings } from "../domain";
import { createOpenAIProvider, OPENAI_PROMPT_VERSION } from "./openai-provider";
const reservationSchema = z.object({
  id: z.uuid(),
  actorId: z.uuid(),
  workspaceId: z.uuid(),
  campaignId: z.uuid(),
  versionId: z.uuid(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  policyBundle: z.literal(OPENAI_PROMPT_VERSION),
  model: z.literal("gpt-5.4-mini-2026-03-17"),
  keyId: z.string().min(1).max(80),
  nonce: z.uuid(),
  state: z.enum(["reserved", "running", "succeeded", "failed"]),
  expiresAt: z.number(),
  content: z.string().min(20).max(20000),
  product: z.enum(products),
  reservedMicrousd: z.literal(200000),
});
export type Reservation = z.infer<typeof reservationSchema>;
export function signAnalysisPayload(
  reservation: Reservation,
  secretHex: string,
  audience: "clearpath-analysis-start-v1" | "clearpath-analysis-finalize-v1",
  extra: Record<string, unknown> = {},
) {
  if (!/^[a-f0-9]{64,128}$/.test(secretHex) || secretHex.length % 2 !== 0)
    throw new Error("Analysis signing configuration is invalid.");
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    ...extra,
    audience,
    executionId: reservation.id,
    actorId: reservation.actorId,
    workspaceId: reservation.workspaceId,
    campaignId: reservation.campaignId,
    versionId: reservation.versionId,
    contentHash: reservation.contentHash,
    policyBundle: reservation.policyBundle,
    model: reservation.model,
    keyId: reservation.keyId,
    nonce: reservation.nonce,
    issuedAt,
    expiresAt: Math.min(issuedAt + 90, Math.floor(reservation.expiresAt)),
  });
  return {
    p_execution: reservation.id,
    p_payload: payload,
    p_signature: createHmac("sha256", Buffer.from(secretHex, "hex"))
      .update(payload, "utf8")
      .digest("hex"),
  };
}
export function signReservationRequest(
  input: {
    actorId: string;
    campaignId: string;
    versionId: string;
    requestId: string;
  },
  keyId: string,
  secretHex: string,
) {
  if (!/^[a-f0-9]{64,128}$/.test(secretHex) || secretHex.length % 2 !== 0)
    throw new Error("Analysis signing configuration is invalid.");
  const issuedAt = Math.floor(Date.now() / 1000);
  const p_payload = JSON.stringify({
    ...input,
    keyId,
    audience: "clearpath-analysis-reserve-v1",
    issuedAt,
    expiresAt: issuedAt + 90,
  });
  return {
    p_payload,
    p_signature: createHmac("sha256", Buffer.from(secretHex, "hex"))
      .update(p_payload, "utf8")
      .digest("hex"),
  };
}
export async function runTrustedAnalysis(
  db: Pick<SupabaseClient, "rpc">,
  input: {
    actorId: string;
    campaignId: string;
    versionId: string;
    requestId: string;
  },
  config: {
    enabled: boolean;
    apiKey: string;
    keyId: string;
    signingSecretHex: string;
    transport?: typeof fetch;
  },
) {
  if (
    !config.enabled ||
    !config.apiKey ||
    !config.keyId ||
    !config.signingSecretHex
  )
    throw new Error("Live analysis is not enabled.");
  const call = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(name, args);
    if (error) throw error;
    return data;
  };
  const reservation = reservationSchema.parse(
    await call("cp_reserve_analysis", {
      p_campaign: input.campaignId,
      p_version: input.versionId,
      p_request: input.requestId,
      ...signReservationRequest(input, config.keyId, config.signingSecretHex),
    }),
  );
  if (
    reservation.actorId !== input.actorId ||
    reservation.campaignId !== input.campaignId ||
    reservation.versionId !== input.versionId ||
    reservation.keyId !== config.keyId ||
    createHash("sha256").update(reservation.content, "utf8").digest("hex") !==
      reservation.contentHash
  )
    throw new Error("Analysis reservation binding is invalid.");
  if (reservation.state === "succeeded")
    return { id: reservation.campaignId, alreadyRecorded: true };
  if (reservation.state !== "reserved")
    throw new Error(
      "This analysis was already attempted. Refresh or create a new version.",
    );
  const claimed = await call(
    "cp_start_analysis",
    signAnalysisPayload(
      reservation,
      config.signingSecretHex,
      "clearpath-analysis-start-v1",
    ),
  );
  if (claimed !== true)
    throw new Error(
      "This analysis is already running or recorded. Refresh before continuing.",
    );
  let findings,
    metadata:
      | { responseId: string; inputTokens: number; outputTokens: number }
      | undefined;
  try {
    const provider = createOpenAIProvider({
      enabled: true,
      apiKey: config.apiKey,
      model: reservation.model,
      transport: config.transport,
      onResponse: (value) => {
        metadata = value;
      },
    });
    findings = validateFindings(
      await provider.analyze(reservation.content, reservation.product),
      reservation.content,
      reservation.product,
    );
    if (!metadata) throw new Error("Analysis usage could not be verified.");
  } catch (error) {
    const failure = safeProviderFailure(error);
    console.warn(
      JSON.stringify({
        event: "clearpath_analysis_failure",
        executionId: reservation.id,
        code: failure.diagnosticCode,
        upstreamStatus: failure.upstreamStatus,
        requestId: failure.requestId,
      }),
    );
    // Never refund uncertain provider spend or retry automatically. Best-effort signed
    // failure records no assessment; even if it cannot finalize, reservation remains.
    try {
      await call(
        "cp_finalize_analysis",
        signAnalysisPayload(
          reservation,
          config.signingSecretHex,
          "clearpath-analysis-finalize-v1",
          { outcome: "failed", errorCode: "provider_error" },
        ),
      );
    } catch {}
    throw failure;
  }
  await call(
    "cp_finalize_analysis",
    signAnalysisPayload(
      reservation,
      config.signingSecretHex,
      "clearpath-analysis-finalize-v1",
      { outcome: "succeeded", findings, ...metadata },
    ),
  );
  return { id: reservation.campaignId, alreadyRecorded: false };
}
