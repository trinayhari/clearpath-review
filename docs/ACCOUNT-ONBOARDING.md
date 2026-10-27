# Individual workspace access

The primary application at `/` requires an individual Supabase Auth identity. On `/login`, choose **Create an account**, enter your email and your own password (at least 12 characters), and start in an isolated workspace with marketer access. Password sign-in is primary; no email confirmation is required by the user-selected take-home configuration. `/preview` remains an optional in-memory sample.

Email ownership is not verified and must not be treated as business identity assurance. Signup never joins a shared workspace or grants reviewer privileges based on email/domain or user metadata. `cp_initialize_workspace()` has no arguments: it locks the authenticated Auth row, then atomically/idempotently creates at most one private workspace and fixed marketer membership. Existing approved memberships are preserved. Interrupted setup can retry from the workspace; do not create another account. Existing-email collisions never update passwords or provision access to that identity. Use the existing password or the optional invited-account email-link path.

No-confirmation signup is a take-home usability tradeoff, not a regulated production identity policy. Password recovery and optional email links still depend on email delivery. Human review of your own workspace requires a separately authorized reviewer; self-signup grants no review capability.

## Joining an existing workspace (administrator approval required)

Before changing persistent access, obtain the owner's approval for each actual recipient email, role, and target workspace. Use distinct accounts for Marketing and Compliance reviewer. The owner-approved aliases are two test identities controlled by one person, not proof of independent human review. Never invent recipients, share passwords, expose a service-role key, or use user-editable metadata for roles.

For the existing instance, use only Supabase project `tztlatsflqjlfadipguu` and the approved workspace. Configure Auth URL settings:

- Site URL: `https://clearpath-review-livid.vercel.app`
- Allowed redirect: `https://clearpath-review-livid.vercel.app/auth/confirm`
- Keep default `{{ .ConfirmationURL }}` Invite and Magic Link templates; custom templates are not required.

Site URL and redirect allowlist are specific project configuration changes requiring approval. The app supports default Supabase invitations (implicit callback) and PKCE magic links. Invitation fragments are immediately scrubbed, their identity verified against Supabase, and the user must confirm the verified account before a stateless refresh verifies token ownership and the server installs session cookies. Default dashboard invitations returning to Site URL are routed to this callback, even when an existing account is signed in. No tokens are printed, stored in localStorage, or included in request URLs. One-time token-hash callbacks remain supported if customized later. There is no Auth trigger that joins existing workspaces. New personal workspace initialization is a separate authenticated RPC.

**Optional invitation/email-link delivery limitation:** the built-in sender has restricted recipients and a small project-wide sending quota. Both approved invitations did arrive, but returning email-link delivery hit the quota. Password signup/login no longer depends on email. Do not grant organization membership to bypass sender limits or configure paid SMTP without approval. Parent coordinates admin invitations; do not send duplicates.

Send invitations using **Supabase Dashboard → Authentication → Users → Invite user**, or the supported Auth Admin `inviteUserByEmail` API from an approved secure administrative environment. The application needs no service key. Do not create Auth users by inserting SQL rows. Invite links are credentials: deliver them only through the recipient's private inbox, never chat, source, logs or screenshots.

After resolving the invited user's actual UUID in Auth, insert its approved membership using an authorized administrative database connection. Verify the UUID against the approved email before executing:

```sql
-- Substitute verified IDs and approved display name. This is not executable as-is.
insert into public.cp_members(workspace_id, user_id, role, display_name)
values ('<approved-workspace-uuid>', '<verified-auth-user-uuid>',
        'marketer', '<approved-display-name>');
-- Repeat for the distinct reviewer with role='reviewer'.
```

The existing fictional evaluator workspace is `00000000-0000-4000-8000-000000000001`. Separate evaluation groups should receive separate workspaces and memberships, never access to an unrelated group's records. New users receive their own empty workspace, not shared fictional fixtures. A removed personal membership is not silently recreated by setup.

## First and returning sign-in

Use password signup for a new account and password sign-in on return. Existing invited users without a password can use the secondary email-link option, then set a password privately in Account & sign-in. Email-link requests use `shouldCreateUser: false`. There is no shared password and no automatic credential reset for existing accounts.

Marketing opens My work, creates drafts, runs the clearly labeled mock precheck, and submits an exact version. Reviewers open Awaiting your review and can comment or record a reasoned decision. Roles are checked in PostgreSQL on every command, not chosen in the UI. Sign out ends this browser's session; reopening a saved campaign URL requires authentication again.

## Durable fictional starting campaigns

After membership approval, the marketer can run `scripts/seed-authenticated.mjs` with their own short-lived session access token in a local environment variable. It calls only user-scoped RPCs, checks the intended workspace/role, and creates deterministic fictional drafts and pending reviews. It never creates users, changes memberships, fabricates reviewer decisions, or bypasses RLS. Read the script before running; do not put tokens in shell history. Repeated runs skip matching titles. The script is prepared but provisioning and actual seed execution must be verified separately.

## Verification boundary

Real hosted verification needs the two approved identities and access to their private sign-in delivery. Test refresh/relogin persistence, a two-person change request/revision/approval, and a subsequent new Draft retaining only historical approval. Verify forbidden cross-role/cross-workspace commands separately. Synthetic API fixtures and PostgreSQL JWT-claim tests are useful but do not establish actual email delivery, Auth sessions, or browser persistence. Do not record credential entry, session state, tokens, or private email addresses in walkthrough artifacts.

Official references: [Supabase server-side Auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [supported invitations](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).

### Returning without another email

After signing in with your password, invitation or email link, open **Account & sign-in** in the workspace sidebar (or `/account`). Optionally enter and confirm a unique password of at least 12 characters. This uses Supabase's authenticated `updateUser({ password })`; the application never generates passwords, changes role membership, or stores passwords in browser storage/logs. Only the account holder submits the form. If Supabase requires a fresh sign-in, complete that before retrying. On future visits choose password sign-in on `/login`. Email links remain available. This is an optional account-holder action, not an invitation bypass or preconfigured shared credential.

The built-in email sender is intended for limited testing. On October 27, actual returning sign-in reached `over_email_send_rate_limit` (HTTP 429), after both approved invitation emails successfully arrived. The application distinguishes this sending limit from request throttling and does not promise a one-minute reset or automatically retry. Password sign-in only works after the account holder has set a password. A production rollout needs a supported custom SMTP sender and tested delivery/recovery capacity; none has been purchased or configured here.

References: [Supabase updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser), [Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes).

Current hosted password-security settings (read-only verification, October 27): Secure password change OFF; Require current password when updating OFF; Secure email change ON. Password setup requires a server-validated signed-in account (not verified email ownership), but fresh reauthentication/current-password entry is not currently enforced. The conditional reauthentication error handling above must not be read as an enabled policy. Any future settings change needs separate approval and compatible onboarding verification.
