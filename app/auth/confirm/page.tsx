"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/auth/brand";
export default function Confirm() {
  const started = useRef(false);
  const [error, setError] = useState("");
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
        if (accessToken || refreshToken)
          throw new Error(
            "This invitation uses an unsupported link format. Ask the workspace owner to resend a current invitation.",
          );
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
  return (
    <main className="login">
      <Brand />
      <section className="panel login-card">
        <h1>{error ? "Let’s try a new link" : "Signing you in…"}</h1>
        <p role={error ? "alert" : "status"}>
          {error ||
            "Verifying your individual account and opening your workspace."}
        </p>
        {error && (
          <Link className="btn btn-primary" href="/login">
            Return to sign in
          </Link>
        )}
      </section>
    </main>
  );
}
