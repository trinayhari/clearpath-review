"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <Link className="brand" href="/">
        ◈ ClearPath <span>Review</span>
      </Link>
      <div className="panel login-card">
        <h1>Welcome to your workspace</h1>
        <p>
          Use your individual evaluator account. Your workspace administrator
          assigns your role.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const f = new FormData(e.currentTarget);
            try {
              const r = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "login",
                  email: f.get("email"),
                  password: f.get("password"),
                }),
              });
              const data = await r.json();
              if (!r.ok) throw new Error(data.error);
              location.href = "/?workspace=live";
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              minLength={8}
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <Button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        </form>
        <Link href="/">Explore the isolated fictional demo →</Link>
      </div>
    </main>
  );
}
