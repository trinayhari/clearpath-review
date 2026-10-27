# Signing provisioning plan — approval required; not executed

Target only Supabase `tztlatsflqjlfadipguu` and Vercel project `prj_umtJoMItJCqtFwfw4z6pv7WVI6OB`, production environment. Use the latest reviewed migration `20261027012748_reserved_trusted_external_analysis.sql`; its reservation RPC now requires server proof. Deploy the matching runtime code before activation.

The proposed parent-managed transient transfer fits the implementation: PostgreSQL generates the secret, keeps it disabled, and its encoded result is passed directly to the Vercel sensitive setter in tool memory. **Do not print, notify, persist to files, interpolate into SQL text, or expose the secret-bearing response to the model/chat.** Filter setter/readback results to metadata only. Confirm the tool execution path can suppress secret values before proceeding. If that cannot be guaranteed, use an approved secure owner-side provisioning method instead.

After explicit approval, exact nonsecret schema/configuration:

```sql
-- Generate in DB; no actual key is embedded in SQL text.
-- The returned secret_hex must flow directly to the sensitive setter, never output.
insert into private.cp_ai_keys(id,secret,enabled)
values ('clearpath-test-20261027-v1',extensions.gen_random_bytes(32),false)
returning id,encode(secret,'hex') as secret_hex;
```

Vercel variables:

- `CLEARPATH_ANALYSIS_SIGNING_KEY`: returned 64-character hex value; **sensitive, production only**.
- `CLEARPATH_ANALYSIS_KEY_ID`: `clearpath-test-20261027-v1`; production only.
- `CLEARPATH_LIVE_ANALYSIS_ENABLED`: absent or `false` during staging. Do not enable as part of secret transfer.
- Existing `OPENAI_API_KEY` remains in place and is never retrieved/exported.

Insert configuration disabled, without overwriting any unexpected existing row:

```sql
insert into private.cp_ai_limits
(singleton,enabled,active_key,total_budget_microusd,per_user_hour,per_workspace_day)
values (true,false,'clearpath-test-20261027-v1',2000000,2,2);
insert into private.cp_ai_workspaces(workspace_id,enabled)
values ('00000000-0000-4000-8000-000000000001',false);
```

`total_budget_microusd` is a cumulative global ceiling. If any other approved validation has spent or reserved money, use **no more than the remaining approved amount**. Do not delete executions to restore allowance. Each reservation permanently accounts for 200000 micro-USD ($0.20), including failures and uncertain outcomes.

Verify only nonsecret metadata: key ID/disabled flag, byte length=32, expected Vercel variable names/types/targets, global limits and allowlist. Never decrypt/read back the Vercel value. On uncertain setter outcome, inspect metadata before another write; leave DB key disabled. Do not generate a second key or overwrite a pre-existing ID automatically.

After a separate approved activation step and matching deployment, enable the key, the one global configuration row, and the named workspace, then set the server enablement flag. Execute only the approved authenticated fictional runtime requests. Disable the flag/global limit after bounded validation unless ongoing operation is separately approved. A valid key alone cannot approve campaigns or bypass owner/membership checks.

Rotation: create a new approved ID and sensitive value; never overwrite existing secret bytes. Reservations and signatures pin their key ID. Keep any prior key enabled only for its explicitly approved short in-flight window; setting its `enabled=false` revokes verification immediately. All provisioning and rotation require the corresponding action-time approval.
