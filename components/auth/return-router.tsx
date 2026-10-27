"use client";
import { useEffect } from "react";
export function AuthReturnRouter() {
  useEffect(() => {
    // Default dashboard invitations may return to Site URL rather than redirectTo.
    // Fragments never enter HTTP requests. Scrub this history entry before routing
    // to the account-confirmation page, which verifies tokens before any cookies.
    if (location.pathname === "/auth/confirm") return;
    const fragment = location.hash,
      params = new URLSearchParams(fragment.slice(1));
    if (
      params.get("type") === "invite" &&
      (params.has("access_token") || params.has("refresh_token"))
    ) {
      history.replaceState(null, "", location.pathname + location.search);
      location.replace("/auth/confirm" + fragment);
    }
  }, []);
  return null;
}
