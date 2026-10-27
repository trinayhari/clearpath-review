import {
  type Campaign,
  mockProvider,
  type Status,
  type Role,
  assertTransition,
} from "./domain";
export async function seedCampaigns(): Promise<Campaign[]> {
  const cases: [string, Campaign["product"], string, string, Status][] = [
    [
      "A little breathing room",
      "Personal loans",
      "Email",
      "Make room for what matters. Get guaranteed approval for a personal loan at 7.99% APR. Act now and take the next step.",
      "In review",
    ],
    [
      "Your next chapter starts here",
      "Mortgage",
      "Landing page",
      "Find a place to call home. Get pre-approved for your mortgage in minutes. Explore flexible options with ClearPath.",
      "Changes requested",
    ],
    [
      "Everyday rewards, thoughtfully simple",
      "Credit cards",
      "Social",
      "Turn everyday spending into possibilities. Earn 3% cash back with no annual fee. Eligibility and terms apply.",
      "In review",
    ],
    [
      "Compare with confidence",
      "Affiliate",
      "Landing page",
      "Compare personal finance partners in one place and find the option that fits your goals. Explore partner offers today.",
      "Draft",
    ],
    [
      "A clearer way to consolidate",
      "Personal loans",
      "Paid search",
      "Bring your borrowing into focus. Explore personal loan options. Subject to credit approval and eligibility requirements.",
      "Approved",
    ],
    [
      "Spring rewards launch",
      "Credit cards",
      "Email",
      "Rewards designed around your everyday. Compare credit card options. Credit approval and eligibility requirements apply.",
      "Approved",
    ],
    [
      "The first step toward home",
      "Mortgage",
      "Email",
      "Explore mortgage prequalification. This is not a commitment to lend. Final approval is subject to underwriting.",
      "Draft",
    ],
    [
      "Fast funds, no questions",
      "Personal loans",
      "Social",
      "Everyone qualifies for a personal loan. Get guaranteed approval today. Last chance to claim this exclusive offer.",
      "Rejected",
    ],
  ];
  return Promise.all(
    cases.map(async ([title, product, channel, content, status], i) => {
      const at = new Date(Date.UTC(2026, 9, 22 + (i % 4), 9 + i)).toISOString(),
        id = `demo-${i + 1}`,
        vid = `${id}-v1`;
      return {
        id,
        title,
        product,
        channel,
        status,
        owner: "Maya Chen",
        ownerId: "demo-maya",
        workspaceId: "demo-team",
        ...(status !== "Draft"
          ? { reviewerId: "demo-alex", reviewer: "Alex Morgan" }
          : {}),
        versions: [
          {
            id: vid,
            number: 1,
            content,
            createdAt: at,
            findings: await mockProvider.analyze(content, product),
            analyzed: true,
          },
        ],
        events: [
          {
            id: `e${i}`,
            actor: "Maya Chen",
            action: "create",
            versionId: vid,
            at,
          },
          ...(["Approved", "Rejected", "Changes requested"].includes(status)
            ? [
                {
                  id: `d${i}`,
                  actor: "Alex Morgan",
                  action:
                    status === "Approved"
                      ? "approve"
                      : status === "Rejected"
                        ? "reject"
                        : "request_changes",
                  versionId: vid,
                  at: new Date(Date.parse(at) + 7200000).toISOString(),
                  note:
                    status === "Changes requested"
                      ? "Please distinguish prequalification from final approval, then submit a new version."
                      : "Reviewed this exact version against the fictional policy set.",
                },
              ]
            : []),
        ],
        updatedAt: at,
        ...(status !== "Draft" ? { submittedAt: at } : {}),
        ...(["Approved", "Rejected", "Changes requested"].includes(status)
          ? { decidedAt: new Date(Date.parse(at) + 7200000).toISOString() }
          : {}),
      };
    }),
  );
}
export function demoCommand(
  c: Campaign,
  role: Role,
  action: string,
  versionId: string,
  data: Record<string, unknown>,
): Campaign {
  const lifecycleAction = ["close", "reopen", "delete", "restore"].includes(
    action,
  );
  if (
    lifecycleAction &&
    data.actorId &&
    data.actorId !== c.ownerId &&
    !data.isTeamOwner
  )
    throw new Error(
      "Only the review owner or team owner can manage this review.",
    );
  const transitionRole =
    lifecycleAction && (data.isTeamOwner || data.actorId === c.ownerId)
      ? "marketer"
      : role;
  if (action !== "assign")
    assertTransition(c, transitionRole, action, versionId);
  else if (c.deletedAt || c.lifecycle === "closed")
    throw new Error("Reopen or restore this review before assigning it.");
  const copy = structuredClone(c),
    at = new Date().toISOString();
  let version = copy.versions.at(-1)!;
  if (action === "close") {
    copy.lifecycle = "closed";
    copy.closedAt = at;
  }
  if (action === "reopen") {
    copy.lifecycle = "open";
    copy.closedAt = undefined;
  }
  if (action === "delete") copy.deletedAt = at;
  if (action === "restore") copy.deletedAt = undefined;
  if (action === "revise") {
    version = {
      id: crypto.randomUUID(),
      number: version.number + 1,
      content: String(data.content),
      createdAt: at,
      findings: [],
      analyzed: false,
    };
    copy.versions.push(version);
    copy.status = "Draft";
    copy.submittedAt = undefined;
    copy.decidedAt = undefined;
  }
  if (action === "analyze") {
    version.findings = data.findings as typeof version.findings;
    version.analyzed = true;
  }
  if (action === "assign") {
    if (role !== "marketer" || copy.status !== "In review")
      throw new Error("Only the campaign owner can assign this review.");
    copy.reviewerId = String(data.reviewerId);
    copy.reviewer = String(data.reviewer);
  }
  if (action === "submit") {
    if (
      copy.events.some(
        (e) =>
          e.versionId === versionId &&
          ["approve", "reject", "request_changes"].includes(e.action),
      )
    )
      throw new Error("Save a revised version before resubmitting.");
    copy.reviewerId = String(data.reviewerId || "demo-alex");
    copy.reviewer = String(data.reviewer || "Alex Morgan");
    copy.status = "In review";
    copy.submittedAt = at;
  }
  if (["approve", "reject", "request_changes"].includes(action)) {
    if (String(data.note ?? "").trim().length < 3)
      throw new Error("Add a decision rationale.");
    copy.status =
      action === "approve"
        ? "Approved"
        : action === "reject"
          ? "Rejected"
          : "Changes requested";
    copy.decidedAt = at;
  }
  copy.events.push({
    id: crypto.randomUUID(),
    actor: String(
      data.actor || (role === "marketer" ? "Maya Chen" : "Alex Morgan"),
    ),
    action,
    versionId: version.id,
    at,
    note: data.note as string | undefined,
  });
  copy.updatedAt = at;
  return copy;
}
