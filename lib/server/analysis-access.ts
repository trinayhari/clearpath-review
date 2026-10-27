import "server-only";
// Presentation/runtime gate in addition to the database's authoritative allowlist.
// Missing or malformed configuration defaults every workspace to deterministic mock.
export function liveAnalysisForWorkspace(
  workspaceId: string,
  config: Record<string, string | undefined> = process.env,
): boolean {
  if (config.CLEARPATH_LIVE_ANALYSIS_ENABLED !== "true") return false;
  const ids = (config.CLEARPATH_LIVE_ANALYSIS_WORKSPACES ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      ),
    );
  return ids.includes(workspaceId);
}
