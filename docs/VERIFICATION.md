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
