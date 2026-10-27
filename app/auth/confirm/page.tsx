"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/auth/brand";
export default function Confirm() {
  const started = useRef(false);
  const [error, setError] = useState("");
  const [invitation, setInvitation] = useState<{
    email: string;
    userId: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const invitationTokens = useRef<{
    accessToken: string;
    refreshToken: string;
  } | null>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const query = new URLSearchParams(location.search),
          fragment = new URLSearchParams(location.hash.slice(1));
        const code = query.get("code"),
          tokenHash = query.get("token_hash"),
          type = query.get("type");
        const accessToken = fragment.get("access_token"),
          refreshToken = fragment.get("refresh_token");
        history.replaceState(null, "", "/auth/confirm");
        if (accessToken || refreshToken) {
          if (
            !accessToken ||
            !refreshToken ||
            fragment.get("type") !== "invite"
          )
            throw new Error(
              "This sign-in link is incomplete or unsupported. Request a new invitation.",
            );
          const response = await fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "preview_invite", accessToken }),
          });
          const verified = await response.json();
          if (!response.ok) throw new Error(verified.error);
          invitationTokens.current = { accessToken, refreshToken };
          setInvitation({ email: verified.email, userId: verified.userId });
          return;
        }
        if (code || tokenHash) {
          const r = await fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              code
                ? { action: "exchange", code }
                : { action: "verify_link", tokenHash, type },
            ),
          });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error);
        } else
          throw new Error(
            "This link is incomplete or expired. Request a new sign-in link.",
          );
        location.replace("/");
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);
  async function accept() {
    if (!invitationTokens.current || !invitation) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept_invite",
          ...invitationTokens.current,
          expectedUserId: invitation.userId,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      invitationTokens.current = null;
      location.replace("/");
    } catch (error) {
      invitationTokens.current = null;
      setInvitation(null);
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <Brand />
      <section className="panel login-card">
        <h1>
          {error
            ? "Let’s try a new link"
            : invitation
              ? "Confirm your account"
              : "Signing you in…"}
        </h1>
        <p role={error ? "alert" : "status"}>
          {error ||
            (invitation
              ? "Only continue if this is the account you intended to use."
              : "Verifying your individual account and opening your workspace.")}
        </p>
        {invitation && (
          <div>
            <p>
              <strong>{invitation.email}</strong>
            </p>
            <Button disabled={busy} onClick={accept}>
              {busy ? "Signing you in…" : "Continue with this account"}
            </Button>
            <p>
              <Link
                href="/login"
                onClick={() => {
                  invitationTokens.current = null;
                }}
              >
                Use a different account
              </Link>
            </p>
          </div>
        )}
        {error && (
          <Link className="btn btn-primary" href="/login">
            Return to sign in
          </Link>
        )}
      </section>
    </main>
  );
}
