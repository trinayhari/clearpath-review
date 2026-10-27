# Individual workspace access

The primary application at `/` requires an individual Supabase Auth identity and an administrator-assigned workspace membership. `/preview` is an optional isolated sample, with no persistence or production authority. A new identity receives **no workspace access automatically**.

## Administrator provisioning (approval required)

Before changing persistent access, obtain the owner's approval for each actual recipient email, role, and target workspace. Use two different people/accounts for Marketing and Compliance reviewer. Never invent recipients, share passwords, expose a service-role key, or use user-editable metadata for roles.

For the existing instance, use only Supabase project `tztlatsflqjlfadipguu` and the approved workspace. Configure Auth URL settings:

- Site URL: `https://clearpath-review-livid.vercel.app`
- Allowed redirect: `https://clearpath-review-livid.vercel.app/auth/confirm`
- Invite email link: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
- Magic Link email link: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`

These are specific project configuration changes; review/approve them with the invitations. The callback supports one-time token hashes and PKCE codes. It deliberately rejects reusable session tokens in URL fragments. Do not enable a public signup-to-membership trigger. Built-in Supabase email delivery may restrict recipients; if delivery requires custom SMTP, stop for an approved sender configuration rather than creating credentials or purchasing a plan.

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
