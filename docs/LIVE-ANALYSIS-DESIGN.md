# Trusted runtime analysis — implemented locally, inactive in production

The runtime implementation is reviewable in:

- `supabase/migrations/20261027012748_reserved_trusted_external_analysis.sql`
- `lib/server/trusted-analysis.ts` (server-only orchestration and HMAC writer)
- `lib/server/openai-provider.ts` (server-only bounded Responses adapter)
- `app/api/analysis/route.ts`, and the authenticated workspace's existing precheck command
- `tests/helpers/trusted-runtime.ts` (real local PostgreSQL plus synthetic provider transport)

The migration has **not been applied to hosted Supabase**. No production signing credential, key row, limit row, workspace allowlist row or enabling flag has been created. Merely adding `OPENAI_API_KEY` does not enable calls. Public preview remains mock; application runtime requires authenticated owner authorization, explicit server enablement and database configuration. No client can pass trusted findings through `cp_command`.

## Execution and trust boundary

1. The server validates the individual session and request. Only campaign/version/request IDs come from the browser. PostgreSQL rechecks current marketer membership, ownership, exact current version and editable state, locking the campaign.
2. `cp_reserve_analysis` locks the global budget row and creates one execution per immutable version. The database owns its actor, workspace, version, content hash, policy bundle, pinned model, key ID, random nonce and two-minute expiry. Repeated requests return the same reservation. A reused request ID for different copy is rejected.
3. The server verifies the reservation and signs the exact UTF-8 JSON bytes with HMAC-SHA256. `cp_start_analysis` verifies signature, audience, binding, key status, membership/state and expiry. Exactly one concurrent caller can change reserved→running; others cannot call the model again.
4. The server sends only stored copy plus the versioned fictional policies to OpenAI. The provider has no tools, credentials in prompts, or workflow authority. Schema validation and exact excerpts run before signing the result.
5. `cp_finalize_analysis` locks campaign/execution, verifies the signature and all bindings again, rechecks current membership/version/state/content, then independently validates the complete finding shape, policy applicability/version/source and code-point evidence offsets in PostgreSQL. It atomically inserts the immutable assessment/provenance and audit event, and completes the execution. Duplicate exact completion is idempotent; changed payloads/replays cannot overwrite results. Stale finalization cannot apply to new copy.
6. Human submission/decision remains a separate role-gated action. External results never approve/reject or change a campaign's workflow status. Existing mock rows are never relabeled. Read/UI boundaries distinguish mock from actual OpenAI provenance.

Private key, configuration and execution tables have RLS with no application table grants. Public wrappers are security invoker; private definers check identity, use an empty search path and have explicit least execution grants. The ordinary analysis RPC still generates its own deterministic result and rejects supplied findings.

## Durable global cost and request limits

The one global configuration row has a cumulative budget ceiling of **2,000,000 micro-USD ($2)** across all identities, workspaces and repeated runs. Each attempt reserves **200,000 micro-USD ($0.20)** before it can start. Reservations are never released on failure, timeout, unknown outcome, expiry, or success; token usage is recorded separately. This is intentionally conservative. Resetting or increasing a production budget is an explicit administrative operation, not automatic behavior. Database constraints currently forbid budgets above $2.

A global row lock serializes reservations even across different campaigns/workspaces. Configured rolling limits additionally cap requests per user/hour (maximum 10) and workspace/day (maximum 20). Execution history is immutable apart from allowed internal state transitions. No web endpoint can edit limits, key rows, allowlists or membership. There is one attempt per version; retry after failure requires a revised version and another reserved allowance. No automatic model retry is implemented.

Pinned validation model: `gpt-5.4-mini-2026-03-17`. Official published pricing checked October 27, 2026: $0.75/M uncached input tokens and $4.50/M output tokens. The adapter bounds the complete request body to 100KB and output to 4,500 tokens, with no tools. A conservative 102,048 input-token allowance plus output cap costs at most approximately **$0.096786**, below the $0.20 reservation. Confirm pricing/model availability again at activation; the reserved amount must never be lowered without reviewed cost accounting. No paid calls have run in this implementation task.

The response body is bounded to 100KB before JSON parsing. There is no unbounded clone/JSON read. Refusal, truncation, malformed output, missing usage, unsupported policy, fabricated excerpt and timeout produce no clean assessment. Synthetic tests exercise failure paths without paid calls.

## Key rotation and activation approval

A production HMAC key requires explicit approval to generate/store it. It would be stored only as `CLEARPATH_ANALYSIS_SIGNING_KEY` (sensitive server-only Vercel variable) and bytes in private `cp_ai_keys`; its nonsecret identifier is `CLEARPATH_ANALYSIS_KEY_ID`. Do not paste key values in chat, source, SQL logs, screenshots or build logs. Use an approved secure provisioning path; do not retrieve a service-role key for this app.

Key IDs are bound into every reservation and signature. `enabled=false` revokes verification immediately. Rotation creates a separately approved key ID, configures the server, and changes the active reservation key; retain the prior key only for its short in-flight window if explicitly allowed, then revoke it. Changing IDs cannot make an old signature authorize another execution.

Before any live activation, review and approve:

- The exact migration above and its security tests, then apply it to only `tztlatsflqjlfadipguu`.
- Secure signing-key provisioning/storage and the named key ID.
- A global limit row with total budget no more than the remaining approved $2, explicit per-user/workspace quotas, and only the approved fictional workspace enabled.
- `CLEARPATH_LIVE_ANALYSIS_ENABLED=true` only for the intended deployment after the two approved test identities work.
- The exact authenticated runtime test requests, fictional copy, budget cap and evidence handling. Turn enablement off after bounded validation unless continued operation is separately authorized.

`/api/analysis` remains disabled without the flag; the main precheck stays database-owned mock. Neither path falls back from a failed live call to a clean mock result. Real account login, refresh/relogin, hosted finalization and paid response verification remain unverified.

## Retired build test and exact denial

The earlier one-time build invocation was meant to validate provider parsing using the existing Vercel key while accounts were unavailable; it could not establish authenticated runtime or persisted workflow correctness. It was rejected before execution and was not retried or moved to another execution path. The standalone script has now been removed so future runs cannot evade the durable global reservation system.

Automatic review's exact reason: “The production build would use OPENAI_API_KEY to make up to two paid live OpenAI requests, directly conflicting with the user’s explicit mock-only/no-paid-calls restriction and lacking action-time approval.” The later $2 approval had been forwarded, but the rejection still stands pending parent coordination. No paid outcome or spend is claimed. Runtime testing requires the appropriate action-time approval, not reuse of the retired build command.

## Local verification and schema workflow

The migration was first executed as candidate SQL against the isolated local PostgreSQL instance, then versioned and tested with the full suite. Supabase CLI help/migration tooling cannot initialize `/home/agent/.supabase` in this readonly environment, so the versioned file uses the documented manual fallback. Tests use constant explicitly synthetic bytes in the isolated database; no production credentials are created. Security checks include no application reads of key/limit/run tables, no direct execution of verifier helpers, and no public security-definer wrapper.

References: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [model and pricing](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [PostgreSQL pgcrypto](https://www.postgresql.org/docs/current/pgcrypto.html).
