# ClearPath Review

A production-minded marketing compliance review vertical slice for **fictional ClearPath Financial**. The product takes a campaign from an original draft through deterministic mock precheck, immutable revision, human review, and version-specific audit history.

## Evaluate the product

`/` opens the authenticated workspace, or redirects to branded sign-in. Create an account with email and password; no confirmation email is required for this take-home. Signup gives you a new isolated workspace with marketer access. See [account onboarding](docs/ACCOUNT-ONBOARDING.md) for existing-team access and reviewer provisioning. Authenticated users can optionally set their own password under **Account & sign-in**, then use password login without another email; no shared credentials are provisioned. Saved campaign links survive refresh; reviewers default to pending reviews and marketers to their own work.

`/preview` opens a fully interactive, isolated fictional sample. Each browser tab gets its own in-memory state. No demo decisions are sent to Supabase, persisted, or treated as real authorizations. The persona selector **simulates** marketer/reviewer behavior solely in this sandbox. Refresh resets the demo.

1. Create a new submission: personal loan / email, with “Get guaranteed approval for your personal loan today. Explore a brighter financial future with ClearPath.”
2. Run precheck. Open the exact evidence and fictional policy reference. Preview the suggested replacement, including full revised copy.
3. Save as v2. Rerun precheck. “No rule matches” is explicitly not compliance approval.
4. Submit v2. Copy becomes locked. Switch the demo persona to Alex / Reviewer.
5. Record a decision with a rationale. Inspect the version-specific audit activity.
6. Switch to Maya and create v3. The campaign returns to Draft; v2 retains its historical approval, which does not apply to v3.
7. Explore search, product/status filters, policy library and record-derived analytics. A new unchecked draft offers mock timeout/error controls; failures preserve copy.

`/login` offers password sign-in and signup. New accounts receive only their own isolated workspace, never the seeded evaluator workspace or reviewer access. Existing memberships remain unchanged. Email addresses are unverified identifiers in this take-home, not proof of business identity; no email/domain/user-editable metadata determines authorization. There are **no shared passwords, anonymous reviewer accounts, client-side role overrides, service-role keys, or auth bypasses**. Human review requires a separately authorized reviewer. The optional email-link path remains for previously invited accounts without passwords. The public sample does not establish authenticated production approval verification.

## Stack and commands

Node 24, Next.js App Router, React, TypeScript, Tailwind v4, shadcn-style Button (Radix Slot/CVA; `components.json`), Lucide, Supabase PostgreSQL/Auth. Exact versions and `package-lock.json` are committed. No paid model usage has occurred. A disabled server-only OpenAI runtime candidate is implemented and locally tested; production still uses mock analysis pending explicit activation. See [trusted runtime design](docs/LIVE-ANALYSIS-DESIGN.md).

```sh
npm ci
cp .env.example .env.local
# Set only NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
npm run dev
npm run typecheck
npm run build
```

The public demo works without environment variables. Authenticated endpoints fail closed without configuration. Cookie sessions use `@supabase/ssr`; API handlers validate identity using `auth.getUser()`, and refresh cookies through the response cookie store. User-specific data is fetched through uncached API requests; the root page contains no fixture data; session validation and cookie refresh run in `proxy.ts`.

## Database setup and evaluator roles

Hosted migrations: `supabase/migrations/20261026170000_review_workflow.sql`, `supabase/migrations/20261026172000_database_owned_assessments.sql`, and `supabase/migrations/20261027033000_isolated_signup_workspace.sql`. The third migration, `20261027012748_reserved_trusted_external_analysis.sql`, is a locally verified, inactive runtime candidate awaiting hosted approval; do not imply it is already applied. Seed: `supabase/seed.sql` creates only a fictional workspace, never accounts or credentials.

Apply the migration to a dedicated Supabase project with the CLI or an authorized management connection. Never run test bootstrap SQL on a deployed database. The migration was verified against isolated PostgreSQL 17 and applied to project `tztlatsflqjlfadipguu`. All six public tables have RLS enabled. Current security advisors report an intentional no-policy INFO for the default-deny private onboarding map and a WARN for disabled leaked-password protection; see readiness limitations.

Evaluator access is provisioned by the project administrator after each evaluator has their own authenticated identity. Use distinct identities for marketer and reviewer. Credentials are delivered privately through the organization's existing process. Do not put them in source, README, environment variables, or the demo.

```sql
-- Replace with the actual identity UUID, never a user-editable metadata role.
insert into public.cp_members(workspace_id,user_id,role,display_name)
values ('00000000-0000-4000-8000-000000000001', '<auth-user-uuid>', 'marketer', 'Evaluator marketer');
-- Repeat for a separate person, with role='reviewer'.
```

For isolated evaluation groups, create a separate `cp_workspaces` row and provision only those people's memberships. Memberships are administrator-managed; no web endpoint can promote a user. The authenticated empty state guides provisioned marketers to create a draft. The approved marketer can seed durable fictional drafts and pending reviews with `scripts/seed-authenticated.mjs`; it uses ordinary authenticated RPCs and creates no fake human decisions. Public visitors cannot read this workspace.

## Architecture and security

- `lib/domain.ts`: bounded Zod input/output contracts, deterministic `AnalysisProvider` interface, applicable fictional policies, exact evidence offsets, policy version/source metadata, mock error paths. Content is data; prompt injection cannot change instructions or authorize workflow actions.
- `lib/fixtures.ts`: rich fictional sandbox cases and isolated simulation reducer. Sandbox logic is not the security boundary.
- `app/api/workspace`: authenticates each request, validates inputs, requests a database-owned mock precheck on the stored version, and calls a user-scoped PostgreSQL RPC. Same-origin checks protect cookie-authenticated mutations.
- PostgreSQL is authoritative. `cp_command` is a security-invoker public wrapper around a private, least-granted security-definer implementation with an empty `search_path`, explicit identity/membership/role/ownership checks, and campaign row locking. It rejects stale version IDs, self-review, illegal transitions, and duplicate decisions.
- Every mutation creates an actor/version-linked event in the same transaction. Versions, analyses, and events cannot be updated/deleted, including through direct owner SQL because immutability triggers reject them. Table writes are revoked from application roles. A unique partial index permits one decision per version.
- Read policies scope all campaigns and child records to workspace membership. Anonymous users have no table or RPC access. There are no views or public definer functions.
- Only a marketer owning a campaign can create revisions, precheck and submit. Only an independent reviewer can decide an In review version. A submitted version is locked. Revising an Approved/Rejected campaign creates a new Draft and retains the previous decision as historical.
- Assessments are guidance, never approval. Persisted mock findings are generated inside PostgreSQL from the locked stored version; the RPC rejects all caller-supplied findings, including empty arrays. The private generator has no application-role execution grant. Its results are stored as `deterministic-mock-v2-db` with trusted provenance. Submission and approval require this provenance. Legacy assessments remain immutable and untrusted; create a revision to replace them. The API validates the full finding schema, policy version and exact evidence offsets before rendering, and quarantines malformed/untrusted rows instead of crashing the workspace.
- The isolated browser demo uses the TypeScript `AnalysisProvider`; persistence uses a database-owned equivalent. Tests validate both outputs. A future external provider needs a narrowly authorized trusted write boundary; users must never be able to label arbitrary results as provider output.

## Tests

Use a dedicated local PostgreSQL container. This fixture has no remote access or real data. Database tests **reset the local public/auth/private schemas** and refuse non-local hosts.

```sh
docker run -d --name clearpath-postgres \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -p 127.0.0.1:55432:5432 postgres:17-alpine
npm test
npm run build
npm start
# In another terminal:
npx playwright install chromium
npm run test:e2e
```

`TEST_DATABASE_URL` defaults to `postgresql://postgres@127.0.0.1:55432/postgres`. Tests exercise actual PostgreSQL policies/functions with a minimal local `auth.uid()` compatibility stub, not just mocked authorization. They cover cross-workspace access, denied direct writes, marketer/reviewer permissions, anonymous denial, fabricated evidence, precheck gating, locked submissions, stale versions, concurrency, append-only audit, prompt injection, negated claims, immutable history and sentence-safe edits.

Browser tests cover the full sandbox review loop, failure recovery, policies, analytics, queue filtering, and responsive overflow. `BASE_URL` runs the same suite against a deployment. Screenshots in `artifacts/` show fictional data only. Real Supabase Auth session creation and two-account production approval require provisioned evaluator identities and must be verified separately.

## Deployment

Deploy this directory as a Next.js project on Vercel, Node 24, with the two public Supabase variables above. Intended project: `prj_umtJoMItJCqtFwfw4z6pv7WVI6OB` in team `team_436aG5Hp5Q8oUSOAV3YCS1QA`. Never deploy or modify the unrelated saved `agent-maintainer` repository.

The application is intended to be publicly reachable; the authenticated workspace still requires Supabase login and RLS. Disable deployment protection only for this intended project when authorized. Do not expose environment files, service credentials, or authenticated browser traces. Verify build, HTTP response, full demo loop and anonymous API denial after deployment. Repository `trinayhari/clearpath-review` should be private unless the owner explicitly chooses otherwise.

## Scope and tradeoffs

This is a 24-hour slice, not a legal compliance engine. Fictional policies are separate from official reference links; the external references supply context, not blanket legal determinations. Mock results are deterministic and intentionally narrow. Approving with unresolved findings is allowed only as an explicit human decision with a rationale; the reviewer owns verification.

The public sandbox uses ephemeral tab state to provide safe, frictionless evaluation without identity sharing. The authenticated backend is persistent but requires separately provisioned identities. Text diff shows complete before/after versions rather than token-level inline diff. Policy configuration is versioned in code, not an admin CRUD screen. All-time analytics derive from current records; no invented performance gains. No uploads, CSV, notifications, live monitoring, pagination, reviewer assignment or regulatory coverage claims. Rate limiting, enterprise SSO, retention and external observability are follow-up production hardening, not represented as completed.

The Supabase CLI migration-creation command was attempted but could not initialize its readonly `/home/agent/.supabase` directory in this environment; a versioned migration file was therefore authored directly, tested locally, and applied via the authorized Supabase management connection. No CLI credentials were created or persistent access expanded.

## Delivered instance

Application: https://clearpath-review-livid.vercel.app · Optional sample: https://clearpath-review-livid.vercel.app/preview · Source: https://github.com/trinayhari/clearpath-review . The owner explicitly approved public fictional source publication. See [verification evidence and remaining validation boundary](docs/VERIFICATION.md).

Hosted workflow verification can also run `scripts/verify-hosted-rollback.sql` through an authorized management connection. It uses synthetic identity UUIDs and JWT claims inside one transaction, creates no passwords/sessions/invitations, and rolls back every fixture. This verifies hosted PostgreSQL workflow/RLS execution, **not** the email/password login or cookie-refresh path. Individual evaluator account provisioning remains required for that separate browser test.
