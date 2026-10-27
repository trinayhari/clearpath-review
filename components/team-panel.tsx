"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import type { Membership, Role } from "@/lib/domain";

type Team = { id: string; name: string; owner_id?: string };
export function TeamPanel({
  live,
  team,
  members,
  userId,
  onChange,
  onDemoCreate,
  onDemoMember,
  onDemoRename,
}: {
  live: boolean;
  team?: Team;
  members: Membership[];
  userId: string;
  onChange: (workspaceId?: string) => Promise<unknown>;
  onDemoCreate: (name: string) => void;
  onDemoMember: (name: string, role: Role) => void;
  onDemoRename: (name: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invite, setInvite] = useState("");
  const [inviteId, setInviteId] = useState("");
  const admin = team?.owner_id === userId;
  async function command(data: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "Your team could not be updated. Try again.",
        );
      if (data.action === "invite") {
        setInvite(result.token);
        setInviteId(result.id);
        setNotice(
          "Invitation created. Share this one-use code privately. It expires in 7 days.",
        );
      } else {
        if (data.action === "revoke") {
          setInvite("");
          setInviteId("");
        }
        await onChange(result.workspaceId);
        setNotice(
          data.action === "join"
            ? "You joined the team."
            : data.action === "revoke"
              ? "Invitation revoked."
              : "Team saved.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">THE PEOPLE BEHIND EVERY DECISION</div>
        <h1>Team &amp; people</h1>
        <p>
          Create a team, bring in marketing and compliance colleagues, and give
          every review a clear owner.
        </p>
      </div>
      {!live && (
        <p className="workflow-next">
          Sample teams stay in this tab. Sign in to create a shared team and
          invite real colleagues.
        </p>
      )}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="alert success" role="status">
          {notice}
        </p>
      )}
      <div className="team-layout">
        <section className="panel team-roster">
          <div className="section-heading">
            <div>
              <h2>{team?.name || "Your team"}</h2>
              <p>
                {members.length} {members.length === 1 ? "person" : "people"} ·{" "}
                {admin ? "You manage this team" : "Your team directory"}
              </p>
            </div>
          </div>
          {admin && (
            <form
              className="team-form"
              onSubmit={(e) => {
                e.preventDefault();
                const name = String(new FormData(e.currentTarget).get("name"));
                if (live)
                  void command({
                    action: "rename",
                    workspaceId: team?.id,
                    name,
                  });
                else onDemoRename(name);
              }}
            >
              <label>
                Team display name
                <input
                  name="name"
                  defaultValue={team?.name}
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
              <Button variant="outline" disabled={busy}>
                Save team name
              </Button>
            </form>
          )}
          <ul className="people-list">
            {members.map((m) => (
              <li key={m.user_id}>
                <span className="avatar">
                  {(m.display_name || "T").slice(0, 1)}
                </span>
                <div>
                  <strong>
                    {m.display_name || "Team member"}
                    {m.user_id === userId ? " (you)" : ""}
                  </strong>
                  <p>
                    {m.role === "reviewer"
                      ? "Compliance reviewer · makes assigned review decisions"
                      : "Marketing · writes and submits campaigns"}
                  </p>
                  {m.user_id === team?.owner_id && (
                    <small>Team owner · manages people and invitations</small>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!members.some((m) => m.role === "reviewer") && (
            <p className="workflow-next">
              Your team needs a compliance reviewer before you can submit a
              campaign. Invite someone different from the campaign author.
            </p>
          )}
          {admin && (
            <form
              className="team-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (live)
                  void command({
                    action: "invite",
                    workspaceId: team?.id,
                    role: f.get("role"),
                  });
                else {
                  onDemoMember(String(f.get("name")), f.get("role") as Role);
                  e.currentTarget.reset();
                }
              }}
            >
              <h3>{live ? "Invite a colleague" : "Add a sample colleague"}</h3>
              {!live && (
                <label>
                  Sample colleague name
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="e.g. Jordan Lee"
                  />
                </label>
              )}
              <label>
                Team role
                <select name="role">
                  <option value="reviewer">Compliance reviewer</option>
                  <option value="marketer">Marketing</option>
                </select>
              </label>
              <p>
                Reviewers can decide only the campaigns assigned to them. Team
                ownership does not grant approval permission.
              </p>
              <Button disabled={busy}>
                {live ? "Create invitation code" : "Add sample colleague"}
              </Button>
            </form>
          )}
          {invite && (
            <div className="invite-result">
              <label>
                One-use invitation code
                <textarea readOnly value={invite} rows={3} />
              </label>
              <p>
                Ask your colleague to sign in, open Team &amp; people, and paste
                this code under Join a team. Anyone holding it can join with the
                selected role.
              </p>
              <Button
                variant="outline"
                onClick={() =>
                  navigator.clipboard
                    .writeText(invite)
                    .then(() => setNotice("Invitation code copied."))
                    .catch(() => setError("Copy the invitation code manually."))
                }
              >
                Copy invitation code
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  command({ action: "revoke", workspaceId: team?.id, inviteId })
                }
              >
                Revoke this invitation
              </Button>
            </div>
          )}
        </section>
        <div className="team-side">
          <form
            className="panel team-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (live)
                void command({
                  action: "create",
                  name: f.get("name"),
                  displayName: f.get("displayName"),
                  role: "marketer",
                });
              else onDemoCreate(String(f.get("name")));
            }}
          >
            <h2>Create a team</h2>
            <p>
              A separate space for your campaigns, people and review history.
              You’ll be the team owner and a marketer.
            </p>
            <label>
              Team name
              <input
                name="name"
                required
                minLength={2}
                maxLength={80}
                placeholder="e.g. Consumer lending"
              />
            </label>
            {live && (
              <label>
                Your display name
                <input
                  name="displayName"
                  required
                  minLength={2}
                  maxLength={80}
                  defaultValue={
                    members.find((m) => m.user_id === userId)?.display_name ||
                    ""
                  }
                />
              </label>
            )}
            <Button disabled={busy}>Create team</Button>
          </form>
          {live && (
            <form
              className="panel team-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void command({
                  action: "join",
                  token: String(f.get("token")).trim(),
                  displayName: f.get("displayName"),
                });
              }}
            >
              <h2>Join a team</h2>
              <p>
                Get an invitation code from the team owner. Your role is set by
                their invitation.
              </p>
              <label>
                Invitation code
                <textarea
                  name="token"
                  required
                  minLength={64}
                  maxLength={64}
                  rows={3}
                  autoComplete="off"
                />
              </label>
              <label>
                Your display name
                <input
                  name="displayName"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
              <Button disabled={busy} variant="outline">
                Join team
              </Button>
            </form>
          )}
          <div className="team-explainer">
            <h3>Who does what?</h3>
            <p>
              <strong>Marketing</strong> creates copy, runs a precheck and
              chooses a reviewer.
            </p>
            <p>
              <strong>Compliance</strong> reviews the submitted version and
              approves, requests changes or rejects it with a rationale.
            </p>
            <p>
              <strong>Team owners</strong> manage the team and invitations. They
              cannot approve their own campaigns.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
