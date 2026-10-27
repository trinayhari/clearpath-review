// Run only after approval for the named marketer and workspace. No privileged key.
import { createClient } from "@supabase/supabase-js";
const {
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
  CLEARPATH_ACCESS_TOKEN: token,
  CLEARPATH_WORKSPACE_ID: workspace,
} = process.env;
if (!url || !key || !token || !workspace)
  throw new Error(
    "Supply public project config, approved workspace ID and a short-lived marketer access token securely.",
  );
const db = createClient(url, key, {
  global: { headers: { Authorization: `Bearer ${token}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});
const {
  data: { user },
  error: authError,
} = await db.auth.getUser(token);
if (authError || !user) throw new Error("Valid individual session required.");
const { data: member } = await db
  .from("cp_members")
  .select("role")
  .eq("workspace_id", workspace)
  .eq("user_id", user.id)
  .single();
if (member?.role !== "marketer")
  throw new Error("Approved marketer membership required.");
const fixtures = [
  [
    "Spring breathing room",
    "Personal loans",
    "Email",
    "Get guaranteed approval for your personal loan today. Bring your next project within reach with ClearPath Financial.",
    true,
  ],
  [
    "Everyday card launch",
    "Credit cards",
    "Landing page",
    "Start with 0% APR and no annual fee. Explore the ClearPath Everyday card and find an option for daily purchases.",
    true,
  ],
  [
    "Home search prequalification",
    "Mortgage",
    "Paid search",
    "Explore mortgage prequalification with ClearPath. Prequalification is not a guaranteed loan offer. Review eligibility before continuing.",
    false,
  ],
  [
    "Partner comparison guide",
    "Affiliate",
    "Social",
    "Compare financing options through our partner guide. We receive compensation for referrals through this link. Review the provider terms before applying.",
    false,
  ],
];
for (const [title, product, channel, content, submit] of fixtures) {
  const { data: existing, error: readError } = await db
    .from("cp_campaigns")
    .select("id")
    .eq("workspace_id", workspace)
    .eq("owner_id", user.id)
    .eq("title", title);
  if (readError) throw new Error("Cannot inspect existing campaigns.");
  if (existing.length) continue;
  const { data: id, error } = await db.rpc("cp_command", {
    p_action: "create",
    p_data: {
      workspaceId: workspace,
      title,
      product,
      channel,
      content,
      note: "Fictional starting campaign created by the signed-in marketer using the setup script.",
    },
  });
  if (error)
    throw new Error(
      "Campaign creation failed; inspect the authenticated workspace before retrying.",
    );
  const { data: campaign } = await db
    .from("cp_campaigns")
    .select("current_version")
    .eq("id", id)
    .single();
  if (!campaign) throw new Error("Created campaign could not be reloaded.");
  if (submit)
    for (const action of ["analyze", "submit"]) {
      const { error } = await db.rpc("cp_command", {
        p_action: action,
        p_campaign: id,
        p_version: campaign.current_version,
        p_data: {},
      });
      if (error)
        throw new Error(
          "Campaign saved, but precheck/submission failed. Resume in the workspace.",
        );
    }
}
console.log(
  "Fictional starting campaigns are available in the approved workspace. No reviewer decisions were created.",
);
