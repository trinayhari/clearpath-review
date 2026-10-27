"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  GitBranch,
  Inbox,
  Layers3,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  Users,
} from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";
import { TeamPanel } from "./team-panel";
import {
  applicablePolicies,
  roleForWorkspace,
  type Membership,
  contentSchema,
  mockProvider,
  policies,
  products,
  statuses,
  type Campaign,
  type Finding,
  type Role,
} from "@/lib/domain";
import { demoCommand } from "@/lib/fixtures";
type Tab = "queue" | "policies" | "analytics" | "new" | "review" | "team";
const actionLabels: Record<string, string> = {
  create: "created the campaign",
  revise: "saved a new version",
  analyze: "ran precheck",
  submit: "submitted for review",
  approve: "approved this version",
  reject: "rejected this version",
  request_changes: "requested changes",
  comment: "commented",
  assign: "assigned a reviewer",
};
const date = (s: string) =>
  new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
function Badge({ value }: { value: string }) {
  return (
    <span className={`badge ${value.toLowerCase().replaceAll(" ", "-")}`}>
      <span className="dot" />
      {value}
    </span>
  );
}
export default function Workspace({
  initial,
  mode = "preview",
}: {
  initial: Campaign[];
  mode?: "live" | "preview";
}) {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    mode === "live" ? "loading" : "ready",
  );
  const [analysisMode, setAnalysisMode] = useState<"mock" | "openai">("mock");
  const [identity, setIdentity] = useState({ name: "", email: "" });
  const [draftEdits, setDraftEdits] = useState<
    Record<string, { versionId: string; content: string }>
  >({});
  const [newDraft, setNewDraft] = useState({
    title: "",
    product: "Personal loans",
    channel: "Email",
    content: "",
  });
  const [policyContext, setPolicyContext] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>(
    mode === "live"
      ? []
      : [
          {
            workspace_id: "demo-team",
            user_id: "demo-maya",
            role: "marketer",
            display_name: "Maya Chen",
          },
          {
            workspace_id: "demo-team",
            user_id: "demo-alex",
            role: "reviewer",
            display_name: "Alex Morgan",
          },
        ],
  );
  const [reviewerChoice, setReviewerChoice] = useState("");
  const [previewReviewerId, setPreviewReviewerId] = useState("demo-alex");
  const [workspaces, setWorkspaces] = useState<
    {
      id: string;
      name: string;
      owner_id?: string;
      analysisMode?: "mock" | "openai";
    }[]
  >(
    mode === "live"
      ? []
      : [
          {
            id: "demo-team",
            name: "ClearPath Financial",
            owner_id: "demo-maya",
          },
        ],
  );
  const [clock, setClock] = useState<number | null>(null);
  useEffect(() => setClock(Date.now()), []);
  const [campaigns, setCampaigns] = useState(initial),
    [tab, setTab] = useState<Tab>("queue"),
    [selected, setSelected] = useState<string | null>(null),
    [role, setRole] = useState<Role>("marketer"),
    [live, setLive] = useState(mode === "live"),
    [workspaceId, setWorkspaceId] = useState(
      mode === "live" ? "" : "demo-team",
    ),
    [userId, setUserId] = useState(mode === "live" ? "" : "demo-maya"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All work"),
    [productFilter, setProductFilter] = useState("All products"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [content, setContent] = useState(""),
    [note, setNote] = useState(""),
    [detailTab, setDetailTab] = useState("Findings"),
    [viewVersion, setViewVersion] = useState(0),
    [preview, setPreview] = useState<Finding | null>(null),
    [decision, setDecision] = useState<string | null>(null),
    [highlight, setHighlight] = useState(""),
    [failure, setFailure] = useState<"normal" | "timeout" | "error">("normal");
  useEffect(() => {
    if (tab === "policies" && policyContext) {
      const rule = document.getElementById(policyContext);
      rule?.focus({ preventScroll: true });
      rule?.scrollIntoView({ block: "center" });
    }
  }, [tab, policyContext]);
  const current = campaigns.find((c) => c.id === selected);
  const latest = current?.versions.at(-1);
  const version = current?.versions[viewVersion] ?? latest;
  const historical = Boolean(version && latest && version.id !== latest.id);
  const editable = Boolean(
    current &&
    role === "marketer" &&
    (!live || current.ownerId === userId) &&
    ["Draft", "Changes requested", "Approved", "Rejected"].includes(
      current.status,
    ),
  );
  async function load(preferredWorkspace?: string) {
    if (mode === "live") {
      const initialized = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "initialize_workspace" }),
      });
      if (initialized.status === 401) {
        location.replace("/login?expired=1");
        throw new Error("Your session expired. Sign in again.");
      }
      if (!initialized.ok) {
        const result = await initialized.json();
        throw new Error(
          result.error ||
            "Workspace setup could not finish. Retry without creating another account.",
        );
      }
    }
    const r = await fetch("/api/workspace");
    const data = await r.json();
    if (r.status === 401) {
      location.replace("/login?expired=1");
      throw new Error("Your session expired. Sign in again to continue.");
    }
    if (!r.ok) throw new Error(data.error);
    setCampaigns(data.campaigns);
    setUserId(data.userId);
    setMemberships(data.members);
    setWorkspaces(data.workspaces);
    const targetWorkspace =
      preferredWorkspace ||
      (data.workspaces.some((w: { id: string }) => w.id === workspaceId)
        ? workspaceId
        : "") ||
      data.members.find((m: Membership) => m.user_id === data.userId)
        ?.workspace_id ||
      "";
    setAnalysisMode(
      data.workspaces.find(
        (w: { id: string; analysisMode?: string }) => w.id === targetWorkspace,
      )?.analysisMode === "openai"
        ? "openai"
        : "mock",
    );
    const member = data.members.find(
      (m: Membership) =>
        m.user_id === data.userId && m.workspace_id === targetWorkspace,
    );
    setRole(
      roleForWorkspace(data.members, data.userId, targetWorkspace) ??
        "marketer",
    );
    setWorkspaceId(targetWorkspace);
    setIdentity({
      name: member?.display_name || data.email || "Your account",
      email: data.email || "",
    });
    if (!data.workspaces.some((w: { id: string }) => w.id === workspaceId))
      setFilter(member?.role === "reviewer" ? "In review" : "My work");
    const requested = new URLSearchParams(location.search).get("campaign");
    const requestedCampaign = (data.campaigns as Campaign[]).find(
      (c) => c.id === requested,
    );
    if (!preferredWorkspace && !selected && requestedCampaign) {
      setSelected(requestedCampaign.id);
      setTab("review");
      setViewVersion(requestedCampaign.versions.length - 1);
      setContent(requestedCampaign.versions.at(-1)!.content);
      setWorkspaceId(requestedCampaign.workspaceId!);
      setAnalysisMode(
        data.workspaces.find(
          (w: { id: string; analysisMode?: string }) =>
            w.id === requestedCampaign.workspaceId,
        )?.analysisMode === "openai"
          ? "openai"
          : "mock",
      );
      setRole(
        roleForWorkspace(
          data.members,
          data.userId,
          requestedCampaign.workspaceId!,
        ) ?? "marketer",
      );
    }

    return data.campaigns as Campaign[];
  }
  useEffect(() => {
    if (
      mode === "live" ||
      new URLSearchParams(location.search).get("workspace") === "live"
    ) {
      setLive(true);
      setCampaigns([]);
      setLoadState("loading");
      load()
        .then(() => setLoadState("ready"))
        .catch((e) => {
          setError(e.message);
          setLoadState("error");
        });
    }
  }, []);
  async function refreshWorkspace() {
    setLoadState("loading");
    setError("");
    try {
      await load();
      setLoadState("ready");
    } catch (e) {
      setError((e as Error).message);
      setLoadState("error");
    }
  }
  function showQueue() {
    setTab("queue");
    if (live) history.replaceState(null, "", "/");
  }
  function open(c: Campaign) {
    if (live) history.replaceState(null, "", `/?campaign=${c.id}`);
    if (live)
      setRole(
        roleForWorkspace(memberships, userId, c.workspaceId ?? workspaceId) ??
          "marketer",
      );
    setSelected(c.id);
    setReviewerChoice(c.reviewerId || "");
    setTab("review");
    setViewVersion(c.versions.length - 1);
    setContent(
      draftEdits[c.id]?.versionId === c.versions.at(-1)!.id
        ? draftEdits[c.id].content
        : c.versions.at(-1)!.content,
    );
    setDetailTab("Findings");
    setError("");
    setNotice("");
    setNote("");
    setHighlight("");
  }
  async function act(action: string, data: Record<string, unknown> = {}) {
    if (!current || !latest) return;
    setBusy(true);
    setError("");
    try {
      if (live) {
        const r = await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            requestId: crypto.randomUUID(),
            campaignId: current.id,
            versionId: latest.id,
            data,
          }),
        });
        const result = await r.json();
        if (!r.ok) throw new Error(result.error);
        const updated = await load().catch(() => {
          setLoadState("error");
          throw new Error(
            "Your action was saved, but the workspace could not refresh. Reload the workspace before taking another action.",
          );
        });
        if (action === "revise") {
          const c = updated.find((c) => c.id === current.id)!;
          setViewVersion(c.versions.length - 1);
          setContent(c.versions.at(-1)!.content);
        }
      } else {
        if (action === "analyze")
          data = {
            findings: await mockProvider.analyze(
              latest.content,
              current.product,
              failure,
            ),
          };
        const next = demoCommand(current, role, action, latest.id, {
          ...data,
          actor: memberships.find(
            (m) => m.user_id === activeUserId && m.workspace_id === workspaceId,
          )?.display_name,
        });
        setCampaigns((cs) => cs.map((c) => (c.id === next.id ? next : c)));
        if (action === "revise") {
          setViewVersion(next.versions.length - 1);
          setContent(next.versions.at(-1)!.content);
        }
      }
      setNotice(
        action === "revise"
          ? "New immutable version saved. Run precheck again before submitting."
          : action === "analyze"
            ? live && analysisMode === "openai"
              ? "OpenAI precheck complete. Human review is still required."
              : "Mock precheck complete. Human review is still required."
            : action === "submit"
              ? "Version submitted. Content is now locked for human review."
              : action === "assign"
                ? "Reviewer assigned. The submitted content stays locked."
                : action === "comment"
                  ? "Comment added to this version."
                  : "Decision recorded against this exact version.",
      );
      if (action === "revise")
        setDraftEdits((previous) => {
          const next = { ...previous };
          delete next[current.id];
          return next;
        });
      setNote("");
      setPreview(null);
      setDecision(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const activeUserId = live
    ? userId
    : role === "marketer"
      ? "demo-maya"
      : previewReviewerId;
  const teamMembers = memberships.filter((m) => m.workspace_id === workspaceId);
  const reviewers = teamMembers.filter(
    (m) => m.role === "reviewer" && m.user_id !== current?.ownerId,
  );
  const chosenReviewer =
    reviewerChoice ||
    current?.reviewerId ||
    (reviewers.length === 1 ? reviewers[0].user_id : "");
  const scopedCampaigns = campaigns.filter(
    (c) => (c.workspaceId || "demo-team") === workspaceId,
  );
  const nextAction = (c: Campaign) =>
    c.status === "In review"
      ? `${c.reviewer || "Unassigned reviewer"}: review v${c.versions.at(-1)!.number}`
      : c.status === "Approved"
        ? `Approved v${c.versions.at(-1)!.number} · ready to use`
        : c.status === "Changes requested"
          ? `${c.owner}: revise the copy`
          : c.status === "Rejected"
            ? `${c.owner}: review the rationale`
            : `${c.owner}: ${c.versions.at(-1)!.analyzed ? "choose reviewer & submit" : "prepare & precheck"}`;
  const queue = scopedCampaigns
    .filter(
      (c) =>
        (filter === "All work" ||
          (filter === "My work" && c.ownerId === activeUserId) ||
          (filter === "Assigned to me" &&
            c.reviewerId === activeUserId &&
            c.status === "In review") ||
          c.status === filter) &&
        (productFilter === "All products" || c.product === productFilter) &&
        `${c.title} ${c.owner} ${c.reviewer || ""} ${c.product}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      live && role === "marketer"
        ? {
            "Changes requested": 0,
            Draft: 1,
            "In review": 2,
            Approved: 3,
            Rejected: 4,
          }[a.status] -
          {
            "Changes requested": 0,
            Draft: 1,
            "In review": 2,
            Approved: 3,
            Rejected: 4,
          }[b.status]
        : (a.status === "In review" ? -1 : 1) -
          (b.status === "In review" ? -1 : 1),
    );
  const inReview = scopedCampaigns.filter(
    (c) => c.status === "In review",
  ).length;
  const changes = scopedCampaigns.filter(
    (c) => c.status === "Changes requested",
  ).length;
  const approved = scopedCampaigns.filter(
    (c) => c.status === "Approved",
  ).length;
  return (
    <div
      className={`app-shell ${live ? "workspace-live" : "workspace-preview"}`}
    >
      <aside className="sidebar">
        <Link href={live ? "/" : "/preview"} className="brand">
          <span className="logo">
            <Layers3 size={20} />
          </span>
          ClearPath<span className="brand-sub">REVIEW</span>
        </Link>
        <div className="workspace-switch">
          <span className="company-icon">C</span>
          <div>
            {live
              ? workspaces.find((w) => w.id === workspaceId)?.name ||
                "Your workspace"
              : workspaces.find((w) => w.id === workspaceId)?.name ||
                "Sample team"}
            <small>
              {live ? "Marketing & compliance" : "Sample workspace"}
            </small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {(
            [
              { id: "queue", label: "Review queue", Icon: Inbox },
              { id: "policies", label: "Policy library", Icon: BookOpen },
              { id: "analytics", label: "Analytics", Icon: BarChart3 },
              { id: "team", label: "Team & people", Icon: Users },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-item ${tab === id || (id === "queue" && ["new", "review"].includes(tab)) ? "active" : ""}`}
              onClick={() => {
                setPolicyContext(null);
                setTab(id);
                if (id === "queue" && live) history.replaceState(null, "", "/");
                setError("");
                setNotice("");
              }}
            >
              <Icon size={18} />
              {label}
              {id === "queue" && <span className="nav-count">{inReview}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {live && (
            <a className="nav-item" href="/account">
              Account &amp; sign-in
            </a>
          )}
          <div className="safe-note">
            <ShieldCheck size={19} />
            <strong>Human judgment, always.</strong>
            <p>
              Prechecks surface potential issues. People make every decision.
            </p>
          </div>
          <div className="profile">
            <span className="avatar">
              {live
                ? identity.name
                    .split(/[ @.]/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((s) => s[0])
                    .join("")
                    .toUpperCase()
                : role === "marketer"
                  ? "MC"
                  : "AM"}
            </span>
            <div>
              <strong>
                {live
                  ? identity.name || "Your account"
                  : role === "marketer"
                    ? "Maya Chen"
                    : memberships.find(
                        (m) =>
                          m.user_id === previewReviewerId &&
                          m.workspace_id === workspaceId,
                      )?.display_name || "Alex Morgan"}
              </strong>
              <small>
                {live && !workspaceId
                  ? "Access pending"
                  : role === "marketer"
                    ? "Marketing"
                    : "Compliance reviewer"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={14} />{" "}
            <strong>
              {tab === "policies"
                ? "Policy library"
                : tab === "analytics"
                  ? "Analytics"
                  : tab === "team"
                    ? "Team & people"
                    : "Review queue"}
            </strong>
            {tab === "review" && (
              <>
                <ChevronRight size={14} />
                <span>Campaign review</span>
              </>
            )}
          </span>
          <div className="top-actions">
            {!live && (
              <span className="mock-label">
                <Sparkles size={13} />
                Mock AI
              </span>
            )}
            {live ? (
              <Button
                variant="ghost"
                onClick={async () => {
                  const response = await fetch("/api/auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: '{"action":"logout"}',
                  });
                  if (!response.ok) {
                    setError("Unable to sign out. Please try again.");
                    return;
                  }
                  location.replace("/login");
                }}
              >
                Sign out
              </Button>
            ) : (
              <Link href="/login">
                Sign in <ArrowUpRight size={13} />
              </Link>
            )}
          </div>
        </header>
        <div className={live ? "workspace-context" : "demo-strip"}>
          <span>
            <span className="demo-dot" />
            {live
              ? `${workspaces.find((w) => w.id === workspaceId)?.name || "Workspace"} · ${role === "marketer" ? "Marketing" : "Compliance reviewer"}`
              : "Interactive demo · Fictional data · Changes stay in this tab"}
          </span>
          {workspaces.length > 1 && (
            <label>
              Workspace{" "}
              <select
                aria-label="Active workspace"
                value={workspaceId}
                onChange={(e) => {
                  const nextMember = memberships.find(
                    (m) =>
                      m.user_id === userId && m.workspace_id === e.target.value,
                  );
                  setIdentity((previous) => ({
                    ...previous,
                    name:
                      nextMember?.display_name ||
                      previous.email ||
                      "Your account",
                  }));
                  setFilter(
                    nextMember?.role === "reviewer" ? "In review" : "My work",
                  );
                  setWorkspaceId(e.target.value);
                  setAnalysisMode(
                    workspaces.find((w) => w.id === e.target.value)
                      ?.analysisMode === "openai"
                      ? "openai"
                      : "mock",
                  );
                  setRole(
                    roleForWorkspace(memberships, userId, e.target.value) ??
                      "marketer",
                  );
                  showQueue();
                  setSelected(null);
                }}
              >
                {workspaces.map((w) => (
                  <option value={w.id} key={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!live && (
            <label>
              Explore as{" "}
              <select
                aria-label="Demo role"
                value={
                  role === "marketer"
                    ? "marketer"
                    : previewReviewerId === "demo-alex"
                      ? "reviewer"
                      : previewReviewerId
                }
                onChange={(e) => {
                  setRole(
                    e.target.value === "marketer" ? "marketer" : "reviewer",
                  );
                  if (e.target.value !== "marketer")
                    setPreviewReviewerId(
                      e.target.value === "reviewer"
                        ? "demo-alex"
                        : e.target.value,
                    );
                  setFilter("All work");
                }}
              >
                <option value="marketer">Maya · Marketer</option>
                {teamMembers
                  .filter((m) => m.role === "reviewer")
                  .map((m) => (
                    <option
                      key={m.user_id}
                      value={m.user_id === "demo-alex" ? "reviewer" : m.user_id}
                    >
                      {m.display_name} · Reviewer
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
        <main>
          {live && loadState === "loading" ? (
            <section
              className="workspace-loading"
              aria-label="Loading workspace"
              role="status"
            >
              <h1>Opening your workspace…</h1>
              <p>Retrieving your saved campaigns and review history.</p>
              {[1, 2, 3, 4].map((n) => (
                <div className="skeleton-row" key={n} />
              ))}
            </section>
          ) : null}
          {live && loadState === "error" ? (
            <section className="panel workspace-empty">
              <h1>We couldn’t load your workspace</h1>
              <p>
                {error} Your saved campaigns have not been replaced or reset.
              </p>
              <Button onClick={refreshWorkspace}>Try loading again</Button>
            </section>
          ) : null}
          {live && loadState === "ready" && !workspaceId && tab !== "team" ? (
            <section className="panel workspace-empty">
              <ShieldCheck size={30} />
              <h1>Your account is verified</h1>
              <p>
                <strong>{identity.email}</strong> does not have workspace access
                yet. Create a team or use an invitation code from a team owner
                to join as Marketing or Compliance reviewer.
              </p>
              <code>{userId}</code>
              <div className="form-actions">
                <Button
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(userId)
                      .then(() => setNotice("Account ID copied."))
                  }
                >
                  Copy account ID
                </Button>
                <Button onClick={() => setTab("team")}>
                  Create or join a team
                </Button>
                <Button onClick={refreshWorkspace}>Check access again</Button>
              </div>
              <a
                href="https://github.com/trinayhari/clearpath-review/blob/main/docs/ACCOUNT-ONBOARDING.md"
                target="_blank"
                rel="noreferrer"
              >
                Workspace owner’s setup steps ↗
              </a>
            </section>
          ) : null}
          {(!live ||
            (loadState === "ready" && (workspaceId || tab === "team"))) && (
            <>
              {error && (
                <div className="alert error" role="alert">
                  {error}
                  <button
                    aria-label="Dismiss error"
                    onClick={() => setError("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {notice && (
                <div className="alert success" role="status">
                  {notice}
                  <button
                    aria-label="Dismiss notification"
                    onClick={() => setNotice("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {tab === "team" && (
                <TeamPanel
                  key={workspaceId}
                  live={live}
                  team={workspaces.find((w) => w.id === workspaceId)}
                  members={teamMembers}
                  userId={activeUserId}
                  onChange={async (id) => {
                    if (id) {
                      history.replaceState(null, "", "/");
                      setSelected(null);
                    }
                    await load(id);
                  }}
                  onDemoCreate={(name) => {
                    const id = crypto.randomUUID();
                    setWorkspaces((ws) => [
                      ...ws,
                      { id, name, owner_id: "demo-maya" },
                    ]);
                    setMemberships((ms) => [
                      ...ms,
                      {
                        workspace_id: id,
                        user_id: "demo-maya",
                        role: "marketer",
                        display_name: "Maya Chen",
                      },
                    ]);
                    setWorkspaceId(id);
                    setRole("marketer");
                    setFilter("All work");
                    setSelected(null);
                  }}
                  onDemoRename={(name) =>
                    setWorkspaces((ws) =>
                      ws.map((w) =>
                        w.id === workspaceId ? { ...w, name } : w,
                      ),
                    )
                  }
                  onDemoMember={(name, memberRole) => {
                    setMemberships((ms) => [
                      ...ms,
                      {
                        workspace_id: workspaceId,
                        user_id: crypto.randomUUID(),
                        role: memberRole,
                        display_name: name,
                      },
                    ]);
                  }}
                />
              )}
              {tab === "queue" && (
                <>
                  <div className="page-heading">
                    <div className="eyebrow">KEEP GOOD WORK MOVING</div>
                    <div className="heading-row">
                      <div>
                        <h1>
                          {live
                            ? role === "reviewer"
                              ? "Awaiting your review"
                              : "Your campaigns"
                            : "Review queue"}
                        </h1>
                        <p>
                          {live
                            ? role === "reviewer"
                              ? "Review the submitted copy, discuss changes, and record a version-specific decision."
                              : "Prepare, revise, and track the campaigns you own."
                            : "A clear path from first draft to final approval."}
                        </p>
                      </div>
                      {role === "marketer" && (
                        <Button
                          onClick={() => {
                            setTab("new");
                            setError("");
                            setNotice("");
                          }}
                        >
                          <Plus size={16} />
                          New submission
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="handoff-guide" aria-label="How reviews work">
                    <div>
                      <span>1</span>
                      <strong>Marketing prepares</strong>
                      <p>Create a draft and run precheck.</p>
                    </div>
                    <div>
                      <span>2</span>
                      <strong>Choose a reviewer</strong>
                      <p>Submit a locked version to a named teammate.</p>
                    </div>
                    <div>
                      <span>3</span>
                      <strong>Compliance decides</strong>
                      <p>Approve, request changes or reject with a reason.</p>
                    </div>
                    <Button variant="outline" onClick={() => setTab("team")}>
                      <Users size={16} />
                      Manage team
                    </Button>
                  </div>
                  {teamMembers.length > 0 &&
                    !teamMembers.some((m) => m.role === "reviewer") && (
                      <div className="workflow-next">
                        <strong>Bring in your reviewer.</strong> Add a
                        compliance colleague in Team &amp; people before
                        submitting your first campaign.{" "}
                        <button onClick={() => setTab("team")}>
                          Set up your team →
                        </button>
                      </div>
                    )}
                  <div className="stats-row">
                    <div className="stat">
                      <span>
                        Awaiting review <Clock3 size={16} />
                      </span>
                      <strong>
                        {inReview}
                        <small>ready for a human decision</small>
                      </strong>
                    </div>
                    <div className="stat">
                      <span>
                        Changes requested <GitBranch size={16} />
                      </span>
                      <strong>
                        {changes}
                        <small>waiting on a revised draft</small>
                      </strong>
                    </div>
                    <div className="stat">
                      <span>
                        Approved <CheckCircle2 size={16} />
                      </span>
                      <strong>
                        {approved}
                        <small>exact versions signed off</small>
                      </strong>
                    </div>
                  </div>
                  <div className="panel queue-panel">
                    <div className="queue-tabs">
                      {[
                        ...(role === "marketer"
                          ? ["My work"]
                          : ["Assigned to me"]),
                        "All work",
                        "In review",
                        "Changes requested",
                        "Draft",
                        "Approved",
                        "Rejected",
                      ].map((s) => (
                        <button
                          className={filter === s ? "selected" : ""}
                          key={s}
                          onClick={() => setFilter(s)}
                        >
                          {s === "In review" ? "Awaiting review" : s}
                          {s === "All work" && (
                            <span>{scopedCampaigns.length}</span>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="filters">
                      <div className="search-box">
                        <Search size={17} />
                        <input
                          aria-label="Search campaigns"
                          placeholder="Search campaigns, owners, or products…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                          <button
                            onClick={() => setSearch("")}
                            aria-label="Clear search"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      <select
                        aria-label="Filter product"
                        value={productFilter}
                        onChange={(e) => setProductFilter(e.target.value)}
                      >
                        <option>All products</option>
                        {products.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Campaign</th>
                            <th>Status</th>
                            <th>Precheck risk</th>
                            <th>People &amp; next action</th>
                            <th>Review age</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {queue.map((c) => {
                            const v = c.versions.at(-1)!;
                            const high = v.findings.filter(
                              (f) => f.severity === "High",
                            ).length;
                            return (
                              <tr key={c.id} onClick={() => open(c)}>
                                <td>
                                  <button
                                    className="campaign-link"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      open(c);
                                    }}
                                  >
                                    <span className="file-icon">
                                      <FileText size={18} />
                                    </span>
                                    <span>
                                      <strong>{c.title}</strong>
                                      <small>
                                        {c.product}
                                        <span>·</span>
                                        {c.channel}
                                        <span>·</span>v{v.number}
                                      </small>
                                    </span>
                                  </button>
                                </td>
                                <td data-label="Status">
                                  <Badge value={c.status} />
                                </td>
                                <td data-label="Precheck">
                                  {!v.analyzed ? (
                                    <span className="muted">Not checked</span>
                                  ) : high ? (
                                    <span className="risk-high">
                                      {high} high priority
                                    </span>
                                  ) : v.findings.length ? (
                                    <span className="risk-medium">
                                      {v.findings.length} to verify
                                    </span>
                                  ) : (
                                    <span className="muted">
                                      <Check size={14} />
                                      No flags
                                    </span>
                                  )}
                                </td>
                                <td
                                  className="owner-cell"
                                  data-label="People & next action"
                                >
                                  <span className="owner">
                                    <span className="avatar tiny">
                                      {c.owner
                                        .split(/[ @.]/)
                                        .filter(Boolean)
                                        .slice(0, 2)
                                        .map((s) => s[0])
                                        .join("")
                                        .toUpperCase()}
                                    </span>
                                    {c.owner} · Marketing
                                  </span>
                                  <small className="reviewer-line">
                                    Reviewer:{" "}
                                    {c.reviewer || "Choose on submission"}
                                  </small>
                                  <small className="next-action">
                                    {nextAction(c)}
                                  </small>
                                </td>
                                <td className="muted">
                                  {c.submittedAt
                                    ? clock === null
                                      ? date(c.submittedAt)
                                      : `${Math.max(0, Math.floor((clock - Date.parse(c.submittedAt)) / 86400000))}d since submission`
                                    : `Draft · ${date(c.updatedAt)}`}
                                </td>
                                <td>
                                  <ChevronRight size={15} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {!queue.length && (
                      <div className="empty">
                        <Search size={28} />
                        <h3>
                          {scopedCampaigns.length
                            ? "No campaigns match"
                            : "No campaigns yet"}
                        </h3>
                        <p>
                          {scopedCampaigns.length
                            ? "Try another search or reset your filters."
                            : role === "reviewer"
                              ? "Campaigns will appear here when your marketing team creates them."
                              : "Create your first draft. It stays private to your workspace until you submit it for review."}
                        </p>
                        {scopedCampaigns.length > 0 && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSearch("");
                              setFilter("All work");
                              setProductFilter("All products");
                            }}
                          >
                            Reset filters
                          </Button>
                        )}
                      </div>
                    )}
                    <div className="table-footer">
                      {queue.length} campaigns
                      <span>
                        Potential issues are guidance, never automatic
                        decisions.
                      </span>
                    </div>
                  </div>
                  <div className="subtle-footer">
                    <ShieldCheck size={14} />
                    {live
                      ? "Seeded examples and policy requirements are fictional. Your team’s review history is saved."
                      : "All policies and campaigns in this sample workspace are fictional."}
                  </div>
                </>
              )}
              {tab === "new" && (
                <>
                  <button className="back" onClick={showQueue}>
                    <ArrowLeft size={15} />
                    Review queue
                  </button>
                  <div className="page-heading">
                    <div className="eyebrow">START WITH THE STORY</div>
                    <h1>New submission</h1>
                    <p>
                      Bring your campaign. We’ll help you prepare it for a
                      thoughtful human review.
                    </p>
                  </div>
                  <div className="new-layout">
                    <form
                      className="panel editor-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setBusy(true);
                        setError("");
                        try {
                          const f = new FormData(e.currentTarget);
                          const data = contentSchema.parse(
                            Object.fromEntries(f),
                          );
                          if (live) {
                            const r = await fetch("/api/workspace", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                action: "create",
                                data: { ...data, workspaceId },
                              }),
                            });
                            const result = await r.json();
                            if (!r.ok) throw new Error(result.error);
                            const updated = await load().catch(() => {
                              setLoadState("error");
                              throw new Error(
                                "Your action was saved, but the workspace could not refresh. Reload the workspace before taking another action.",
                              );
                            });
                            const created = updated.find(
                              (c) => c.id === result.id,
                            );
                            if (created) open(created);
                            else showQueue();
                            setNotice(
                              "Draft saved. Run a precheck when you’re ready.",
                            );
                          } else {
                            const id = crypto.randomUUID(),
                              vid = crypto.randomUUID(),
                              at = new Date().toISOString();
                            const c: Campaign = {
                              ...data,
                              id,
                              owner: "Maya Chen",
                              ownerId: "demo-maya",
                              workspaceId,
                              status: "Draft",
                              updatedAt: at,
                              versions: [
                                {
                                  id: vid,
                                  number: 1,
                                  content: data.content,
                                  createdAt: at,
                                  findings: [],
                                  analyzed: false,
                                },
                              ],
                              events: [
                                {
                                  id: crypto.randomUUID(),
                                  action: "create",
                                  actor: "Maya Chen",
                                  versionId: vid,
                                  at,
                                },
                              ],
                            };
                            setCampaigns((cs) => [c, ...cs]);
                            open(c);
                          }
                          setNewDraft({
                            title: "",
                            product: "Personal loans",
                            channel: "Email",
                            content: "",
                          });
                        } catch (e) {
                          setError(
                            e instanceof Error ? e.message : "Check the form.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <h2>Campaign details</h2>
                      <label>
                        Campaign name
                        <input
                          name="title"
                          value={newDraft.title}
                          onChange={(e) =>
                            setNewDraft((d) => ({
                              ...d,
                              title: e.target.value,
                            }))
                          }
                          placeholder="e.g. A little breathing room — fall launch"
                          required
                          minLength={3}
                          maxLength={160}
                        />
                      </label>
                      <div className="form-row">
                        <label>
                          Product
                          <select
                            name="product"
                            value={newDraft.product}
                            onChange={(e) =>
                              setNewDraft((d) => ({
                                ...d,
                                product: e.target.value,
                              }))
                            }
                          >
                            {products.map((p) => (
                              <option key={p}>{p}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Channel
                          <select
                            name="channel"
                            value={newDraft.channel}
                            onChange={(e) =>
                              setNewDraft((d) => ({
                                ...d,
                                channel: e.target.value,
                              }))
                            }
                          >
                            {[
                              "Email",
                              "Landing page",
                              "Social",
                              "Paid search",
                            ].map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label>
                        Marketing copy
                        <textarea
                          name="content"
                          value={newDraft.content}
                          onChange={(e) =>
                            setNewDraft((d) => ({
                              ...d,
                              content: e.target.value,
                            }))
                          }
                          rows={10}
                          placeholder="Paste the exact copy you want reviewed, including rates, claims, and disclosures…"
                          required
                          minLength={20}
                          maxLength={20000}
                        />
                      </label>
                      <small>
                        Your original copy is saved as version 1. You can make
                        revisions before submitting.
                      </small>
                      <div className="form-actions">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={showQueue}
                        >
                          Cancel
                        </Button>
                        <Button
                          disabled={busy || Boolean(live && !workspaceId)}
                        >
                          {busy ? "Saving…" : "Create draft"}
                          <ArrowRight size={16} />
                        </Button>
                      </div>
                    </form>
                    <aside className="guidance">
                      <span className="guidance-icon">
                        <Sparkles size={22} />
                      </span>
                      <h2>Good context. Better review.</h2>
                      <p>
                        Include the full consumer-facing message so reviewers
                        can see claims in context.
                      </p>
                      <ol>
                        <li>
                          <strong>Create your draft</strong>
                          <span>Keep the original version on record.</span>
                        </li>
                        <li>
                          <strong>
                            {live && analysisMode === "openai"
                              ? "Run an AI precheck"
                              : "Run a mock precheck"}
                          </strong>
                          <span>
                            Review policy matches and uncertain claims.
                          </span>
                        </li>
                        <li>
                          <strong>Submit for human review</strong>
                          <span>A reviewer decides the exact version.</span>
                        </li>
                      </ol>
                      <small>
                        {live && analysisMode === "openai"
                          ? "Running precheck sends this campaign copy to OpenAI for analysis. Only submit authorized fictional test content during validation."
                          : "Mock analysis is deterministic. No content is sent to an external AI provider."}
                      </small>
                    </aside>
                  </div>
                </>
              )}
              {tab === "review" && current && latest && version && (
                <>
                  <button className="back" onClick={showQueue}>
                    <ArrowLeft size={15} />
                    Review queue
                  </button>
                  {
                    <p className="workflow-next">
                      {current.status === "In review"
                        ? `${current.reviewer || "A compliance reviewer"} is responsible for reviewing v${latest.number}. ${current.owner} owns the marketing copy.`
                        : current.status === "Changes requested"
                          ? "Marketing: address the reviewer’s feedback in a new version, then rerun precheck."
                          : current.status === "Approved"
                            ? "This exact version is approved. Any further edits create a new draft requiring review."
                            : current.status === "Rejected"
                              ? "Marketing: review the decision rationale before creating a new draft."
                              : "Marketing: prepare the copy, run precheck, and submit this version for review."}
                    </p>
                  }
                  <div className="review-heading">
                    <div>
                      <div className="review-kicker">
                        {current.product} <span>/</span> {current.channel}
                      </div>
                      <h1>{current.title}</h1>
                      <div className="review-meta">
                        <Badge value={current.status} />
                        <span>Marketing: {current.owner}</span>
                        <span>
                          {historical ? "Current reviewer" : "Reviewer"}:{" "}
                          {current.reviewer || "Not assigned yet"}
                        </span>
                        <span>
                          {busy
                            ? "Saving…"
                            : content !== latest.content && editable
                              ? "Unsaved changes"
                              : `Saved ${date(current.updatedAt)}`}
                        </span>
                      </div>
                    </div>
                    <div className="review-actions">
                      {editable &&
                        !historical &&
                        (content !== latest.content ||
                        latest.assessmentWarning ||
                        ["Approved", "Rejected"].includes(current.status) ? (
                          <Button
                            disabled={busy}
                            onClick={() => act("revise", { content })}
                          >
                            <GitBranch size={16} />
                            {busy ? "Saving…" : `Save as v${latest.number + 1}`}
                          </Button>
                        ) : !latest.analyzed ? (
                          <Button
                            disabled={busy}
                            onClick={() => act("analyze")}
                          >
                            <Sparkles size={16} />
                            {busy ? "Checking…" : "Run precheck"}
                          </Button>
                        ) : (
                          <Button
                            disabled={
                              busy ||
                              current.status === "Changes requested" ||
                              !chosenReviewer
                            }
                            onClick={() =>
                              act("submit", {
                                reviewerId: chosenReviewer,
                                reviewer: reviewers.find(
                                  (m) => m.user_id === chosenReviewer,
                                )?.display_name,
                              })
                            }
                          >
                            Submit v{latest.number} for review
                            <ArrowRight size={16} />
                          </Button>
                        ))}
                      {role === "reviewer" &&
                        current.reviewerId === activeUserId &&
                        current.status === "In review" &&
                        !historical && (
                          <Button
                            onClick={() => {
                              setDecision("choose");
                              setNote("");
                            }}
                          >
                            <ShieldCheck size={16} />
                            Record decision
                          </Button>
                        )}
                    </div>
                  </div>
                  {!historical &&
                    ((editable && current.status === "Draft") ||
                      (current.status === "In review" &&
                        (current.ownerId === activeUserId ||
                          workspaces.find((w) => w.id === workspaceId)
                            ?.owner_id === activeUserId))) && (
                      <div className="reviewer-picker">
                        <label>
                          Compliance reviewer
                          <select
                            aria-label="Compliance reviewer"
                            value={chosenReviewer}
                            onChange={(e) => setReviewerChoice(e.target.value)}
                          >
                            <option value="">Choose a teammate</option>
                            {reviewers.map((m) => (
                              <option key={m.user_id} value={m.user_id}>
                                {m.display_name || "Team reviewer"}
                              </option>
                            ))}
                          </select>
                        </label>
                        <p>
                          {reviewers.length
                            ? "This person will review the submitted version. Precheck does not approve the campaign."
                            : "No eligible reviewer yet. Invite a compliance colleague in Team & people."}
                        </p>
                        {current.status === "In review" && (
                          <Button
                            disabled={
                              busy ||
                              !chosenReviewer ||
                              chosenReviewer === current.reviewerId
                            }
                            onClick={() =>
                              act("assign", {
                                reviewerId: chosenReviewer,
                                reviewer: reviewers.find(
                                  (m) => m.user_id === chosenReviewer,
                                )?.display_name,
                              })
                            }
                          >
                            Assign reviewer
                          </Button>
                        )}
                        {!reviewers.length && (
                          <Button
                            variant="outline"
                            onClick={() => setTab("team")}
                          >
                            Add a reviewer
                          </Button>
                        )}
                      </div>
                    )}
                  <div className="version-bar">
                    <span>
                      <GitBranch size={16} />
                      <select
                        aria-label="Content version"
                        value={viewVersion}
                        onChange={(e) => {
                          setViewVersion(Number(e.target.value));
                          setHighlight("");
                        }}
                      >
                        {current.versions.map((v, i) => (
                          <option value={i} key={v.id}>
                            Version {v.number}
                            {v.id === latest.id
                              ? " · current"
                              : " · historical"}
                          </option>
                        ))}
                      </select>
                      <span className="version-status">
                        {historical
                          ? "Historical record"
                          : latest.analyzed
                            ? "Precheck current"
                            : "Precheck needed"}
                      </span>
                    </span>
                    <span>
                      {current.status === "In review"
                        ? "Locked for human review"
                        : current.status === "Approved"
                          ? "Approval applies only to this version"
                          : editable
                            ? "Saved versions are immutable"
                            : "Read-only record"}
                    </span>
                  </div>
                  {current.events
                    .filter(
                      (e) =>
                        e.versionId === version.id &&
                        ["approve", "reject", "request_changes"].includes(
                          e.action,
                        ),
                    )
                    .map((e) => (
                      <div key={e.id} className="version-decision">
                        <ShieldCheck size={17} />
                        <div>
                          <strong>
                            Version {version.number}:{" "}
                            {e.action === "approve"
                              ? "Approved"
                              : e.action === "reject"
                                ? "Rejected"
                                : "Changes requested"}
                          </strong>
                          <p>
                            {e.actor} · {new Date(e.at).toLocaleString()} ·{" "}
                            {e.note}
                          </p>
                          {historical && (
                            <small>
                              Historical decision. It does not authorize the
                              current version.
                            </small>
                          )}
                        </div>
                      </div>
                    ))}
                  {current.status === "Changes requested" && (
                    <div className="review-callout">
                      <GitBranch size={17} />
                      <div>
                        <strong>A revision is needed</strong>
                        <p>
                          {
                            current.events.findLast(
                              (e) => e.action === "request_changes",
                            )?.note
                          }{" "}
                          Save a new version, run precheck, and resubmit.
                        </p>
                      </div>
                    </div>
                  )}
                  {current.status === "In review" &&
                    role === "marketer" &&
                    !live && (
                      <div className="demo-next-step">
                        <ShieldCheck size={16} />
                        <span>
                          Ready for a human decision. Switch{" "}
                          <strong>
                            Explore as →{" "}
                            {current.reviewer || "your assigned reviewer"} ·
                            Reviewer
                          </strong>{" "}
                          above to continue the demo.
                        </span>
                      </div>
                    )}
                  {version.assessmentWarning && (
                    <div className="alert error" role="alert">
                      {version.assessmentWarning}
                    </div>
                  )}
                  <div className="review-grid">
                    <section className="panel content-panel">
                      <div className="panel-heading">
                        <h2>Marketing copy</h2>
                        <span>
                          v{version.number} · {date(version.createdAt)}
                        </span>
                      </div>
                      <div className="copy-meta">
                        <span>{current.channel}</span>
                        <span>{version.content.length} characters</span>
                      </div>
                      {editable && !historical ? (
                        <textarea
                          className="copy-editor"
                          id="content-excerpt"
                          aria-label="Edit marketing copy"
                          value={content}
                          onChange={(e) => {
                            setContent(e.target.value);
                            setDraftEdits((d) => ({
                              ...d,
                              [current.id]: {
                                versionId: latest.id,
                                content: e.target.value,
                              },
                            }));
                          }}
                          maxLength={20000}
                        />
                      ) : (
                        <div
                          className="copy-content"
                          tabIndex={0}
                          id="content-excerpt"
                        >
                          {highlight && version.content.includes(highlight) ? (
                            <>
                              {version.content.slice(
                                0,
                                version.content.indexOf(highlight),
                              )}
                              <mark>{highlight}</mark>
                              {version.content.slice(
                                version.content.indexOf(highlight) +
                                  highlight.length,
                              )}
                            </>
                          ) : (
                            version.content
                          )}
                        </div>
                      )}
                      <div className="copy-foot">
                        <ShieldCheck size={15} />
                        {content !== latest.content && editable && !historical
                          ? "Unsaved edits · save a new version to run precheck"
                          : "Original wording preserved in version history"}
                      </div>
                      {current.versions.length > 1 && (
                        <div className="diff">
                          <h3>
                            What changed since v
                            {version.number > 1 ? version.number - 1 : 1}
                          </h3>
                          {version.number > 1 ? (
                            <>
                              <del>
                                {current.versions[viewVersion - 1].content}
                              </del>
                              <ins>{version.content}</ins>
                              {version.analyzed ? (
                                <p>
                                  {
                                    current.versions[
                                      viewVersion - 1
                                    ].findings.filter(
                                      (f) =>
                                        !version.findings.some(
                                          (n) => n.policyId === f.policyId,
                                        ),
                                    ).length
                                  }{" "}
                                  prior policy flags no longer matched in this
                                  precheck. This is not proof of compliance.
                                </p>
                              ) : (
                                <p>
                                  Run precheck to compare findings on this
                                  revision.
                                </p>
                              )}
                            </>
                          ) : (
                            <p>This is the original version.</p>
                          )}
                        </div>
                      )}
                    </section>
                    <section className="panel findings-panel">
                      <div className="detail-tabs">
                        {["Findings", "Comments", "Activity"].map((t) => (
                          <button
                            className={detailTab === t ? "selected" : ""}
                            key={t}
                            onClick={() => setDetailTab(t)}
                          >
                            {t}
                            {t === "Findings" && (
                              <span>{version.findings.length}</span>
                            )}
                          </button>
                        ))}
                      </div>
                      {detailTab === "Findings" && (
                        <>
                          <div className="analysis-summary">
                            <span className="mock-label">
                              <Sparkles size={13} />
                              {version.assessmentProvider === "openai"
                                ? `OpenAI analysis · ${version.analysisModel}`
                                : live
                                  ? "Mock precheck · deterministic rules"
                                  : "Mock analysis · demonstration only"}
                            </span>
                            <p>
                              {version.analyzed
                                ? `${applicablePolicies(current.product).length} applicable fictional policies checked. Human verification required.`
                                : "Run a precheck on this saved version to see potential policy issues."}
                            </p>
                          </div>
                          {version.findings.map((f) => (
                            <article className="finding" key={f.id}>
                              <div className="finding-top">
                                <Badge value={f.severity} />
                                <span>
                                  {f.uncertainty
                                    ? "Unverified claim"
                                    : "Rule match"}
                                </span>
                                <a
                                  href={`#${f.policyId}`}
                                  data-policy-id={f.policyId}
                                  aria-label={`View ${f.policyId}: ${policies.find((p) => p.id === f.policyId)?.title}, fictional policy version ${f.policyVersion}`}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setPolicyContext(f.policyId);
                                    setTab("policies");
                                  }}
                                >
                                  {f.policyId}
                                  <ArrowUpRight size={11} />
                                </a>
                              </div>
                              <h3>{f.title}</h3>
                              <button
                                className="evidence"
                                onClick={() => {
                                  setHighlight(f.evidence);
                                  const el =
                                    document.getElementById("content-excerpt");
                                  el?.focus();
                                  if (el instanceof HTMLTextAreaElement) {
                                    const start = el.value.indexOf(f.evidence);
                                    el.setSelectionRange(
                                      start,
                                      start + f.evidence.length,
                                    );
                                  }
                                }}
                              >
                                “{f.evidence}”
                              </button>
                              <p>{f.rationale}</p>
                              {f.uncertainty && (
                                <div className="uncertainty">
                                  {f.uncertainty}
                                </div>
                              )}
                              {f.replacement && (
                                <div className="suggestion">
                                  <small>PROPOSED EDIT</small>
                                  <p>{f.replacement}</p>
                                  {editable && !historical && (
                                    <Button
                                      variant="outline"
                                      disabled={
                                        busy || content !== latest.content
                                      }
                                      onClick={() => setPreview(f)}
                                    >
                                      Preview edit
                                      <ArrowRight size={14} />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </article>
                          ))}
                          {version.analyzed && !version.findings.length && (
                            <div className="empty">
                              <CheckCircle2 size={30} />
                              <h3>No rule matches found</h3>
                              <p>
                                This does not establish legal compliance. A
                                human must still review the copy and verify
                                product terms.
                              </p>
                            </div>
                          )}
                          {!live &&
                            editable &&
                            !historical &&
                            !latest.analyzed && (
                              <label className="failure-select">
                                Test analysis recovery
                                <select
                                  value={failure}
                                  onChange={(e) =>
                                    setFailure(e.target.value as typeof failure)
                                  }
                                >
                                  <option value="normal">
                                    Normal response
                                  </option>
                                  <option value="timeout">
                                    Simulated timeout
                                  </option>
                                  <option value="error">Simulated error</option>
                                </select>
                              </label>
                            )}
                        </>
                      )}
                      {detailTab === "Comments" && (
                        <div className="comments">
                          <h3>Conversation on v{version.number}</h3>
                          {current.events
                            .filter((e) => e.versionId === version.id && e.note)
                            .map((e) => (
                              <div className="comment" key={e.id}>
                                <strong>
                                  {e.actor}
                                  <small>{date(e.at)}</small>
                                </strong>
                                <p>{e.note}</p>
                                <small>{actionLabels[e.action]}</small>
                              </div>
                            ))}
                          {!current.events.some(
                            (e) => e.versionId === version.id && e.note,
                          ) && (
                            <p className="muted">
                              No comments yet. Add context for the next
                              reviewer.
                            </p>
                          )}
                          {!historical && (
                            <>
                              <label>
                                Add a comment
                                <textarea
                                  value={note}
                                  onChange={(e) => setNote(e.target.value)}
                                  rows={3}
                                  maxLength={4000}
                                />
                              </label>
                              <Button
                                disabled={busy || note.trim().length < 3}
                                variant="outline"
                                onClick={() => act("comment", { note })}
                              >
                                <MessageSquare size={15} />
                                Comment on v{version.number}
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                      {detailTab === "Activity" && (
                        <div className="timeline">
                          {[...current.events].reverse().map((e) => (
                            <div key={e.id}>
                              <span className="timeline-dot">
                                <Check size={12} />
                              </span>
                              <strong>{e.actor}</strong>
                              <p>
                                {actionLabels[e.action]}{" "}
                                <span>
                                  · v
                                  {
                                    current.versions.find(
                                      (v) => v.id === e.versionId,
                                    )?.number
                                  }
                                </span>
                              </p>
                              {e.note && <blockquote>{e.note}</blockquote>}
                              <small>{new Date(e.at).toLocaleString()}</small>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                </>
              )}
              {tab === "policies" && (
                <>
                  {policyContext && current && (
                    <button
                      className="back"
                      onClick={() => {
                        setTab("review");
                        requestAnimationFrame(() =>
                          document
                            .querySelector<HTMLElement>(
                              `[data-policy-id="${policyContext}"]`,
                            )
                            ?.focus(),
                        );
                      }}
                    >
                      <ArrowLeft size={15} />
                      Return to review · {current.title}
                    </button>
                  )}
                  <div className="page-heading">
                    <div className="eyebrow">A SHARED STANDARD</div>
                    <h1>Policy library</h1>
                    <p>
                      Clear expectations for every campaign, before the first
                      review.
                    </p>
                  </div>
                  <div className="policy-disclaimer">
                    <BookOpen size={20} />
                    <div>
                      <strong>Fictional policies for demonstration</strong>
                      <p>
                        These are sample internal requirements, not legal advice
                        or a representation of current regulations.
                      </p>
                    </div>
                  </div>
                  <div className="policy-list">
                    {policies.map((p) => (
                      <article
                        className={`panel policy ${policyContext === p.id ? "policy-selected" : ""}`}
                        id={p.id}
                        key={p.id}
                        tabIndex={-1}
                        aria-label={`${p.id}: ${p.title}`}
                      >
                        <span className="policy-icon">
                          <BookOpen size={22} />
                        </span>
                        <div>
                          <div className="policy-meta">
                            {p.id}
                            <span>Version {p.version}</span>
                            <span>{p.product}</span>
                          </div>
                          <h2>{p.title}</h2>
                          <p>{p.description}</p>
                        </div>
                        <span className="badge approved">
                          Active · fictional
                        </span>
                      </article>
                    ))}
                  </div>
                </>
              )}
              {tab === "analytics" && (
                <>
                  <div className="page-heading">
                    <div className="eyebrow">THE BIGGER PICTURE</div>
                    <h1>Review insights</h1>
                    <p>
                      Understand what’s moving, what’s waiting, and where to
                      focus.
                    </p>
                  </div>
                  <div className="stats-row">
                    <div className="stat">
                      <span>Decision throughput</span>
                      <strong>
                        {scopedCampaigns.filter((c) => c.decidedAt).length}
                        <small>campaigns with a latest-version decision</small>
                      </strong>
                    </div>
                    <div className="stat">
                      <span>Review backlog</span>
                      <strong>
                        {inReview}
                        <small>currently awaiting a human decision</small>
                      </strong>
                    </div>
                    <div className="stat">
                      <span>Average turnaround</span>
                      <strong>
                        {(() => {
                          const cs = scopedCampaigns.filter(
                            (c) => c.decidedAt && c.submittedAt,
                          );
                          return cs.length
                            ? (
                                cs.reduce(
                                  (n, c) =>
                                    n +
                                    (Date.parse(c.decidedAt!) -
                                      Date.parse(c.submittedAt!)),
                                  0,
                                ) /
                                cs.length /
                                3600000
                              ).toFixed(1)
                            : "—";
                        })()}
                        <small>hours from submission to decision</small>
                      </strong>
                    </div>
                  </div>
                  <div className="analytics-grid">
                    <section className="panel chart">
                      <h2>Work by status</h2>
                      <p>Current campaigns · all time</p>
                      {statuses.map((s) => {
                        const n = scopedCampaigns.filter(
                          (c) => c.status === s,
                        ).length;
                        return (
                          <div className="chart-row" key={s}>
                            <span>{s}</span>
                            <div>
                              <i
                                style={{
                                  width: `${scopedCampaigns.length ? (n / scopedCampaigns.length) * 100 : 0}%`,
                                }}
                              />
                            </div>
                            <strong>{n}</strong>
                          </div>
                        );
                      })}
                    </section>
                    <section className="panel chart">
                      <h2>Most frequent findings</h2>
                      <p>Latest version only · analysis findings</p>
                      {policies
                        .map((p) => ({
                          p,
                          n: scopedCampaigns.reduce(
                            (n, c) =>
                              n +
                              c.versions
                                .at(-1)!
                                .findings.filter((f) => f.policyId === p.id)
                                .length,
                            0,
                          ),
                        }))
                        .sort((a, b) => b.n - a.n)
                        .map(({ p, n }) => (
                          <div className="finding-count" key={p.id}>
                            <div>
                              <strong>{p.title}</strong>
                              <small>{p.id}</small>
                            </div>
                            <span>{n}</span>
                          </div>
                        ))}
                    </section>
                  </div>
                  <p className="subtle-footer">
                    {live ? "Workspace records" : "Fictional demo records"} ·
                    Metrics update as you work. Turnaround excludes drafts and
                    undecided submissions.
                  </p>
                </>
              )}
            </>
          )}
        </main>
      </div>
      {preview && current && latest && (
        <Modal labelledBy="edit-title" onClose={() => setPreview(null)}>
          <section className="modal panel" aria-labelledby="edit-title">
            <button
              className="modal-close"
              aria-label="Close preview"
              onClick={() => setPreview(null)}
            >
              <X size={20} />
            </button>
            <div className="eyebrow">A NEW VERSION, A CLEAR RECORD</div>
            <h2 id="edit-title">Preview proposed edit</h2>
            <p>
              Only this exact excerpt changes. Save as version{" "}
              {latest.number + 1}, then run a new precheck.
            </p>
            <div className="diff">
              <small>BEFORE</small>
              <del>{preview.evidence}</del>
              <small>AFTER</small>
              <ins>{preview.replacement}</ins>
              <small>FULL REVISED COPY</small>
              <div className="revised-preview">
                {latest.content.replace(preview.evidence, preview.replacement!)}
              </div>
            </div>
            <div className="form-actions">
              <Button variant="outline" onClick={() => setPreview(null)}>
                Cancel
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  act("revise", {
                    content: latest.content.replace(
                      preview.evidence,
                      preview.replacement!,
                    ),
                  })
                }
              >
                {busy ? "Saving…" : `Save as v${latest.number + 1}`}
              </Button>
            </div>
          </section>
        </Modal>
      )}
      {decision && current && latest && (
        <Modal labelledBy="decision-title" onClose={() => setDecision(null)}>
          <section className="modal panel" aria-labelledby="decision-title">
            <button
              className="modal-close"
              aria-label="Close decision"
              onClick={() => setDecision(null)}
            >
              <X size={20} />
            </button>
            <div className="eyebrow">HUMAN REVIEW</div>
            <h2 id="decision-title">Record a decision on v{latest.number}</h2>
            <p>{current.title}</p>
            <div className="decision-context">
              {latest.findings.length} analysis findings to consider. You are
              responsible for verifying product terms and disclosures.
            </div>
            <label htmlFor="review-decision">
              Decision
              <select
                id="review-decision"
                aria-label="Decision"
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
              >
                <option value="choose" disabled>
                  Choose a decision…
                </option>
                <option value="approve">Approve this version</option>
                <option value="request_changes">Request changes</option>
                <option value="reject">Reject this version</option>
              </select>
            </label>
            <label htmlFor="decision-rationale">
              Rationale
              <textarea
                id="decision-rationale"
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Explain what you verified or what needs to change…"
                rows={4}
                maxLength={4000}
              />
            </label>
            <p className="muted">
              Recorded as{" "}
              {live
                ? "your authenticated reviewer identity"
                : `${memberships.find((m) => m.user_id === previewReviewerId && m.workspace_id === workspaceId)?.display_name || "Sample reviewer"} (isolated demo)`}
              . This decision applies only to version {latest.number}.
            </p>
            <div className="form-actions">
              <Button variant="outline" onClick={() => setDecision(null)}>
                Cancel
              </Button>
              <Button
                disabled={
                  busy || decision === "choose" || note.trim().length < 3
                }
                onClick={() => act(decision, { note })}
              >
                Confirm decision · v{latest.number}
              </Button>
            </div>
          </section>
        </Modal>
      )}
    </div>
  );
}
