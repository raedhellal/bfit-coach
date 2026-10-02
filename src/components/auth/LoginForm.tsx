"use client";

import { useState } from "react";
import { UiIcon } from "@/components/ui/icons";
import { Button, Input } from "@/components/ui/kit";
import { crossSessionBoundary } from "@/lib/clientSession";
import { useCopy } from "@/lib/i18n/client";

/**
 * The credential form. It posts to /api/auth/login (this app's own origin) and never
 * to b-fit-api: the token exchange happens on the server so no token is ever in
 * reach of this component. There is deliberately no token state here, no
 * `localStorage`, and no auth context.
 *
 * The server sets the cookie, and the form then leaves with a DOCUMENT load
 * (`crossSessionBoundary`, ADR-0033 D33.7) — a soft navigation could replay an RSC payload
 * cached without a session.
 */
export function LoginForm({ initialError }: { initialError?: string | null }) {
  const copy = useCopy();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError || null);
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);

  function messageFor(code: string): string {
    switch (code) {
      case "NOT_A_COACH":
        return copy.login.notACoach;
      case "INVALID_CREDENTIALS":
        return copy.login.invalidCredentials;
      // 429 from b-fit-api's login throttle. Saying "incorrect" here would send a coach
      // who typed the right password into a retry loop that only extends the lockout.
      case "RATE_LIMITED":
        return copy.login.rateLimited;
      case "MFA_UNSUPPORTED":
        return copy.login.mfaUnsupported;
      // EV-278c — a pending account the portal will not finish, and a data defect.
      case "PENDING_TRAINEE":
        return copy.login.pendingTrainee;
      case "ACCOUNT_NOT_INITIALISED":
        return copy.login.notInitialised;
      case "API_UNAVAILABLE":
        return copy.login.unavailable;
      default:
        return copy.login.invalidCredentials;
    }
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy || !email || !password) return;
    setBusy(true);
    setError(null);
    // Set once the document is leaving: the button stays disabled until the load, so a
    // second press cannot post the credentials twice.
    let leaving = false;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { code?: string } | null;
        setError(messageFor(body?.code || ""));
        setPassword("");
        return;
      }
      // EV-278c: the handler says where the session lands — the roster, or /activate for
      // an account still to be finished. A closed set; anything else is the roster, and
      // middleware re-decides either way.
      const body = (await res.json().catch(() => null)) as { next?: string } | null;
      // ADR-0033 D33.7: a hard navigation — nothing rendered signed-out is replayed.
      leaving = true;
      crossSessionBoundary(body?.next === "/activate" ? "/activate" : "/");
    } catch {
      setError(copy.login.unavailable);
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ width: "100%", maxWidth: 360 }}>
      <div style={{ marginBottom: 28 }}>
        <h1
          className="dt"
          style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, margin: 0, color: "var(--ink)" }}
        >
          {copy.login.title}
        </h1>
        <p style={{ fontSize: 14, color: "var(--ink-3)", marginTop: 8 }}>{copy.login.subtitle}</p>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "11px 13px",
            borderRadius: "var(--r-md)",
            background: "var(--err-bg)",
            color: "var(--err-ink)",
            fontSize: 13,
            marginBottom: 18,
            lineHeight: 1.45,
          }}
        >
          <UiIcon name="ban" size={16} color="var(--err-ink)" />
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div onFocusCapture={() => setFocus("email")} onBlurCapture={() => setFocus(null)}>
          <Input
            label={copy.login.email}
            icon="mail"
            type="email"
            value={email}
            placeholder={copy.login.emailPlaceholder}
            full
            focusRing={focus === "email"}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div onFocusCapture={() => setFocus("password")} onBlurCapture={() => setFocus(null)}>
          <Input
            label={copy.login.password}
            icon="key"
            type="password"
            value={password}
            placeholder={copy.login.passwordPlaceholder}
            full
            focusRing={focus === "password"}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button
          variant="gradient"
          size="lg"
          full
          type="submit"
          disabled={busy || !email || !password}
        >
          {busy ? copy.login.submitting : copy.login.submit}
        </Button>
      </div>
    </form>
  );
}
