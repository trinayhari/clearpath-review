import { z } from "zod";
export const products = [
  "Personal loans",
  "Credit cards",
  "Mortgage",
  "Affiliate",
] as const;
export const statuses = [
  "Draft",
  "In review",
  "Changes requested",
  "Approved",
  "Rejected",
] as const;
export type Status = (typeof statuses)[number];
export type Role = "marketer" | "reviewer";
export const contentSchema = z.object({
  title: z.string().trim().min(3).max(160),
  product: z.enum(products),
  channel: z.enum(["Email", "Landing page", "Social", "Paid search"]),
  content: z.string().trim().min(20).max(20000),
});
export const findingSchema = z.object({
  id: z.string(),
  severity: z.enum(["High", "Medium", "Low"]),
  evidence: z.string().min(1),
  policyId: z.string(),
  title: z.string(),
  rationale: z.string(),
  replacement: z.string().nullable(),
  uncertainty: z.string().nullable(),
  policyVersion: z.string().min(1),
  source: z.string().url(),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
});
export type Finding = z.infer<typeof findingSchema>;
export type Version = {
  assessmentWarning?: string;
  assessmentProvider?: "mock" | "openai";
  analysisModel?: string;
  id: string;
  number: number;
  content: string;
  createdAt: string;
  findings: Finding[];
  analyzed: boolean;
};
export type Event = {
  id: string;
  actor: string;
  action: string;
  versionId: string;
  at: string;
  note?: string;
};
export type Campaign = {
  workspaceId?: string;
  id: string;
  title: string;
  product: (typeof products)[number];
  channel: string;
  status: Status;
  owner: string;
  ownerId?: string;
  reviewerId?: string;
  reviewer?: string;
  versions: Version[];
  events: Event[];
  updatedAt: string;
  submittedAt?: string;
  decidedAt?: string;
};
export const policies = [
  {
    id: "CP-101",
    title: "Clear and balanced lending claims",
    product: "All products",
    version: "1.2",
    description:
      "Do not promise guaranteed approval or imply everyone qualifies. Explain that eligibility and underwriting apply.",
  },
  {
    id: "CP-204",
    title: "Rate and fee transparency",
    product: "All products",
    version: "2.1",
    description:
      "Specific rates, fees and savings claims require an approved product source. A reviewer must verify current terms and required disclosures.",
  },
  {
    id: "CP-310",
    title: "Mortgage prequalification",
    product: "Mortgage",
    version: "1.0",
    description:
      "Distinguish prequalification from a credit commitment. Never imply a home loan is already approved.",
  },
  {
    id: "CP-420",
    title: "Affiliate relationship disclosure",
    product: "Affiliate",
    version: "1.3",
    description:
      "Disclose clearly when ClearPath may receive compensation from featured partners.",
  },
  {
    id: "CP-501",
    title: "Responsible calls to action",
    product: "All products",
    version: "1.0",
    description:
      "Avoid pressure-based urgency. Give consumers space to compare options and understand terms.",
  },
] as const;
export interface AnalysisProvider {
  analyze(
    content: string,
    product: (typeof products)[number],
    mode?: "normal" | "timeout" | "error",
  ): Promise<Finding[]>;
}
export function applicablePolicies(product: string) {
  return policies.filter(
    (p) => p.product === "All products" || p.product === product,
  );
}
function sentenceAt(content: string, index: number): string {
  const boundaries = [...content.matchAll(/[.!?](?:\s+|$)/g)];
  const before = boundaries
    .filter((m) => m.index! + m[0].length <= index)
    .at(-1);
  const start = before ? before.index! + before[0].length : 0;
  const after = boundaries.find((m) => m.index! >= index);
  return content.slice(start, after ? after.index! + 1 : content.length).trim();
}
export const mockProvider: AnalysisProvider = {
  async analyze(content, product, mode = "normal") {
    if (mode === "timeout")
      throw new Error(
        "Mock analysis timed out. Your draft is safe. Try again.",
      );
    if (mode === "error")
      throw new Error(
        "Mock analysis is unavailable. Your draft is safe. Try again.",
      );
    const findings: Omit<
      Finding,
      "policyVersion" | "source" | "start" | "end"
    >[] = [];
    const add = (
      pattern: RegExp,
      policyId: string,
      title: string,
      severity: Finding["severity"],
      rationale: string,
      replacement: string | null,
      uncertainty: string | null = null,
    ) => {
      const m = content.match(pattern);
      if (m)
        findings.push({
          id: `${policyId}-${m.index}`,
          policyId,
          title,
          severity,
          evidence: replacement ? sentenceAt(content, m.index ?? 0) : m[0],
          rationale,
          replacement,
          uncertainty,
        });
    };
    add(
      /guaranteed approval|everyone qualifies|100% approval/i,
      "CP-101",
      "Approval cannot be guaranteed",
      "High",
      "This absolute claim omits eligibility and underwriting conditions.",
      "Subject to credit approval and eligibility requirements.",
    );
    add(
      /\b\d+(?:\.\d+)?%\s*(?:APR|cashback|cash back)?|no fees|no annual fee|save \$\d+/i,
      "CP-204",
      "Verify product terms and disclosures",
      "Medium",
      "The mock provider has no approved product-rate source. A human must verify this claim.",
      null,
      "Unverified: rates, fees and savings cannot be substantiated from submitted copy alone.",
    );
    if (product === "Mortgage")
      add(
        /pre.?approved|approved mortgage|guaranteed mortgage/i,
        "CP-310",
        "Prequalification is not a commitment",
        "High",
        "Prequalification must not imply final credit approval.",
        "Explore mortgage prequalification. This is not a commitment to lend.",
      );
    if (
      product === "Affiliate" &&
      !/may (?:earn|receive) (?:a )?compensation|paid partnership/i.test(
        content,
      )
    )
      findings.push({
        id: "CP-420-0",
        policyId: "CP-420",
        title: "Disclose the partner relationship",
        severity: "Medium",
        evidence: content.slice(0, Math.min(100, content.length)),
        rationale: "Affiliate promotions need a clear compensation disclosure.",
        replacement: null,
        uncertainty:
          "Confirm the actual commercial relationship. Suggested disclosure: We may receive compensation from featured partners.",
      });
    add(
      /act now|last chance|hurry/i,
      "CP-501",
      "Reduce pressure in the call to action",
      "Low",
      "A pressure-based call to action may discourage informed comparison.",
      "Explore your options.",
    );
    return validateFindings(
      findings.map((f) => ({
        ...f,
        policyVersion: policies.find((p) => p.id === f.policyId)!.version,
        source:
          f.policyId === "CP-420"
            ? "https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking"
            : "https://www.ftc.gov/legal-library/browse/ftc-policy-statement-regarding-advertising-substantiation",
        start: Array.from(content.slice(0, content.indexOf(f.evidence))).length,
        end: Array.from(
          content.slice(0, content.indexOf(f.evidence) + f.evidence.length),
        ).length,
      })),
      content,
      product,
    );
  },
};
export function validateFindings(
  value: unknown,
  content: string,
  product: string,
): Finding[] {
  const parsed = z.array(findingSchema).max(30).parse(value);
  const applicable = applicablePolicies(product).map((p) => p.id as string);
  if (
    parsed.some(
      (f) =>
        Array.from(content).slice(f.start, f.end).join("") !== f.evidence ||
        !applicable.includes(f.policyId) ||
        policies.find((p) => p.id === f.policyId)?.version !== f.policyVersion,
    )
  )
    throw new Error("Analysis failed evidence verification.");
  return parsed;
}
export function assertTransition(
  c: Campaign,
  role: Role,
  action: string,
  versionId: string,
) {
  if (c.versions.at(-1)?.id !== versionId)
    throw new Error("This version is stale. Refresh before continuing.");
  if (action === "comment") return;
  if (["approve", "reject", "request_changes"].includes(action)) {
    if (role !== "reviewer" || c.status !== "In review")
      throw new Error("Only a reviewer can decide a submitted version.");
  } else {
    if (role !== "marketer")
      throw new Error("Only the campaign owner can edit or submit.");
    if (
      !["Draft", "Changes requested", "Approved", "Rejected"].includes(c.status)
    )
      throw new Error("This campaign is locked.");
    if (action !== "revise" && ["Approved", "Rejected"].includes(c.status))
      throw new Error("Create a revision first.");
    if (action === "submit" && !c.versions.at(-1)?.analyzed)
      throw new Error("Run precheck before submitting.");
  }
}

export type Membership = {
  user_id: string;
  workspace_id: string;
  role: Role;
  display_name?: string;
  is_admin?: boolean;
};
export function roleForWorkspace(
  members: Membership[],
  userId: string,
  workspaceId: string,
): Role | undefined {
  return members.find(
    (m) => m.user_id === userId && m.workspace_id === workspaceId,
  )?.role;
}
export function safeAssessment(
  record: unknown,
  content: string,
  product: string,
): Pick<
  Version,
  | "findings"
  | "analyzed"
  | "assessmentWarning"
  | "assessmentProvider"
  | "analysisModel"
> {
  if (!record) return { findings: [], analyzed: false };
  try {
    const a = z
      .discriminatedUnion("provider", [
        z.object({
          trusted: z.literal(true),
          provider: z.literal("deterministic-mock-v2-db"),
          findings: z.unknown(),
        }),
        z.object({
          trusted: z.literal(true),
          provider: z.literal("openai-responses-v1"),
          findings: z.unknown(),
          execution_id: z.uuid(),
          provenance: z.object({
            model: z.literal("gpt-5.4-mini-2026-03-17"),
            policyBundle: z.literal("clearpath-review-2026-10-27-v1"),
            contentHash: z.string().regex(/^[a-f0-9]{64}$/),
            responseId: z.string().min(1).max(200),
            inputTokens: z.number().int().min(0).max(102048),
            outputTokens: z.number().int().min(0).max(4500),
          }),
        }),
      ])
      .parse(record);
    return {
      findings: validateFindings(a.findings, content, product),
      analyzed: true,
      assessmentProvider:
        a.provider === "openai-responses-v1" ? "openai" : "mock",
      analysisModel:
        a.provider === "openai-responses-v1" ? a.provenance.model : undefined,
    };
  } catch {
    return {
      findings: [],
      analyzed: false,
      assessmentWarning:
        "This assessment is unverified or malformed. Create a new version and rerun precheck.",
    };
  }
}

export type Team = {
  id: string;
  name: string;
  owner_id?: string | null;
  analysisMode?: "mock" | "openai";
};
