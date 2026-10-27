# Reviews as a shared work queue

Open reviews are work the team is still tracking. Compliance status (Draft, In review, Changes requested, Approved or Rejected) describes the exact current version. Open/closed state is independent: closing is housekeeping, never an approval or rejection.

## Close, delete and restore

The review author or a team owner can use **Review actions** to:

- **Close review:** move it from Open to Closed. Discussion remains available, but editing, precheck, submission, assignment and decisions require reopening first.
- **Reopen review:** return it to Open without changing its version, reviewer, decision or compliance status.
- **Delete review:** move it to Trash after confirmation. Trash is read-only and excluded from the active queue. This is recoverable deletion, not permanent removal of compliance records.
- **Restore review:** return it to its previous open/closed state, keeping its copy, analysis, discussion and approval history.

All lifecycle actions are recorded in immutable version-specific activity. Ordinary reviewers cannot close or delete another person's work unless they also own the team. Team membership, ownership, current-version checks and row locking are enforced in PostgreSQL, independently of UI controls. Existing approved versions retain their recorded approval when closed, trashed or restored; changing copy still requires a new unapproved draft.

An active, unexpired live-analysis reservation prevents closing or deletion until the attempt finishes or expires. New provider execution writes cannot target closed/trashed reviews. The lifecycle change does not enable providers, change budgets, refund reservations, or authorize additional paid requests.

## Migration

Migration `20261027060000` is applied to the intended hosted Supabase project. Rollback-only hosted verification passed close/reopen, discussion, unauthorized deletion denial, closed approval denial, read-only Trash, restore state, retained approval, private-function bypass denial and outsider isolation. Those synthetic database checks do not claim a real two-account browser session. No user reviews were deleted or closed by setup or verification.

`supabase/migrations/20261027060000_review_lifecycle.sql` adds lifecycle fields without changing existing reviews' statuses. The existing command implementation is kept behind a new lifecycle gate and loses its direct authenticated execute grant so callers cannot bypass the gate. Immutable-record triggers and existing RLS policies remain in force. A separate trigger protects provider reservations and execution writes using the same campaign row lock.

The database test suite covers unauthorized actions, private-function bypass denial, stale versions, concurrent closes, comment behavior, restore state, retained history and analysis/lifecycle races. Sample browser behavior is not an authentication boundary; real permissions are enforced in the database.

## Design reference

The review workspace takes visual cues from PromptArmor's public website: dark surfaces, precise borders, strong typographic hierarchy and restrained blue emphasis. These are observations of the public site, not an assertion of an official PromptArmor design system. The review interaction model uses familiar pull-request concepts: a scoped work queue, named ownership/reviewers, discussion, explicit state transitions and recoverable cleanup.
