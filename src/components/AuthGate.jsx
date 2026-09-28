// Shows a sign-in form when Cognito auth is enabled and nobody is signed in.
// With auth disabled it simply renders the app.

import { useEffect, useState } from "react";
import { AUTH_ENABLED, getCurrentUser, signIn } from "../lib/auth-token";
import { Button, ErrorNote, Field, Spinner, inputClass } from "./Ui";

export default function AuthGate({ children }) {
  const [status, setStatus] = useState(AUTH_ENABLED ? "checking" : "in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!AUTH_ENABLED) return;
    getCurrentUser().then((u) => setStatus(u ? "in" : "out"));
  }, []);

  if (status === "in") return children;
  if (status === "checking") return <Spinner />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await signIn(username, password);
      if (res?.isSignedIn === false) throw new Error("Additional sign-in step required");
      setStatus("in");
    } catch (err) {
      setError(err.message || "Sign-in failed");
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <h1 className="text-base font-bold">Sign in</h1>
        <ErrorNote>{error}</ErrorNote>
        <Field label="Username">
          <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </Field>
        <Field label="Password">
          <input type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <Button variant="primary" type="submit" disabled={busy} className="w-full">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
