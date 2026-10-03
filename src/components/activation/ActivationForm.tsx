"use client";

import { useEffect, useState } from "react";
import { UiIcon } from "@/components/ui/icons";
import { Button, Input } from "@/components/ui/kit";
import { crossSessionBoundary } from "@/lib/clientSession";
import { useCopy } from "@/lib/i18n/client";
import { useAdoptPrehydrationInput } from "@/lib/useAdoptPrehydrationInput";
import { LEGAL_URLS } from "@/lib/legal";
import { NEW_PASSWORD_MAX, NEW_PASSWORD_MIN, isApiBlank } from "@/lib/password";

/**
 * EV-278c — the activation form: a new password and the coach's OWN consent.
 *
 * It posts to /api/auth/activate (this app's origin), never to b-fit-api, and holds no
 * token: the handler swaps the httpOnly cookies. Server data arrives as props — the
 * versions from `GET /legal/versions` and the two sentences the refusals need — so this
 * island fetches nothing on mount.
 *
 * The consent rules, each one a test in `qa/coach-activation.spec.ts`:
 *   - the checkbox starts UNticked and nothing ticks it but the person (GDPR Art. 7,
 *     CJEU Planet49 — the app's BUG-023 rule);
 *   - the submit stays disabled until it is ticked, and unticking disables it again;
 *   - the versions sent are the ones SHOWN in the link text; after a
 *     `409 CONSENT_VERSION_STALE` the new versions are shown and the tick is TAKEN BACK,
 *     never resubmitted silently (a silent retry would record consent to text the person
 *     did not see — the app's §8b recovery, mirrored).
 *
 * What was typed or ticked BEFORE hydration (BUG-686 follow-up) is adopted once, after it,
 * by `useAdoptPrehydrationInput`: the three passwords, and the consent box. Adopting a tick
 * does not break the first rule above — the box is ticked on screen because the person
 * ticked it, and the alternative was a box shown ticked with consent `false` behind it, which
 * a click would visibly UNtick while leaving the state unchanged.
 */

type Versions = { privacyPolicyVersion: string; termsVersion: string };

export interface ActivationFormProps {
  versions: Versions;
  /** `copy.activate.expiredOnSubmit`, already formatted on the server (UTC). */
  expiredMessage: string;
}

export function ActivationForm({ versions: initialVersions, expiredMessage }: ActivationFormProps) {
  const copy = useCopy();
  const [temporary, setTemporary] = useState("");
  const [fresh, setFresh] = useState("");
  const [repeat, setRepeat] = useState("");
  const [consent, setConsent] = useState(false);
  const [versions, setVersions] = useState<Versions>(initialVersions);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** A refusal nothing on this screen can fix (expired, not initialised, finished). */
  const [closed, setClosed] = useState(false);
  /** 429: the submit is held until this instant (ms). */
  const [heldUntil, setHeldUntil] = useState<number | null>(null);
  const form = useAdoptPrehydrationInput<HTMLFormElement>();

  useEffect(() => {
    if (heldUntil === null) return;
    const wait = heldUntil - Date.now();
    if (wait <= 0) {
      setHeldUntil(null);
      return;
    }
    const timer = setTimeout(() => setHeldUntil(null), wait);
    return () => clearTimeout(timer);
  }, [heldUntil]);

  // BUG-381: the api's `@NotBlank` (spaces, tabs and other chars <= U+0020 only), checked
  // before its `@Size`, because more spaces can never satisfy it — see src/lib/password.ts.
  const blank = fresh.length > 0 && isApiBlank(fresh);
  const tooShort = !blank && fresh.length > 0 && fresh.length < NEW_PASSWORD_MIN;
  const tooLong = fresh.length > NEW_PASSWORD_MAX;
  const mismatch = repeat.length > 0 && repeat !== fresh;
  const ready =
    !isApiBlank(temporary) &&
    fresh.length >= NEW_PASSWORD_MIN &&
    !blank &&
    !tooLong &&
    repeat === fresh &&
    consent === true;
  const disabled = !ready || busy || closed || heldUntil !== null;

  function clearPasswords() {
    setTemporary("");
    setFresh("");
    setRepeat("");
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (disabled) return;
    setBusy(true);
    setError(null);
    // Set once the document is leaving, so the button stays disabled until the load.
    let leaving = false;
    try {
      const res = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          temporaryPassword: temporary,
          newPassword: fresh,
          consentAccepted: consent,
          privacyPolicyVersion: versions.privacyPolicyVersion,
          termsVersion: versions.termsVersion,
        }),
      });
      if (res.ok) {
        // The handler has swapped the session to the fresh COACH tokens. A hard navigation
        // (ADR-0033 D33.7): the client router would otherwise replay an RSC payload rendered
        // for the PENDING session.
        leaving = true;
        crossSessionBoundary("/");
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        code?: string;
        retryAfterSeconds?: number | null;
        versions?: Versions | null;
      } | null;
      // AC-P5c: the screen stays open and keeps what was typed except the passwords.
      clearPasswords();
      switch (body?.code) {
        case "TEMPORARY_PASSWORD_INVALID":
          setError(copy.activate.temporaryInvalid);
          break;
        case "TEMPORARY_PASSWORD_REUSED":
          setError(copy.activate.temporaryReused);
          break;
        case "PASSWORD_BLANK":
          setError(copy.activate.blank);
          break;
        case "VALIDATION_ERROR":
          setError(copy.activate.validation);
          break;
        case "CONSENT_REQUIRED":
          setConsent(false);
          setError(copy.activate.consentRequired);
          break;
        case "CONSENT_VERSION_STALE": {
          setConsent(false);
          const next = body.versions;
          if (
            next &&
            (next.privacyPolicyVersion !== versions.privacyPolicyVersion ||
              next.termsVersion !== versions.termsVersion)
          ) {
            setVersions(next);
            setError(copy.activate.consentUpdated);
          } else {
            setError(copy.activate.consentReload);
          }
          break;
        }
        case "RATE_LIMITED": {
          const seconds = body.retryAfterSeconds;
          if (typeof seconds === "number" && seconds > 0) {
            setHeldUntil(Date.now() + seconds * 1000);
            setError(copy.activate.rateLimited(Math.ceil(seconds / 60)));
          } else {
            setError(copy.activate.rateLimitedNoWait);
          }
          break;
        }
        case "ACTIVATION_EXPIRED":
          setClosed(true);
          setError(expiredMessage);
          break;
        case "ACCOUNT_NOT_INITIALISED":
          setClosed(true);
          setError(copy.activate.notInitialised);
          break;
        case "ACCOUNT_ALREADY_ACTIVE":
        case "ACTIVATED_SIGN_IN_AGAIN":
          setClosed(true);
          setError(copy.activate.signedInAgain);
          break;
        case "SESSION_EXPIRED":
          leaving = true;
          crossSessionBoundary("/login?error=expired");
          return;
        case "API_UNAVAILABLE":
          setError(copy.activate.unavailable);
          break;
        default:
          setError(copy.activate.failed);
      }
    } catch {
      clearPasswords();
      setError(copy.activate.unavailable);
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  return (
    <form
      ref={form}
      onSubmit={submit}
      noValidate
      aria-busy={busy || undefined}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 9,
            padding: "11px 13px",
            borderRadius: "var(--r-md)",
            background: "var(--err-bg)",
            color: "var(--err-ink)",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <UiIcon name="ban" size={16} color="var(--err-ink)" />
          <span>{error}</span>
        </div>
      )}

      <Input
        label={copy.activate.temporaryPassword}
        ariaLabel={copy.activate.temporaryPassword}
        hint={copy.activate.temporaryHint}
        hintId="activate-temporary-hint"
        icon="key"
        type="password"
        autoComplete="current-password"
        value={temporary}
        full
        onChange={(e) => setTemporary(e.target.value)}
      />
      <Input
        label={copy.activate.newPassword}
        ariaLabel={copy.activate.newPassword}
        hint={blank || tooShort || tooLong ? undefined : copy.activate.newHint}
        error={
          blank
            ? copy.activate.blank
            : tooShort
              ? copy.activate.newHint
              : tooLong
                ? copy.activate.validation
                : undefined
        }
        hintId="activate-new-hint"
        icon="key"
        type="password"
        autoComplete="new-password"
        value={fresh}
        full
        onChange={(e) => setFresh(e.target.value)}
      />
      <Input
        label={copy.activate.repeatPassword}
        ariaLabel={copy.activate.repeatPassword}
        error={mismatch ? copy.activate.mismatch : undefined}
        hintId="activate-repeat-hint"
        icon="key"
        type="password"
        autoComplete="new-password"
        value={repeat}
        full
        onChange={(e) => setRepeat(e.target.value)}
      />

      {/* BUG-662: the label is the checkbox's target (≥ 44 px tall, the card's width), and
          each document link is a 44 px target in its own row (globals.css `.consent*`). The
          links stay OUTSIDE the label, so opening a document to read it never ticks the box. */}
      <div className="consent">
        <label className="consent-row">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{copy.activate.consent}</span>
        </label>
        <div className="consent-docs">
          <span>{copy.activate.readBefore}</span>
          <span className="consent-links">
            <a className="consent-link" href={LEGAL_URLS.terms} target="_blank" rel="noopener noreferrer">
              {copy.activate.termsLink(versions.termsVersion)}
            </a>
            <a className="consent-link" href={LEGAL_URLS.privacy} target="_blank" rel="noopener noreferrer">
              {copy.activate.privacyLink(versions.privacyPolicyVersion)}
            </a>
          </span>
        </div>
      </div>

      <Button variant="gradient" size="lg" full type="submit" disabled={disabled} style={{ height: 48, fontSize: 15 }}>
        {busy ? copy.activate.submitting : copy.activate.submit}
      </Button>
    </form>
  );
}
