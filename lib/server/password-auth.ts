import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
export async function passwordAuth(
  db: Pick<SupabaseClient, "auth" | "rpc">,
  input: { action: "login" | "signup"; email: string; password: string },
) {
  if (input.action === "signup") {
    const existing = await db.auth.getUser();
    if (existing.data.user)
      return {
        status: 409,
        error:
          "You are already signed in. Sign out before creating another account.",
      };
  }
  const result =
    input.action === "signup"
      ? await db.auth.signUp({ email: input.email, password: input.password })
      : await db.auth.signInWithPassword({
          email: input.email,
          password: input.password,
        });
  if (result.error) {
    if (result.error.status === 429)
      return {
        status: 429,
        error:
          "Too many account requests. Wait a few minutes before trying again.",
      };
    return {
      status: 400,
      error:
        input.action === "signup"
          ? "Unable to create this account. If you already have an account, sign in with your existing password. Otherwise check your email and use a strong password."
          : "Unable to sign in. Check your email and password.",
    };
  }
  // Never infer identity from the submitted email or a signup response without a session.
  if (!result.data.session)
    return {
      status: 409,
      error:
        "Signup could not establish a session. No existing password was changed. Try signing in if you already have an account; otherwise the site owner must check signup configuration.",
    };
  const verified = await db.auth.getUser();
  if (verified.error || !verified.data.user || verified.data.user.is_anonymous)
    return {
      status: 401,
      error: "Sign-in could not be verified. Please sign in again.",
    };
  const initialized = await db.rpc("cp_initialize_workspace");
  // Keep the legitimate Auth session if DB setup is interrupted. The workspace
  // offers the same idempotent initialization on load/retry, without signing up again.
  return {
    status: 200,
    ok: true,
    onboardingPending: Boolean(initialized.error),
  };
}
