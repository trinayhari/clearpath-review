# Live provider preparation — disabled

`lib/server/openai-provider.ts` implements bounded OpenAI Responses API structured output, with no endpoint importing it. The API key is supplied only by server configuration. Public `/preview` stays deterministic and never calls a paid provider. Current persisted prechecks remain database-owned mock v2. Merely adding `OPENAI_API_KEY` does not enable calls.

The adapter has a 20-second timeout, a 20,000-character input bound, 4,500 output-token cap, 100KB response bound, a maximum of 20 schema-validated findings, fixed policy applicability/version/source metadata, and exact excerpt verification. Instructions are separate from untrusted campaign text. Refusal, truncation, malformed output, unsupported policies, fabricated excerpts and transport errors fail closed. It neither decides campaigns nor writes data. It makes no automatic retries. Tests use an injected synthetic transport and a synthetic noncredential key. Model selection, pricing, rate limits and the permitted test budget must be confirmed before activation; no model is silently chosen.

## Proposed trusted persistence boundary (not installed)

Do not pass provider findings to the ordinary `cp_command('analyze')`: it deliberately rejects caller findings. Do not add service-role access to the application.

A proposed narrowly scoped HMAC signing credential would be generated only after explicit approval and stored in two places: a sensitive server-only Vercel environment variable and a private PostgreSQL configuration row readable only by an explicitly checked security-definer verifier. This is new persistent credential access and is **pending approval**, not part of current deployment setup.

The future authenticated server endpoint would validate identity, workspace membership, ownership and editable current version before spending. A database reservation would enforce one in-flight analysis per exact version plus a bounded approved workspace/user quota. It would load the stored copy and applicable versioned rules; callers cannot supply trusted copy, provider name or findings. After validation, the server would sign an exact serialized payload containing user/workspace/campaign/version IDs, content hash, findings, model, provider response ID, prompt/policy versions, request nonce, issue time and expiry. The database would verify the signature over those exact bytes, expected audience, auth.uid(), ownership/membership, locked current version/content hash, nonce/reservation and short expiry, then atomically append one immutable trusted assessment and audit event. Replay and concurrent completion must be idempotent or rejected. No signing endpoint may accept arbitrary client findings.

The database needs a reviewed versioned migration and direct-RPC forgery/replay/stale/cross-workspace tests before any hosted application. The read boundary and UI must preserve actual provider provenance, never relabel live findings as mock. Failure must release/expire reservations without presenting a clean assessment. Existing mock results remain immutable and human approvals remain separate. A server key leak should at worst permit forged analyses within authenticated owner scope, never role grants or decisions; rotate it and quarantine affected provenance if compromised.

## Pending decisions

- Approval to create/store this scoped signing credential (or approve an alternative equally narrow trusted writer).
- Approved model, authenticated test identities/workspace and the requested paid-call cap.
- Approved hosted migration/configuration once the implementation is reviewable and tested.

No live calls, new signing key, privileged key retrieval, database writer grant, or live migration has occurred in this preparation.

References checked October 27, 2026: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Responses API](https://developers.openai.com/api/docs/guides/responses).
