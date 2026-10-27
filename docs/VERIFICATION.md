# Verification — updated 27 October 2026

Current deployed source `7de0bfa`: production build, 52 local automated tests and **nine local/production browser scenarios pass**. Default invitation callback compatibility is verified with synthetic tokens, not actual email delivery. Live analysis remains disabled; the trusted runtime migration is local only. Earlier dated sections below preserve the validation history.

- Production: https://clearpath-review-livid.vercel.app
- Source: https://github.com/trinayhari/clearpath-review (public with explicit owner approval)
- Vercel project: `prj_umtJoMItJCqtFwfw4z6pv7WVI6OB`, team `team_436aG5Hp5Q8oUSOAV3YCS1QA`.
- Supabase project: `tztlatsflqjlfadipguu`.

## Completed evidence

- Production Next.js build and TypeScript checks pass.
- 26 domain/database tests pass against a dedicated PostgreSQL 17 container. The tests use real RLS, grants, triggers, row locks and two concurrent database connections; only Supabase's identity function is represented by a local test adapter.
- Four Playwright browser scenarios pass locally and against the public production alias: create draft, timeout recovery preserving content, evidence review, preview/edit, immutable v2, fresh precheck, submission lock, reviewer decision, v3 invalidating current approval while retaining historical v2 approval; search/reset, policy library, analytics, mobile layout and anonymous API rejection.
- The third browser scenario uses intercepted fictional API fixtures to verify workspace-scoped counters, analytics, and role display; it is not an Auth login test. The decision modal requires an explicit choice even after a rationale is entered. Browser workflow checks no uncaught page errors. Screenshots are committed under `artifacts/`.
- A separate design reviewer inspected the rendered interface and full version lifecycle. Findings were addressed: mobile status/risk visibility, stronger text contrast, sentence-aware replacement and full-copy preview, historical decision context, no claim of resolved findings before recheck, native modal focus/Escape support.
- Hosted Supabase RLS verification: an authenticated nonmember sees zero workspaces/campaigns/versions/events. Anonymous SELECT and RPC execution privileges are false; authenticated UPDATE privileges on audit/version tables are false. All six public tables have RLS enabled. Security advisor returns no findings.
- Public production URL returns HTTP 200; unauthenticated GET `/api/workspace` returns 401. Browser POST without an identity is rejected. No database data is exposed by the public demo.
- Tracked source scanned for common credential/private-key patterns before publication. No credentials are committed. The unrelated `agent-maintainer` repository was not edited or published.

## Environment-specific test note

The execution environment's HTTPS proxy certificate is trusted by system curl but not the downloaded Chromium profile. Production Playwright runs use `PLAYWRIGHT_IGNORE_HTTPS_ERRORS=1` only in this test harness; application TLS is unchanged. Browser fetch is used for API assertions because standalone Playwright APIRequestContext cannot route through this environment's network proxy. System curl validates the deployed endpoint using its normal trust configuration.

## Remaining validation boundary

The public demo is an ephemeral in-memory sandbox, with simulated roles clearly labeled. It is not a Supabase approval or an authorization bypass. Persistent, authenticated two-person approval still requires individual evaluator accounts and administrator-provisioned memberships. No accounts, passwords, secrets or expanded persistent access were created. This positive Supabase Auth browser scenario has **not** been claimed as verified. Provision two individual identities with action-time authorization, assign marketer/reviewer memberships using the README, then repeat the workflow at `/login`.

The generated deployment URL is Vercel-SSO-protected. The stable assigned production domain is publicly reachable under the existing `all_except_custom_domains` setting; no deployment-protection change or bypass was necessary.

## Independent security review follow-up

The initial assessment RPC accepted owner-supplied findings. This was fixed with a second versioned migration: PostgreSQL now computes the mock result from stored copy and rejects caller findings. Regression tests cover forged empty results, malformed objects, trusted output shape across products, legacy-provenance submission/approval rejection, safe read-boundary quarantine, Unicode excerpt offsets and workspace-specific role display. No service-role runtime credential was added.

## Rollback verification script

`scripts/verify-hosted-rollback.sql` passes against the isolated local PostgreSQL instance. The hosted connector attempt returned `Invalid or expired requestState`; no hosted positive-workflow success is claimed from that attempt. A subsequent hosted count confirmed zero memberships, campaigns, and assessments. The script is available for a fresh authorized management call; all synthetic identities and workflow records are transaction-local and rolled back, with no credentials or sessions created.

## Bounded design audit completion

Explicit modal focus wrapping/restoration, dialog names, form label associations, exact policy navigation/return context, horizontal-only tab strips and measured text contrast are documented in [ACCESSIBILITY-CHECKS.md](ACCESSIBILITY-CHECKS.md). All 27 sampled queue/review text styles exceed 4.5:1 after adjustment; this is not a complete accessibility certification.

## Authenticated-first update — October 27

The main route now validates the Supabase session and directs signed-out visitors to branded sign-in. The isolated sample moved to `/preview`. Real workspace presentation includes account/workspace/role, actionable default filters, compact counts, saved campaign URLs, retained edits during in-app navigation, loading/error/access-pending states, and no fallback to sample data. Missing local configuration explicitly disables sign-in. No hosted membership or Auth account was created by this update.

Validation: production build succeeds; 30 domain/PostgreSQL/provider-transport tests pass; seven local browser scenarios pass. The browser scenarios cover signed-out entry, sample workflow, synthetic workspace responses, failure states, policy context and keyboard behavior. The provider tests use injected synthetic HTTP responses and make no paid calls. Design reviewer inspected desktop and mobile sign-in and sample routes; mobile header spacing and unavailable-setup feedback were corrected.

Still pending: approved marketer/reviewer recipients, supported Auth invitations and email template/redirect configuration, membership provisioning, durable seed execution, actual two-person hosted session and refresh/relogin verification, and a walkthrough of that real persisted loop. No claim here substitutes synthetic tests for actual Auth verification. See ACCOUNT-ONBOARDING.md and LIVE-ANALYSIS-DESIGN.md for exact setup and authorization boundaries.

## Subsequent reliability checks

The authenticated-first release at commit `41d6e81` also passed all seven production browser scenarios. A prepared one-off live-provider validation at commit `1b60503` was rejected by automatic approval review before execution; no paid provider success or cost is claimed. The $2 user approval exists but the exact rejected action must be resolved before retry. See [current production-readiness checklist and approval bundle](PRODUCTION-READINESS.md).

The reliability follow-up passes 35 domain/PostgreSQL/provider/HTTP tests and eight local browser scenarios. A new browser request test exposed Next's internal bind-origin mismatch; same-origin validation now compares the browser Origin with the actual Host, rejects forwarded-host spoofing and foreign origins, and permits remote HTTPS only. Invalid/oversized Auth requests are rejected before contacting Supabase. The production dependency audit (`npm audit --omit=dev`) reports zero known vulnerabilities. These checks do not replace real-account Auth verification.

## Trusted runtime candidate — local only

52 local automated tests pass including the reservation/HMAC/finalization system with real PostgreSQL and synthetic provider transport. The candidate migration is not hosted and no production signing credential or enabled configuration exists. The prior public baseline bbf0be4 passed eight production browser scenarios. The callback release at `7de0bfa` passes nine local and production browser scenarios, including default invitation root landing, URL scrubbing and explicit account confirmation with synthetic tokens. Source includes explicit server-only imports, durable global budget/quota reservations, exact binding/schema/evidence checks, key revocation and replay/concurrency/failure tests. The retired build-time paid-validation script was deleted; no paid call was retried or substituted. Account aliases are approved but parent is coordinating invitation/configuration. Actual runtime Auth/provider/persistence validation remains pending.

Security-review follow-up: 55 local tests pass after adding server proof on reservation and preventing mock/external races. Unsigned reservation, changed request binding, active/failed execution ownership and concurrent mock/reserve tests pass. The migration remains unapplied to hosted Supabase and production signing configuration remains absent.

### Actual hosted Auth checkpoint — October 27, 2026

Parent browser verification confirmed delivery of both approved invitations, distinct marketer/reviewer identities with correct roles, refresh, sign-out, marketer creation/precheck/submission, and reviewer request-changes on v1 persisted after reload. The returning marketer email-link request was blocked by the hosted sender's `over_email_send_rate_limit` HTTP 429 at 01:54:45 UTC. No retry or quota bypass was attempted by this implementation agent. Completion of revision → resubmission → approval → later revision, returning-session verification and user-entered password setup remain unverified in actual Auth until the parent completes that path. These results are separate from synthetic browser fixtures and local PostgreSQL security tests.

Account-settings follow-up verification: 58 local automated tests pass, production build passes, and 10 local browser scenarios pass, including signed-out `/account` redirect and password mutation rejection (401). The local server used public Supabase configuration; no authenticated session, password creation or email-send call was used. The first local run correctly returned 503 with configuration absent; the configured rerun verifies the intended 401 boundary. Actual password success remains a user-driven hosted check.

Production account-settings release `5381a6d` is READY at the existing alias (deployment `dpl_DpxvTnUzDvfe2236w8dH4gS9PFdf`). All 10 production browser scenarios pass, including `/account` redirect and signed-out password rejection. A direct Playwright HTTP-client assertion initially failed with network ECONNREFUSED; it now uses the browser's same-origin fetch, matching the other deployed checks. No application authorization bypass was involved. Live analysis continues returning 503 “Live analysis is not enabled.” Design code review improvements applied: visible mobile branding, focused/labeled mismatch recovery and account-email password-manager association. Actual signed-in password setup/rendering remains pending account-holder interaction; no credentials or email sends were created by these tests.

### Password signup checkpoint — October 27, 2026

At the user's explicit request, password signup/login replaces email delivery as the primary entry. Parent browser worker verified Confirm email OFF, signup enabled, Email provider enabled, anonymous sign-ins OFF and manual linking OFF. Existing credentials were not changed.

66 local automated tests and production build pass. New PostgreSQL checks cover concurrent/idempotent personal workspace creation, transaction rollback/retry, campaign persistence through a fresh database connection, cross-tenant read/write denial, parameter spoofing, direct-role-write denial, existing reviewer preservation, removed-membership denial and anonymous rejection. Mocked Auth transport checks signup session validation, existing-email collision without reset, missing/anonymous session rejection and interrupted setup recovery. These do not claim actual new Supabase signup or browser relogin with real credentials.

Only `isolated_signup_workspace` was applied to hosted project `tztlatsflqjlfadipguu`, recorded as version `20261027033113`; source is `20261027033000_isolated_signup_workspace.sql`. Supabase CLI migration creation failed on read-only `/home/agent/.supabase`, so local SQL iteration and a manually versioned file were used. Hosted read-only checks confirmed private map RLS enabled, no authenticated direct read/write grants, public wrapper security-invoker, private definer with empty search_path and anonymous execution revoked. No personal account/workspace was created by these management checks. Live-signing tables remain absent. Security advisor INFO for the deliberately default-deny private map and WARN for disabled leaked-password protection are documented, not hidden.

Password-first production release `0a494ee` is READY (deployment `dpl_FkYqHDBFsQteSALh1mxB5pLKBTn5`) at `https://clearpath-review-livid.vercel.app`. All 11 local and deployed browser scenarios pass, including password-first entry, isolated-workspace signup explanation, mocked existing-account collision without reset, and signed-out mutation denial. Desktop/mobile rendered design review passed; signup guidance is associated with its password field. Hosted read-only checks also confirmed the onboarding function owner has the required Auth-table read/row-lock privileges. Actual signup → campaign creation → sign-out/relogin with a user-entered password remains pending; browser tests did not create credentials or send email.

### Actual password Auth and persisted review loop — October 27, 2026

The approved QA replacement marketer and reviewer signed up through the real deployed UI with generated credentials held only in the executor process's volatile memory. No traces, videos, screenshots, storageState, credential files, secret logs, or mocked endpoints were used. Both signups returned 200, each got its own distinct marketer workspace, and refresh preserved identity. Parent then added the approved reviewer membership only to the marketer QA workspace, preserving the reviewer's own isolated workspace as a control.

Real production campaign `8d444dc3-e1dd-4d94-9479-90d65f4444bd` completed: v1 `06806fb5-a59e-4110-b66b-738f1ac14bf7` create/mock-precheck/submit → reviewer request-changes → v2 `71658292-3b12-4ddc-b62e-4caa3b99faab` revise/recheck/resubmit → reviewer approval → v3 `497bc62c-04f3-4360-9b6b-16b65488d434` Draft, unchecked and unapproved. Exactly one v2 approval remains historical among nine audit events. Cross-tenant reads omitted the control campaign; cross-tenant writes and unauthorized marketer approval/reviewer revision returned 403. Stale v1 approval returned 409. Both accounts logged out (workspace API then 401), signed back in with their own password, and refreshed; campaign versions/status/audit survived. This is actual Auth/browser evidence, separate from synthetic fixtures and local PostgreSQL tests. The two QA identities are automated test users, not independent human reviewers.

An earlier disposable QA signup succeeded but its harness expected an outdated heading, closed the context and discarded its transient password. That account remains untouched. The user explicitly approved the replacement identity above; the corrected runner retains credentials in memory across recoverable assertions/provisioning pauses and will discard them only after testing completes. Live-provider validation is still separate and pending activation.

Workspace-gated runtime `09c25fa` deployed READY as `dpl_r4dTBZa5qSfbB5g6sXRQ8Eo3fvgA`; all 11 deployed regression scenarios pass. Both retained real QA sessions refreshed successfully after deployment. Workspace mode is currently mock for both the approved QA workspace and the reviewer's isolated control workspace, consistent with disabled activation. Author and committer metadata verified as `trinayhari <trinayhari@gmail.com>`. Paid runtime validation is pending parent activation; credentials remain only in the live executor process for that next step.

### First authenticated external-analysis attempt

After explicit activation approval and verified $2 cumulative budget/exact QA allowlist, the deployed server made one authenticated fictional analysis attempt on campaign `f593c3e3-caeb-44bf-8255-92240b3d729f`, version `f6c20880-2071-4100-aa00-c81778c0bc69`. Execution `740ed46a-75dc-4351-bc4d-dc8bd99d52cb` was reserved, started and finalized failed; HTTP 503, no assessment/token usage stored, draft unchanged/unapproved and no mock fallback. The permanent $0.20 reservation remains charged against the cap; actual provider spend is unknown, not asserted zero. No second analysis request was made.

The original adapter discarded specific failure details, so the exact first failure category cannot be reconstructed from stored evidence. Observability fix: bounded error-body parsing retains only allowlisted categories, HTTP status and a sanitized `req_` request identifier; raw body/message, keys, headers and submitted copy are never logged. Fixed user-facing error mapping avoids a generic uncertain-action message for known provider failures. An authenticated, exact-live-workspace marketer-only `/api/analysis/access` diagnostic uses read-only model retrieval, sends no campaign copy and performs no inference; it distinguishes key/model access from actual billing/analysis success. Production diagnostic result is pending deploy. No claim of successful live AI validation yet.

Diagnostic release `bec1926` deployed READY as `dpl_EApDPG1YPjb6ojcRoBS12aPjahs8`; 70 local automated tests and production build pass. Actual authenticated read-only model lookup returned 200 for the pinned model using the existing server credential; this confirms access, not billing capacity or original analysis success. The control workspace received 403 for provider diagnostics and completed a database-owned mock precheck while QA live enablement was active. Exactly one analysis execution remains failed, with $0.20 permanently reserved; no second inference request was made. The first failure's exact cause is unrecoverable from the old generic diagnostics. Credentials and browser contexts remain in volatile executor memory pending the parent's decision on one instrumented second attempt or shutdown.


## Second runtime attempt and anchored contract correction

The second and final authorized inference attempt ran on version `4850499a-216f-4c11-ab1f-85a416ecb7ee`, execution `cccc599d-345a-4062-a176-a2666c39f41a`, at 04:45 UTC. Safe runtime diagnostics recorded `invalid_evidence`: structured output parsed, but its policy ID or quoted evidence failed verification. No assessment or approval was saved and no mock fallback occurred. Both attempts retain $0.20 reservations each ($0.40 total); token usage and actual charges are unknown. No third request was made and no quota or ledger entry was reset.

The correction constrains policy IDs and evidence IDs with request-specific enums. The server reconstructs exact text and Unicode codepoint offsets from immutable source excerpts. New contract `clearpath-review-2026-10-27-v2-anchored` requires the paired migration `20261027045200_anchored_analysis_contract.sql`; it changes only future reservations, retaining old provenance and spend. This migration and runtime correction are not yet deployed/hosted. Local production build, 73 automated tests and 12 browser scenarios pass, including a persisted-failure action to save a fresh immutable revision without editing copy solely to unlock retry. Provider responses in these regression tests are synthetic; they do not prove successful live inference.

The retained QA credential process remains in memory for coordinated testing. No Vercel access token creation, CLI login, or verification-code consumption was performed by this implementation agent; deployments used the existing connector.

Source publication encountered new remote commit `951222b` (teams/reviewer handoffs). Its changes were merged without force-push; the conflict preserves responsible-reviewer guidance and failed-analysis recovery. The combined source passes 82 local automated tests and the production build. The browser confirmation selector was narrowed to its specific status message after both workflow guidance and confirmation became status regions.

Combined browser verification: 14 scenarios passed together; the remaining workflow scenario passed on targeted rerun after narrowing both ambiguous status assertions. All 15 scenarios therefore have passing evidence on this combined runtime; no real provider transport was used.
