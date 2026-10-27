import "server-only";
const messages = {
  refusal:
    "The provider declined to assess this copy. No assessment was saved; human review is required.",
  incomplete_output:
    "The provider returned an incomplete analysis. No assessment was saved. Create a revised version before retrying.",
  output_token_limit:
    "The analysis reached its output limit before completing. No assessment was saved. Create a revised version before retrying.",
  invalid_json:
    "The provider returned invalid response JSON. No assessment was saved.",
  invalid_output_schema:
    "The analysis response did not match the required finding schema. No assessment was saved.",
  invalid_evidence:
    "The analysis response failed exact-evidence or policy verification. No assessment was saved.",
  invalid_usage:
    "The provider returned invalid usage metadata. No assessment was saved.",
  response_limit:
    "The provider response exceeded its size limit. No assessment was saved.",
  authentication:
    "The analysis provider rejected the server credential. Your draft is saved; the workspace owner must check the provider configuration.",
  permission:
    "The analysis provider denied this project's access. Your draft is saved; the workspace owner must check model permissions.",
  model_unavailable:
    "The configured analysis model is unavailable to this project. Your draft is saved.",
  insufficient_quota:
    "The analysis provider has no available quota or billing allowance. Your draft is saved; the workspace owner must check the provider account.",
  rate_limited:
    "The analysis provider is rate limited. No assessment was saved. Try a new revision later.",
  invalid_schema:
    "The analysis provider rejected the structured-output schema. No assessment was saved; this requires an application fix.",
  invalid_request:
    "The analysis provider rejected the request format. No assessment was saved; this requires an application fix.",
  network:
    "The analysis provider could not be reached in time. No assessment was saved. Create a revised version before retrying.",
  invalid_output:
    "The analysis response failed validation. No assessment was saved. Create a revised version before retrying.",
  provider_unavailable:
    "The analysis provider is unavailable. No assessment was saved. Create a revised version before retrying.",
} as const;
export type ProviderFailureCode = keyof typeof messages;
export class ProviderFailure extends Error {
  constructor(
    readonly diagnosticCode: ProviderFailureCode,
    readonly upstreamStatus?: number,
    readonly requestId?: string,
  ) {
    super(messages[diagnosticCode]);
  }
}
export function safeProviderFailure(error: unknown): ProviderFailure {
  return error instanceof ProviderFailure
    ? error
    : new ProviderFailure("invalid_output");
}
export async function providerHttpFailure(
  response: Response,
): Promise<ProviderFailure> {
  // Error bodies may echo credentials or input. Read at most 16KB; retain ONLY
  // a small allowlisted code and sanitized request ID, never raw message/body.
  const reader = response.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 16000) {
          await reader.cancel();
          chunks.length = 0;
          break;
        }
        chunks.push(value);
      }
    } catch {
      chunks.length = 0;
    }
  }
  let upstreamCode: unknown;
  try {
    const bytes = new Uint8Array(chunks.reduce((n, x) => n + x.length, 0));
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    upstreamCode = JSON.parse(new TextDecoder().decode(bytes))?.error?.code;
  } catch {}
  const code: ProviderFailureCode =
    response.status === 401
      ? "authentication"
      : response.status === 403
        ? "permission"
        : response.status === 404
          ? "model_unavailable"
          : upstreamCode === "insufficient_quota"
            ? "insufficient_quota"
            : response.status === 429
              ? "rate_limited"
              : upstreamCode === "invalid_json_schema"
                ? "invalid_schema"
                : response.status === 400
                  ? "invalid_request"
                  : "provider_unavailable";
  const rawId = response.headers.get("x-request-id") ?? "";
  return new ProviderFailure(
    code,
    response.status,
    /^req_[A-Za-z0-9_-]{1,96}$/.test(rawId) ? rawId : undefined,
  );
}
export async function checkModelAccess(
  apiKey: string,
  transport: typeof fetch = fetch,
) {
  if (!apiKey) throw new ProviderFailure("authentication");
  let response: Response;
  try {
    response = await transport(
      "https://api.openai.com/v1/models/gpt-5.4-mini-2026-03-17",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    throw new ProviderFailure("network");
  }
  if (!response.ok) throw await providerHttpFailure(response);
  await response.body?.cancel();
  return {
    accessible: true,
    model: "gpt-5.4-mini-2026-03-17",
    note: "Model access verified. This does not verify billing capacity or analysis success.",
  };
}
