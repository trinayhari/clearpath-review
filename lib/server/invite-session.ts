import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
// Use a stateless client here: do not install any cookies until BOTH token identity
// and refresh ownership are verified, and the visitor explicitly confirms the account.
export async function inspectInvitation(
  auth: SupabaseClient["auth"],
  accessToken: string,
) {
  const {
    data: { user },
    error,
  } = await auth.getUser(accessToken);
  if (
    error ||
    !user?.id ||
    !user.email ||
    !user.email_confirmed_at ||
    user.is_anonymous
  )
    throw new Error(
      "This invitation is invalid or expired. Request a new invitation.",
    );
  return { userId: user.id, email: user.email };
}
export async function acceptInvitation(
  statelessAuth: SupabaseClient["auth"],
  cookieAuth: SupabaseClient["auth"],
  input: { accessToken: string; refreshToken: string; expectedUserId: string },
) {
  const identity = await inspectInvitation(statelessAuth, input.accessToken);
  if (identity.userId !== input.expectedUserId)
    throw new Error("The invitation account changed. Open a new invitation.");
  const { data, error } = await statelessAuth.refreshSession({
    refresh_token: input.refreshToken,
  });
  if (error || !data.session || data.user?.id !== identity.userId)
    throw new Error(
      "This invitation is invalid or expired. Request a new invitation.",
    );
  const result = await cookieAuth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (result.error || result.data.user?.id !== identity.userId)
    throw new Error("The invitation could not establish a verified session.");
  return identity;
}
