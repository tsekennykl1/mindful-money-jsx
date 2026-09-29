// Sign in / sign up / confirm-code screen, shown when Cognito auth is enabled
// and nobody is signed in. With auth disabled it simply renders the app.

import { useEffect, useState } from "react";
import {
  AUTH_ENABLED,
  confirmSignUp,
  getCurrentUser,
  resendCode,
  signIn,
  signOut,
  signUp,
} from "../lib/auth-token";
import { Button, ErrorNote, Field, Spinner, inputClass } from "./Ui";

export default function AuthGate({ children }) {
  const [status, setStatus] = useState(AUTH_ENABLED ? "checking" : "in");
  const [mode, setMode] = useState("signin"); // signin | signup | confirm
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!AUTH_ENABLED) return;
    getCurrentUser().then((u) => setStatus(u ? "in" : "out"));
  }, []);

  if (status === "checking") return <Spinner />;
  if (status === "in") {
    if (!AUTH_ENABLED) return children;
    return (
      <>
        {children}
        <button
          onClick={async () => {
            await signOut();
            sessionStorage.clear();
            setStatus("out");
          }}
          className="fixed bottom-2 right-2 z-50 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground shadow-sm"
        >
          Sign out
        </button>
      </>
    );
  }

  const go = (m) => {
    setMode(m);
    setError("");
    setInfo("");
  };

  const doSignIn = async () => {
    try {
      const res = await signIn(email, password);
      const step = res?.nextStep?.signInStep;
      if (step === "CONFIRM_SIGN_UP") {
        await resendCode(email);
        setInfo("Please confirm your email — we sent a new code.");
        setMode("confirm");
        return;
      }
      if (res?.isSignedIn === false) throw new Error(`Additional sign-in step required (${step})`);
      setStatus("in");
    } catch (err) {
      if (err?.name === "UserAlreadyAuthenticatedException") return setStatus("in");
      throw err;
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (mode === "signin") {
        await doSignIn();
      } else if (mode === "signup") {
        const res = await signUp(email, password);
        if (res?.nextStep?.signUpStep === "CONFIRM_SIGN_UP") {
          setInfo(`We emailed a code to ${email}.`);
          setMode("confirm");
        } else {
          await doSignIn();
        }
      } else {
        await confirmSignUp(email, code);
        if (password) await doSignIn();
        else {
          setInfo("Email confirmed — please sign in.");
          setMode("signin");
        }
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    }
    setBusy(false);
  };

  const title = { signin: "Sign in", signup: "Create account", confirm: "Confirm email" }[mode];
  const cta = busy ? "Please wait…" : { signin: "Sign in", signup: "Sign up", confirm: "Confirm" }[mode];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <h1 className="text-base font-bold">{title}</h1>
        <ErrorNote>{error}</ErrorNote>
        {info && <p className="text-xs text-muted-foreground">{info}</p>}

        <Field label="Email">
          <input type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value.trim())} autoComplete="email" />
        </Field>

        {mode !== "confirm" && (
          <Field label="Password">
            <input
              type="password"
              required
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </Field>
        )}
        {mode === "signup" && (
          <p className="text-[11px] text-muted-foreground">At least 8 characters with upper, lower case, a number and a symbol.</p>
        )}

        {mode === "confirm" && (
          <Field label="Verification code">
            <input inputMode="numeric" required className={inputClass} value={code} onChange={(e) => setCode(e.target.value.trim())} autoComplete="one-time-code" />
          </Field>
        )}

        <Button variant="primary" type="submit" disabled={busy} className="w-full">
          {cta}
        </Button>

        <div className="flex justify-between text-xs">
          {mode === "signin" ? (
            <button type="button" className="text-primary" onClick={() => go("signup")}>Create an account</button>
          ) : (
            <button type="button" className="text-primary" onClick={() => go("signin")}>Back to sign in</button>
          )}
          {mode === "confirm" && (
            <button
              type="button"
              className="text-primary"
              onClick={async () => {
                try {
                  await resendCode(email);
                  setInfo("New code sent.");
                } catch (err) {
                  setError(err.message);
                }
              }}
            >
              Resend code
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
