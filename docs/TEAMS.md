# Teams and review ownership

Every campaign belongs to one team. Its marketing owner writes and revises the copy; its assigned compliance reviewer decides the submitted version. The team owner manages invitations and the team name. Team ownership is separate from the Marketing/Compliance role and never permits self-approval.

## Create a team and bring in a reviewer

1. Sign in and open **Team & people**. Create a named team with your display name. You become its owner and a marketer.
2. Under **Invite a colleague**, choose Marketing or Compliance reviewer and create an invitation code. Share the code privately with the intended colleague.
3. Your colleague signs in with their own account, opens **Team & people**, and pastes the code under **Join a team**. The invitation determines their role; the join form cannot choose or elevate it.
4. Use the team switcher to move between teams. Campaigns, queue counts, people and review assignments are scoped to the selected team.

Codes are random 256-bit bearer invitations, expire after seven days and are accepted once. The database stores only their SHA-256 hash; concurrent acceptance grants exactly one membership. Owners can revoke an invitation before acceptance. Revoking an invitation does not remove a person who already joined. A code is not an email invitation and does not prove the recipient's email ownership. Anyone possessing an unused code can accept its specified role, so share it only through a private channel. No email is sent by this feature, and no shared account or service-role key is needed.

Existing members cannot redeem an invitation to change their role. Role changes, member removal and owner transfer are outside this slice. Do not modify unrelated memberships to bypass those limits.

## Submit and decide

Marketing creates a draft, runs the precheck and chooses a named compliance teammate before submitting. With one eligible reviewer, that person is selected by default. With multiple reviewers, choose explicitly. With no eligible reviewer, set up the team first. The author cannot be their own reviewer.

The queue shows the submission owner, reviewer and next action. A submitted version is locked. Only the assigned reviewer can approve, request changes or reject it with a rationale. The campaign owner or team owner can reassign an active review to another eligible reviewer; the database records the assignment in the version's activity. Other team reviewers can read the campaign but cannot decide it.

Requested changes require a new version and another precheck. A new revision is a Draft and never inherits the prior version's approval. The previous decision remains in immutable history.

`/preview` demonstrates team creation, sample people, named assignment and the review loop entirely in memory. Its persona selector is a simulation, not authentication or authorization. Refresh clears sample changes. Real authorization is enforced by PostgreSQL membership, role, owner, version and assignment checks.

## Migration and existing data

The migration `supabase/migrations/20261027050000_teams_and_review_assignment.sql` has been applied to the intended hosted Supabase project and recorded as version `20261027050000`. Apply it through an authorized migration connection when preparing another instance. Do not run the local test bootstrap against hosted databases.

The migration adds team ownership, reviewer assignment and private invitation storage. It grants ownership only to existing personal workspaces whose creator is recorded in the private onboarding map. Existing shared/seeded teams receive no inferred owner and no automatic membership changes. An administrator must explicitly establish a legitimate owner if self-service invitations are desired for those teams; the application does not let a member claim an existing team.

Previously submitted campaigns have no assigned reviewer. Their campaign owner must open the campaign, select an eligible reviewer and choose **Assign reviewer** before a decision can be recorded. Prior decisions remain unchanged. For compatibility, an older submit caller that omits a reviewer can submit only when there is exactly one eligible reviewer or an existing valid assignment. Otherwise the database requests an explicit selection.

The migration preserves the existing trusted precheck and external-analysis exclusion checks. It does not change the live provider, signing keys, budgets, model, workspace allowlist or enablement settings.

## Validation boundary

Local PostgreSQL tests exercise creator ownership, denied unauthorized invitations/renames, single-use and concurrent join, expiry/revocation, role-escalation rejection, valid reviewer assignment, reassignment, wrong-reviewer denial and anonymous denial. Browser tests exercise the sample experience and synthetic authenticated API responses. After hosted migration application, rollback-only database checks passed team creation, invitation creation/acceptance, non-owner denial, token reuse denial and outsider isolation, plus the existing full review/RLS workflow. These checks use synthetic database identities and roll back their data; they do not verify real Auth sessions or the new two-account browser team invitation flow. Recheck that real-account hosted workflow, including assigning legacy submissions. Paid/live model execution is separate and was not exercised by this team change.
