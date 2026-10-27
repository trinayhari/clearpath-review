import { ProviderFailure } from "./provider-diagnostics";
export class RequestInputError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export async function readJsonBody(
  request: Request,
  maxBytes = 100_000,
): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new RequestInputError("Send a JSON request.", 415);
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes))
    throw new RequestInputError("Request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestInputError("A request body is required.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new RequestInputError("Request is too large.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new RequestInputError("Send valid JSON.");
  }
}
const workflowMessages: Record<string, { status: number; message: string }> = {
  "Team owner required": {
    status: 403,
    message: "Only the team owner can manage this team or invite people.",
  },
  "Campaign owner or team owner required": {
    status: 403,
    message: "Only the submission owner or team owner can assign its reviewer.",
  },
  "Assigned reviewer required": {
    status: 403,
    message: "Only the assigned compliance reviewer can record this decision.",
  },
  "Choose a compliance reviewer from this team": {
    status: 400,
    message:
      "Choose a compliance reviewer from this team. Invite a reviewer in Teams if none are available.",
  },
  "Invite is invalid, expired or already used": {
    status: 400,
    message:
      "This invitation is invalid, expired or already used. Ask the team owner for a new invitation.",
  },
  "You already belong to this team": {
    status: 409,
    message:
      "You already belong to this team. Your current role has not changed.",
  },
  "Invite not found": {
    status: 404,
    message: "This invitation is unavailable.",
  },
  "Team name must be 2 to 80 characters": {
    status: 400,
    message: "Enter a team name of 2 to 80 characters.",
  },
  "Display name must be 2 to 80 characters": {
    status: 400,
    message: "Enter a display name of 2 to 80 characters.",
  },
  "Invalid team role": {
    status: 400,
    message: "Choose Marketing or Compliance reviewer.",
  },
  "Authenticated account required": {
    status: 401,
    message: "Sign in with your own account to continue.",
  },
  "Live analysis is not enabled": {
    status: 503,
    message: "Live analysis is not enabled for this workspace.",
  },
  "Analysis user quota reached": {
    status: 429,
    message: "Your analysis request limit has been reached. Try again later.",
  },
  "Analysis workspace quota reached": {
    status: 429,
    message: "This workspace’s analysis request limit has been reached.",
  },
  "Analysis global budget exhausted": {
    status: 429,
    message:
      "The approved analysis budget has been reserved. No further calls will run.",
  },
  "Analysis reservation expired": {
    status: 409,
    message:
      "This analysis reservation expired. Create a revised version before retrying.",
  },
  "Stale or locked analysis version": {
    status: 409,
    message:
      "The campaign changed during analysis. Refresh to review the current version.",
  },
  "This analysis was already attempted. Refresh or create a new version.": {
    status: 409,
    message:
      "This analysis was already attempted. Refresh or create a new version.",
  },
  "Authentication required": {
    status: 401,
    message: "Your session expired. Sign in again to continue.",
  },
  "Marketer membership required": {
    status: 403,
    message: "A marketer membership is required for this workspace.",
  },
  "Workspace access denied": {
    status: 403,
    message: "You do not have access to this workspace.",
  },
  "Independent reviewer required": {
    status: 403,
    message: "An independent reviewer must record this decision.",
  },
  "Campaign owner required": {
    status: 403,
    message: "Only the campaign owner can perform this action.",
  },
  "Campaign not found": {
    status: 404,
    message: "This campaign is unavailable in your workspace.",
  },
  "Stale version. Refresh before continuing.": {
    status: 409,
    message: "This version changed. Refresh before continuing.",
  },
  "Campaign is locked": {
    status: 409,
    message:
      "This submitted version is locked. Refresh to see its current status.",
  },
  "Only a submitted version can be decided": {
    status: 409,
    message: "Only a version awaiting review can receive a decision.",
  },
  "Create a revised version before resubmitting": {
    status: 409,
    message:
      "Create a new version to address the previous decision before submitting.",
  },
  "Trusted precheck required. Create a revision if a legacy assessment exists.":
    {
      status: 409,
      message: "Run a fresh precheck on this version before submitting.",
    },
  "Trusted precheck required before approval": {
    status: 409,
    message: "This version needs a trusted precheck before it can be approved.",
  },
  "Decision rationale required": {
    status: 400,
    message: "Explain the reason for your decision.",
  },
  "Comment required": {
    status: 400,
    message: "Enter a comment before posting.",
  },
  "Client-supplied findings are not accepted": {
    status: 400,
    message:
      "Assessment results must be generated by the trusted analysis service.",
  },
};
export function workflowFailure(error: unknown): {
  status: number;
  message: string;
} {
  if (error instanceof ProviderFailure)
    return {
      status: error.diagnosticCode === "rate_limited" ? 429 : 503,
      message: error.message,
    };
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    const known = workflowMessages[error.message];
    if (known) return known;
    if ("code" in error && error.code === "23505")
      return {
        status: 409,
        message:
          "This action is already recorded. Refresh the workspace before continuing.",
      };
  }
  return {
    status: 503,
    message:
      "The action could not be confirmed. Refresh the workspace before retrying.",
  };
}
// Next's internal request URL may use the bind address behind a proxy. The browser's
// Origin must instead match the externally requested Host. Never trust a supplied
// X-Forwarded-Host; browsers cannot set Host on cross-origin fetch requests.
export function verifiedRequestOrigin(request: Request): string | null {
  const raw = request.headers.get("origin"),
    host = request.headers.get("host");
  if (!raw || !host) return null;
  try {
    const origin = new URL(raw);
    if (
      raw !== origin.origin ||
      origin.host.toLowerCase() !== host.toLowerCase()
    )
      return null;
    if (
      origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(origin.hostname)
      )
    )
      return null;
    return origin.origin;
  } catch {
    return null;
  }
}
