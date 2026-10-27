import Workspace from "@/components/workspace";
import { seedCampaigns } from "@/lib/fixtures";
export default async function Preview() {
  return <Workspace initial={await seedCampaigns()} mode="preview" />;
}
