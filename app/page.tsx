import Workspace from "@/components/workspace";
import { seedCampaigns } from "@/lib/fixtures";
export default async function Page() {
  return <Workspace initial={await seedCampaigns()} />;
}
