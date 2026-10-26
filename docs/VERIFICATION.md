# Verification — 26 October 2026

- Production: https://clearpath-review-livid.vercel.app
- Source: https://github.com/trinayhari/clearpath-review (public with explicit owner approval)
- Vercel project: `prj_umtJoMItJCqtFwfw4z6pv7WVI6OB`, team `team_436aG5Hp5Q8oUSOAV3YCS1QA`.
- Supabase project: `tztlatsflqjlfadipguu`.

## Completed evidence

- Production Next.js build and TypeScript checks pass.
- 26 domain/database tests pass against a dedicated PostgreSQL 17 container. The tests use real RLS, grants, triggers, row locks and two concurrent database connections; only Supabase's identity function is represented by a local test adapter.
- Two Playwright browser scenarios pass locally and against the public production alias: create draft, timeout recovery preserving content, evidence review, preview/edit, immutable v2, fresh precheck, submission lock, reviewer decision, v3 invalidating current approval while retaining historical v2 approval; search/reset, policy library, analytics, mobile layout and anonymous API rejection.
- Browser workflow checks no uncaught page errors. Screenshots are committed under `artifacts/`.
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
