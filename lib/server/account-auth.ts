import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
export function emailRateLimitMessage(error: {
  code?: string;
  status?: number;
}) {
  if (error.code === "over_email_send_rate_limit")
    return "The sign-in email service has reached its sending limit. Try again after the limit resets, or use password sign-in if you have already set a password. Repeated requests will not restore email delivery.";
  if (error.code === "over_request_rate_limit" || error.status === 429)
    return "Too many sign-in requests. Wait a few minutes before trying again.";
  return null;
}
export async function setAccountPassword(
  auth: SupabaseClient["auth"],
  password: string,
) {
  const {
    data: { user },
    error,
  } = await auth.getUser();
  if (error || !user?.id || user.is_anonymous)
    return {
      status: 401,
      error: "Sign in with your account before setting a password.",
    };
  const result = await auth.updateUser({ password });
  if (result.error) {
    const messages: Record<string, string> = {
      weak_password:
        "Choose a stronger password that meets your account’s password requirements.",
      same_password: "Choose a different password from your current password.",
      reauthentication_needed:
        "A fresh sign-in is required before changing your password. Sign out and sign in again, then return here.",
      reauthentication_not_valid:
        "Your verification has expired. Sign in again before changing your password.",
    };
    return {
      status: 400,
      error:
        messages[result.error.code ?? ""] ??
        "Your password could not be saved. Please try again later.",
    };
  }
  return { status: 200, ok: true };
}
