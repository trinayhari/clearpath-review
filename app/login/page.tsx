"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/auth/brand";
export default function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [method, setMethod] = useState<"email_link" | "login" | "signup">("login"),
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
          <span className="eyebrow">CLEARPATH REVIEW</span>
          <h1>
            From campaign draft
            <br />
            to a clear decision.
          </h1>
          <p>
            A shared workspace for marketing and compliance. Know what needs
            review, who owns it, and what happens next.
          </p>
          <ol className="auth-workflow">
            <li>
              <span>01</span>
              <div>
                <strong>Prepare the campaign</strong>
                <small>Marketing saves the copy and runs a precheck.</small>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Work through feedback</strong>
                <small>A named reviewer checks the submitted version.</small>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Keep the decision on record</strong>
                <small>
                  Approval, revisions, and discussion stay together.
                </small>
              </div>
            </li>
          </ol>
        </div>
        <small>ClearPath Financial · Marketing review workspace</small>
      </section>
      <section className="auth-form-area">
        <div className="login-card">
          <h2>
            {method === "signup"
              ? "Create your ClearPath account"
              : "Sign in to ClearPath Review"}
          </h2>
          <p>
            {method === "signup"
              ? "Start in your own private workspace. No confirmation email required."
              : "Use your email and password to return to your saved work."}
          </p>
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
                        method !== "email_link"
                          ? form.get("password")
                          : undefined,
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
              <label htmlFor="signin-email">Email</label>
              <input
                id="signin-email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              {method !== "email_link" && (
                <>
                  <label htmlFor="signin-password">Password</label>
                  <input
                    id="signin-password"
                    name="password"
                    type="password"
                    required
                    autoComplete={
                      method === "signup" ? "new-password" : "current-password"
                    }
                    minLength={method === "signup" ? 12 : 8}
                    maxLength={200}
                    aria-describedby={
                      method === "signup" ? "signup-guidance" : undefined
                    }
                  />
                </>
              )}
              {method === "signup" && (
                <p id="signup-guidance" className="signup-note">
                  Use at least 12 characters. Email ownership is not verified in
                  this take-home. Signup creates marketer access only to your
                  own workspace; it does not grant access to an existing team or
                  reviewer permissions.
                </p>
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
                    : method === "signup"
                      ? "Create account"
                      : "Sign in"}
                <ArrowRight size={16} />
              </Button>
              <button
                type="button"
                className="auth-method"
                disabled={busy}
                onClick={() => {
                  setMethod(method === "signup" ? "login" : "signup");
                  setError("");
                }}
              >
                {method === "signup"
                  ? "Already have an account? Sign in"
                  : "New here? Create an account"}
              </button>
              {method !== "signup" && (
                <button
                  type="button"
                  className="auth-method"
                  disabled={busy}
                  onClick={() => {
                    setMethod(method === "email_link" ? "login" : "email_link");
                    setError("");
                  }}
                >
                  {method === "email_link"
                    ? "Use a password instead"
                    : "Invited without a password? Use an email link"}
                </button>
              )}
            </form>
          )}
          <details className="access-help">
            <summary>Joining your team for the first time?</summary>
            <p>
              Create an account to start your own team. To join an existing
              team, ask its owner for an invitation code, then open Team &
              people after signing in. Signing in alone does not grant access to
              a team’s campaigns.
            </p>
            <p>
              New accounts can draft campaigns and run prechecks. Human
              decisions require a separately authorized reviewer. Existing
              invited accounts keep their assigned role; signup cannot reset an
              existing account’s password.
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
