import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase";
import { AccountForm } from "@/components/auth/account-form";
export const dynamic = "force-dynamic";
export default async function Account() {
  const db = await serverClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user || !user.email_confirmed_at || user.is_anonymous)
    redirect("/login");
  return <AccountForm email={user.email ?? "Your account"} />;
}
