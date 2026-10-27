import { test } from "node:test";
import assert from "node:assert/strict";
import { liveAnalysisForWorkspace } from "../lib/server/analysis-access";
const workspace = "c9a6f4a5-823f-4d4d-b667-df64b686ade0";
test("live analysis defaults off and requires exact workspace allowlist as well as global flag", () => {
  assert.equal(liveAnalysisForWorkspace(workspace, {}), false);
  assert.equal(
    liveAnalysisForWorkspace(workspace, {
      CLEARPATH_LIVE_ANALYSIS_ENABLED: "true",
    }),
    false,
  );
  const configured = {
    CLEARPATH_LIVE_ANALYSIS_ENABLED: "true",
    CLEARPATH_LIVE_ANALYSIS_WORKSPACES: workspace,
  };
  assert.equal(liveAnalysisForWorkspace(workspace, configured), true);
  assert.equal(
    liveAnalysisForWorkspace(
      "98129a00-527b-4003-ace9-3bea0bcaec33",
      configured,
    ),
    false,
  );
  assert.equal(
    liveAnalysisForWorkspace(workspace, {
      ...configured,
      CLEARPATH_LIVE_ANALYSIS_ENABLED: "false",
    }),
    false,
  );
  assert.equal(
    liveAnalysisForWorkspace(workspace, {
      ...configured,
      CLEARPATH_LIVE_ANALYSIS_WORKSPACES: "*",
    }),
    false,
  );
});
