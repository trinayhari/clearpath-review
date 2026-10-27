# Production-readiness checklist

This is a tested vertical slice for fictional financial marketing reviews, not a regulated financial production certification. Evidence is scoped below; an unavailable positive Auth test is not a pass.

| Area | Status | Evidence / remaining work |
|---|---|---|
| Production build and types | Passed | Next.js production build, TypeScript check, 35 automated domain/database/provider/HTTP tests |
| Authentication entry | Passed, limited | Root gates on validated `getUser`; signed-out production browser redirects to login; no fixture fallback |
| Actual invited-account sign-in and session refresh | Unverified | Two approved recipient identities and working email configuration pending |
| Workspace isolation and roles | Passed locally; hosted negative checks passed previously | Real PostgreSQL RLS/grants; cross-workspace and same-workspace non-owner mutations rejected; no metadata-based roles |
| Two-person hosted persisted workflow | Unverified | Invitations/memberships not provisioned; no actual positive Auth claim |
| Exact-version and concurrent decisions | Passed locally | Stale decision rejected; concurrent approvals yield one event; new revision resets current approval and retains historical event |
| Self-approval | Passed locally | Even changing an author's membership to reviewer cannot authorize their own campaign |
| Immutable audit and analysis | Passed locally | Direct app writes revoked; immutable triggers; caller-supplied mock findings rejected |
| Safe operational errors | Passed | Fixed message catalogue; raw database errors not returned; stale/concurrent actions classified; uncertain results require refresh |
| Input/output bounds | Passed | Streamed request-body limit, content/note schemas, response size/finding limits and full output validation |
| Browser workflow/accessibility | Passed, bounded | Seven local and production scenarios; independent desktop/mobile review; focus trapping and policy return; not full WCAG certification |
| Mock assessment trust | Passed | Database computes from stored version; provenance required; no AI approval |
| External provider parsing/failure handling | Passed with synthetic transport | Schema, excerpts, applicability, refusal, incomplete response, timeout and rate-limit paths |
| Actual paid provider validation | Blocked | One-off two-request Vercel build was rejected by automatic approval review; zero calls executed from this attempt |
| Provider persistence and provenance | Not enabled | Separate reservation/finalizer design awaiting scoped credential approval and implementation; ordinary user RPC cannot persist external findings |
| Cost controls | Disabled live surface; bounded test prepared | No application route can spend. One-off script caps two requests, no retries, 4,500 output tokens/request and $0.10 reserved/request, below approved $2 total |
| Auth rate limiting | Platform-managed; operational verification pending | Uses Supabase Auth limits; 429 handled. Do not claim a tested distributed custom rate limiter |
| Campaign API abuse controls | Partial | Auth/RLS, bounded inputs, per-version immutable assessment and locked workflow; distributed user/IP quotas are not implemented |
| Durable starting campaigns | Prepared, not executed | User-scoped seed script requires approved marketer session and workspace; never invents reviewer decisions |
| Production dependencies | Passed, point-in-time | `npm audit --omit=dev`: zero known vulnerabilities on October 27 |
| Secret handling | Passed source review | No secret values printed/exported, no service key, sensitive key remains on Vercel; source scan passed |
| Operational recovery | Unverified | Backups/restore drill, alerting/on-call, retention/deletion/export policy, incident handling and production load testing require owner decisions |
| Legal/product policy validity | Not certified | Rules and campaigns are fictional; real terms and legal coverage require qualified human owners |

## Exact approval bundle for the owner

Account emails are still missing. Do not execute this bundle until the actual recipients and target workspace are approved.

1. **Project Auth configuration:** Supabase `tztlatsflqjlfadipguu`; Site URL `https://clearpath-review-livid.vercel.app`; allowed redirect `/auth/confirm` on that origin; one-time Invite and Magic Link templates exactly as documented in [ACCOUNT-ONBOARDING.md](ACCOUNT-ONBOARDING.md). No public signup-to-membership grant.
2. **Individual invitations:** approved email A → `marketer`, approved distinct email B → `reviewer`, in the existing fictional evaluator workspace `00000000-0000-4000-8000-000000000001` (or a separately approved isolated workspace). Send through supported Supabase Dashboard/Auth Admin invitations, then resolve actual Auth UUIDs and insert those exact memberships. No shared passwords or user-metadata roles.
3. **Fictional durable data and verification:** authorize those identities to create the four prepared starting campaigns and perform a persisted change-request → revision → approval → new draft loop, including refresh/relogin and forbidden cross-role/workspace checks. Do not record credentials or private inboxes.
4. **Trusted provider writer:** approve a new narrowly scoped HMAC signing credential stored only as a sensitive Vercel server variable and private database verifier configuration, after reviewing the concrete reservation/finalization migration and tests. This does not authorize service-role access. [Design and required checks](LIVE-ANALYSIS-DESIGN.md).
5. **Exact paid validation action:** resolve the automatic-review rejection for a one-time Vercel production build executing `npx --no-install tsx scripts/validate-live-provider.ts --approved-20261027 && npm run build`, using the existing key in place and fictional data only. The user's $2 total approval has been forwarded, but the action was rejected; do not silently retry or substitute another execution path. No persistent live-call endpoint or ongoing budget is included.
