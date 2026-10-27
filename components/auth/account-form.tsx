"use client";
import { useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/auth/brand";
import { Button } from "@/components/ui/button";
export function AccountForm({ email }: { email: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  return (
    <main className="account-shell">
      <Brand />
      <Link href="/">← Back to review queue</Link>
      <section className="login-card">
        <h1>Account &amp; sign-in</h1>
        <p>
          Signed in as <strong>{email}</strong>
        </p>
        <h2>Set a password</h2>
        <p>
          Optional: use your email and password for future sign-ins without
          waiting for an email link. Email-link sign-in remains available.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget,
              data = new FormData(form);
            const password = String(data.get("password") ?? "");
            setError("");
            setSaved(false);
            if (password !== data.get("confirmation")) {
              setError("The passwords do not match.");
              return;
            }
            setBusy(true);
            try {
              const response = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "set_password", password }),
              });
              const result = await response.json();
              if (!response.ok)
                throw new Error(
                  result.error || "Your password could not be saved.",
                );
              form.reset();
              setSaved(true);
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Your password could not be saved.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={200}
            required
            disabled={busy}
            aria-describedby="password-help"
          />
          <p id="password-help">
            Use at least 12 characters. Choose a unique password and save it in
            your password manager.
          </p>
          <label htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={200}
            required
            disabled={busy}
          />
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {saved && (
            <div className="alert" role="status">
              Password saved. Next time, choose password sign-in on the login
              page.
            </div>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Saving password…" : "Save password"}
          </Button>
        </form>
      </section>
    </main>
  );
}
