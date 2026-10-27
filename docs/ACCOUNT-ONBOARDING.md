# Individual workspace access

The primary application at `/` requires an individual Supabase Auth identity and an administrator-assigned workspace membership. `/preview` is an optional isolated sample, with no persistence or production authority. A new identity receives **no workspace access automatically**.

## Administrator provisioning (approval required)

Before changing persistent access, obtain the owner's approval for each actual recipient email, role, and target workspace. Use distinct accounts for Marketing and Compliance reviewer. The owner-approved aliases are two test identities controlled by one person, not proof of independent human review. Never invent recipients, share passwords, expose a service-role key, or use user-editable metadata for roles.

For the existing instance, use only Supabase project `tztlatsflqjlfadipguu` and the approved workspace. Configure Auth URL settings:

- Site URL: `https://clearpath-review-livid.vercel.app`
- Allowed redirect: `https://clearpath-review-livid.vercel.app/auth/confirm`
- Keep default `{{ .ConfirmationURL }}` Invite and Magic Link templates; custom templates are not required.

Site URL and redirect allowlist are specific project configuration changes requiring approval. The app supports default Supabase invitations (implicit callback) and PKCE magic links. Invitation fragments are immediately scrubbed, their identity verified against Supabase, and the user must confirm the verified account before a stateless refresh verifies token ownership and the server installs session cookies. Default dashboard invitations returning to Site URL are routed to this callback, even when an existing account is signed in. No tokens are printed, stored in localStorage, or included in request URLs. One-time token-hash callbacks remain supported if customized later. No public signup-to-membership trigger exists.

**Delivery blocker:** current official Supabase documentation says its built-in sender only sends to exact organization-team email addresses. A deliverable Gmail plus alias is not automatically pre-authorized. If the two approved aliases are not already permitted recipients, custom SMTP or an approved Send Email hook is required. Do not grant organization membership merely to bypass email limits, disable verification, buy Pro, create SMTP credentials or configure a sender without separate approval. Parent coordinates the supported admin invitation/configuration steps; do not send duplicates.

Send invitations using **Supabase Dashboard → Authentication → Users → Invite user**, or the supported Auth Admin `inviteUserByEmail` API from an approved secure administrative environment. The application needs no service key. Do not create Auth users by inserting SQL rows. Invite links are credentials: deliver them only through the recipient's private inbox, never chat, source, logs or screenshots.

After resolving the invited user's actual UUID in Auth, insert its approved membership using an authorized administrative database connection. Verify the UUID against the approved email before executing:

```sql
-- Substitute verified IDs and approved display name. This is not executable as-is.
insert into public.cp_members(workspace_id, user_id, role, display_name)
values ('<approved-workspace-uuid>', '<verified-auth-user-uuid>',
        'marketer', '<approved-display-name>');
-- Repeat for the distinct reviewer with role='reviewer'.
```

The existing fictional evaluator workspace is `00000000-0000-4000-8000-000000000001`. Separate evaluation groups should receive separate workspaces and memberships, never access to an unrelated group's records. A user with no membership sees their account ID and concrete setup instructions, not fictional data.

## First and returning sign-in

Open the invitation once to establish the individual session. Returning users can request an email sign-in link using the same email. This uses `shouldCreateUser: false`; it does not create accounts or grant access. Existing accounts with passwords may use the secondary password option. There is no shared password and the application does not set one for invite recipients.

Marketing opens My work, creates drafts, runs the clearly labeled mock precheck, and submits an exact version. Reviewers open Awaiting your review and can comment or record a reasoned decision. Roles are checked in PostgreSQL on every command, not chosen in the UI. Sign out ends this browser's session; reopening a saved campaign URL requires authentication again.

## Durable fictional starting campaigns

After membership approval, the marketer can run `scripts/seed-authenticated.mjs` with their own short-lived session access token in a local environment variable. It calls only user-scoped RPCs, checks the intended workspace/role, and creates deterministic fictional drafts and pending reviews. It never creates users, changes memberships, fabricates reviewer decisions, or bypasses RLS. Read the script before running; do not put tokens in shell history. Repeated runs skip matching titles. The script is prepared but provisioning and actual seed execution must be verified separately.

## Verification boundary

Real hosted verification needs the two approved identities and access to their private sign-in delivery. Test refresh/relogin persistence, a two-person change request/revision/approval, and a subsequent new Draft retaining only historical approval. Verify forbidden cross-role/cross-workspace commands separately. Synthetic API fixtures and PostgreSQL JWT-claim tests are useful but do not establish actual email delivery, Auth sessions, or browser persistence. Do not record credential entry, session state, tokens, or private email addresses in walkthrough artifacts.

Official references: [Supabase server-side Auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [supported invitations](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).
