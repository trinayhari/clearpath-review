"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/auth/brand";
export default function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [method, setMethod] = useState<"email_link" | "login">("email_link"),
    [sent, setSent] = useState(false),
    [email, setEmail] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);
  useEffect(() => {
    setSetupRequired(
      new URLSearchParams(location.search).get("setup") === "required",
    );
  }, []);
  return (
    <main className="auth-shell">
      <section className="auth-intro">
        <Brand />
        <div>
          <span className="eyebrow">MARKETING & COMPLIANCE, IN SYNC</span>
          <h1>
            Clear decisions.
            <br />
            One shared record.
          </h1>
          <p>
            Bring the campaign, the policy, and the conversation together. Move
            from first draft to a decision on the exact copy.
          </p>
          <div className="auth-principles">
            <span>Version history that stays intact</span>
            <span>Review decisions owned by people</span>
            <span>Saved work, ready for your team</span>
          </div>
        </div>
        <small>ClearPath Financial · Marketing review workspace</small>
      </section>
      <section className="auth-form-area">
        <div className="login-card">
          <h2>Sign in to ClearPath Review</h2>
          <p>Use the work email associated with your invitation.</p>
          {setupRequired ? (
            <div className="alert error" role="alert">
              Workspace sign-in is not configured on this instance. The owner
              must configure its Supabase connection before accounts can sign
              in. The sample preview remains available below.
            </div>
          ) : sent ? (
            <div className="signin-sent" role="status">
              <Mail size={25} />
              <h3>Check your inbox</h3>
              <p>
                If <strong>{email}</strong> has an account, we’ve requested a
                sign-in link. Open it in this browser to continue.
              </p>
              <p>
                Links expire and can only be used once. Check your spam folder
                if it doesn’t arrive.
              </p>
              <Button variant="outline" onClick={() => setSent(false)}>
                Use a different email
              </Button>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const form = new FormData(e.currentTarget);
                try {
                  const r = await fetch("/api/auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: method,
                      email,
                      password:
                        method === "login" ? form.get("password") : undefined,
                    }),
                  });
                  const data = await r.json();
                  if (!r.ok) throw new Error(data.error);
                  if (method === "email_link") setSent(true);
                  else location.replace("/");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label htmlFor="signin-email">Work email</label>
              <input
                id="signin-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
              {method === "login" && (
                <>
                  <label htmlFor="signin-password">Password</label>
                  <input
                    id="signin-password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    minLength={8}
                  />
                </>
              )}
              {error && (
                <p role="alert" className="alert error">
                  {error}
                </p>
              )}
              <Button disabled={busy}>
                {busy
                  ? "Please wait…"
                  : method === "email_link"
                    ? "Email me a sign-in link"
                    : "Sign in"}
                <ArrowRight size={16} />
              </Button>
              <button
                type="button"
                className="auth-method"
                onClick={() => {
                  setMethod(method === "login" ? "email_link" : "login");
                  setError("");
                }}
              >
                {method === "login"
                  ? "Use an email sign-in link instead"
                  : "Use a password instead"}
              </button>
            </form>
          )}
          <details className="access-help">
            <summary>Joining your team for the first time?</summary>
            <p>
              Open the invitation sent to your work email. Workspace access is
              assigned separately: the person who invited you must add your
              account as Marketing or Compliance reviewer.
            </p>
            <p>
              No invitation yet? Send your work email and intended role to the
              person who shared this workspace with you. They can use the{" "}
              <a
                href="https://github.com/trinayhari/clearpath-review/blob/main/docs/ACCOUNT-ONBOARDING.md"
                target="_blank"
                rel="noreferrer"
              >
                workspace owner’s setup steps
              </a>
              . Signing in alone does not grant access to a team’s campaigns.
            </p>
          </details>
          <div className="auth-security">
            <ShieldCheck size={15} />
            Your individual account. Your team’s access controls.
          </div>
          <Link className="preview-link" href="/preview">
            Just looking? Explore a sample workspace →
          </Link>
        </div>
      </section>
    </main>
  );
}
