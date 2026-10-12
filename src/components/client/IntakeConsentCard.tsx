"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/kit";
import { OverviewCard, OverviewNote } from "./OverviewCard";
import { useCopy } from "@/lib/i18n/client";
import { askIntakeConsentAction, cancelIntakeConsentAction } from "@/lib/intakeActions";
import {
  INTAKE_POLL_MS,
  intakeConsentPath,
  pollOutcome,
  type IntakeStatus,
  type PollOutcome,
} from "@/lib/intakeConsent";
import { settled } from "@/lib/settled";

/**
 * EV-341w — the overview's « Entretien » card: the coach asks for the intake interview
 * consent on the client's own phone, waits, and sees the answer.
 *
 * The four things the card can say, and nothing else (W1, W4):
 *   · `granted`  — « Accord donné », no button;
 *   · `idle`     — « {prénom} n'a pas encore autorisé l'entretien. » + « Demander l'accord »;
 *   · `waiting`  — the instruction sentence + « Annuler la demande », while the poll runs;
 *   · `answered` — « Pas d'accord pour l'instant. » + « Demander l'accord ».
 * `answered` is ONE state for a decline, an expiry and a cancel in another tab: the api tells
 * them apart nowhere the coach can see (PR12), and so does this component (W4). It is never
 * stored: a reload starts from the server's read, which gives `idle` (W9).
 *
 * THE POLL (W3): `GET /api/bff/clients/{id}/intake-consent` every 3 s while the document is
 * visible, never two at once, and:
 *   · none while hidden; one on becoming visible again, then every 3 s;
 *   · none from the deadline on: `liveForMs` after the coach's own ask (the 201's own two
 *     instants, so a browser clock that is off does not move it). A page that LOADED on
 *     `pending: true` has no deadline (the GET carries none, staff N4): it polls until the api
 *     says `pending: false`, which the server guarantees within 15 minutes;
 *   · none after an answer, a cancel, or the card leaving the page.
 * A failed poll is not an answer: the wait goes on. A 403 is the link ending (W8): the same
 * path as a routine save on a revoked link, `router.refresh()` to the layout's denial page.
 * The middleware's 307 to /login is a session that ended: the page is reloaded, which lands
 * there.
 *
 * Focus: the ask and cancel buttons are the same element in the same place (React keeps the
 * DOM node), so a keyboard user who asks is left on « Annuler la demande », and the sentence
 * above it is a status region that announces each change. That is also why a press in flight
 * does not DISABLE the button (a focused button that becomes disabled loses the focus): a
 * second press while one is out is ignored by the handler instead.
 */

/**
 * The deadline of a request THIS document made and that may still be live, per client, in
 * memory only. It exists for one case: a client-side return to the overview within the router
 * cache's 30 s renders this card from the props read BEFORE the ask, which say `idle`. With a
 * note here, the card resumes the wait instead. It holds a deadline and never an answer (W9),
 * is gone on reload, and is cleared by every answer, cancel and expiry.
 */
const LIVE_UNTIL = new Map<string, number>();

type Notice = "askFailed" | "cancelFailed" | null;
type Phase =
  | { kind: "granted" }
  | { kind: "idle"; capped: boolean; notice: Notice }
  | { kind: "answered"; capped: boolean; notice: Notice }
  | { kind: "waiting"; deadline: number | null; notice: Notice };

function startPhase(clientId: string, initial: IntakeStatus): Phase {
  if (initial.granted) {
    LIVE_UNTIL.delete(clientId);
    return { kind: "granted" };
  }
  const until = LIVE_UNTIL.get(clientId);
  if (until !== undefined && until > Date.now()) return { kind: "waiting", deadline: until, notice: null };
  LIVE_UNTIL.delete(clientId);
  return initial.pending ? { kind: "waiting", deadline: null, notice: null } : { kind: "idle", capped: false, notice: null };
}

async function readStatus(clientId: string, signal: AbortSignal): Promise<PollOutcome> {
  try {
    const res = await fetch(intakeConsentPath(clientId), {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
      headers: { Accept: "application/json" },
      signal,
    });
    const body: unknown = res.status === 200 ? await res.json().catch(() => null) : null;
    return pollOutcome(res.status, res.type, body);
  } catch {
    return { kind: "failed" };
  }
}

export function IntakeConsentCard({
  clientId,
  firstName,
  initial,
}: {
  clientId: string;
  /** `firstName(traineeDisplayName, locale)`, computed by the page. */
  firstName: string;
  /** The page's read, or null when it failed (not a 403: the layout handles that). */
  initial: IntakeStatus | null;
}) {
  const copy = useCopy();
  const c = copy.intake;
  const router = useRouter();
  const capId = useId();
  const [phase, setPhase] = useState<Phase | null>(() => (initial ? startPhase(clientId, initial) : null));
  const [busy, setBusy] = useState(false);

  /**
   * A NEW server read (another action on this page revalidated it) is news only in two
   * directions: the grant (from the app's settings, with no request), or a request made
   * elsewhere while this card is not waiting. Anything else keeps the card's own state, which
   * its poll keeps at least as fresh (islands re-seed from props: an action's render pushes
   * them with a new identity).
   */
  const seeded = useRef(initial);
  useEffect(() => {
    if (seeded.current === initial) return;
    seeded.current = initial;
    if (!initial) return;
    if (initial.granted) {
      LIVE_UNTIL.delete(clientId);
      setPhase({ kind: "granted" });
      return;
    }
    setPhase((current) => {
      // The first read failed: this one is the card's first state.
      if (!current) return startPhase(clientId, initial);
      if (initial.pending && (current.kind === "idle" || current.kind === "answered")) {
        return { kind: "waiting", deadline: null, notice: null };
      }
      return current;
    });
  }, [initial, clientId]);

  /** W8 — the link ended: the overview's own answer, via the layout's 403 decision. */
  function accessEnded(): void {
    LIVE_UNTIL.delete(clientId);
    router.refresh();
  }

  const waiting = phase?.kind === "waiting";
  const deadline = phase?.kind === "waiting" ? phase.deadline : null;

  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: AbortController | null = null;

    const expired = () => deadline !== null && Date.now() >= deadline;
    const settle = (next: Phase) => {
      stopped = true;
      LIVE_UNTIL.delete(clientId);
      setPhase((current) => (current?.kind === "waiting" ? next : current));
    };
    const endOnExpiry = () => settle({ kind: "answered", capped: false, notice: null });

    function schedule(delay: number) {
      clearTimeout(timer);
      timer = undefined;
      if (stopped || document.visibilityState !== "visible") return;
      if (expired()) return endOnExpiry();
      const wait = deadline === null ? delay : Math.min(delay, Math.max(0, deadline - Date.now()));
      timer = setTimeout(tick, Math.max(0, wait));
    }

    async function tick() {
      timer = undefined;
      if (stopped) return;
      if (expired()) return endOnExpiry();
      const started = Date.now();
      inFlight = new AbortController();
      const outcome = await readStatus(clientId, inFlight.signal);
      inFlight = null;
      if (stopped) return;
      switch (outcome.kind) {
        case "status":
          if (outcome.status.granted) return settle({ kind: "granted" });
          if (!outcome.status.pending) return settle({ kind: "answered", capped: false, notice: null });
          return schedule(INTAKE_POLL_MS - (Date.now() - started));
        case "denied":
          // W8, as `accessEnded` below (inlined: an effect names what it uses).
          stopped = true;
          LIVE_UNTIL.delete(clientId);
          router.refresh();
          return;
        case "signedOut":
          stopped = true;
          window.location.reload();
          return;
        case "failed":
          return schedule(INTAKE_POLL_MS - (Date.now() - started));
      }
    }

    function onVisibility() {
      if (stopped) return;
      if (document.visibilityState !== "visible") {
        clearTimeout(timer);
        timer = undefined;
        return;
      }
      // Back in view: read now (unless a read is already out or the deadline has passed).
      if (inFlight === null && timer === undefined) {
        if (expired()) endOnExpiry();
        else void tick();
      }
    }

    schedule(INTAKE_POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      inFlight?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [waiting, deadline, clientId, router]);

  async function ask() {
    if (busy) return;
    setBusy(true);
    const result = await settled(askIntakeConsentAction(clientId), { ok: false, code: "FAILED" as const });
    setBusy(false);
    if (result.ok) {
      const until = Date.now() + result.liveForMs;
      LIVE_UNTIL.set(clientId, until);
      setPhase({ kind: "waiting", deadline: until, notice: null });
      return;
    }
    switch (result.code) {
      case "ACCESS_DENIED":
        return accessEnded();
      case "ALREADY_GRANTED":
        // W7: the api's re-read decides; the 409 alone says granted when the re-read failed.
        return setPhase(result.granted ? { kind: "granted" } : { kind: "idle", capped: false, notice: null });
      case "LIMIT":
        // W6: the cap sentence beside a disabled button, and nothing else changes.
        return setPhase((current) =>
          current && (current.kind === "idle" || current.kind === "answered")
            ? { ...current, capped: true, notice: null }
            : current
        );
      case "FAILED":
        return setPhase((current) =>
          current && (current.kind === "idle" || current.kind === "answered") ? { ...current, notice: "askFailed" } : current
        );
    }
  }

  async function cancel() {
    if (busy) return;
    setBusy(true);
    const result = await settled(cancelIntakeConsentAction(clientId), { ok: false, code: "FAILED" as const });
    setBusy(false);
    if (result.ok) {
      // W5: back to W1's no-grant state. An answer that already arrived is kept.
      LIVE_UNTIL.delete(clientId);
      setPhase((current) => (current?.kind === "waiting" ? { kind: "idle", capped: false, notice: null } : current));
      return;
    }
    if (result.code === "ACCESS_DENIED") return accessEnded();
    setPhase((current) => (current?.kind === "waiting" ? { ...current, notice: "cancelFailed" } : current));
  }

  if (!phase) {
    return (
      <OverviewCard id="ov-intake" title={c.title}>
        <OverviewNote>{c.loadError}</OverviewNote>
      </OverviewCard>
    );
  }

  const sentence =
    phase.kind === "granted"
      ? c.granted
      : phase.kind === "waiting"
        ? c.waiting(firstName)
        : phase.kind === "answered"
          ? c.notNow
          : c.noGrant(firstName);
  const capped = (phase.kind === "idle" || phase.kind === "answered") && phase.capped;
  const notice = phase.kind === "granted" ? null : phase.notice;

  return (
    <OverviewCard id="ov-intake" title={c.title}>
      <div data-intake-state={phase.kind}>
        <p className="ov-note" role="status">
          {sentence}
        </p>
        {capped && (
          <p id={capId} className="ov-note">
            {c.cap}
          </p>
        )}
        {notice && (
          <p className="ov-note" role="alert" style={{ color: "var(--err-ink)" }}>
            {notice === "askFailed" ? c.askFailed : c.cancelFailed}
          </p>
        )}
        {phase.kind !== "granted" && (
          <div className="ov-card-actions">
            {phase.kind === "waiting" ? (
              <Button variant="secondary" onClick={cancel}>
                {c.cancel}
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={ask}
                disabled={capped}
                ariaDescribedBy={capped ? capId : undefined}
              >
                {c.ask}
              </Button>
            )}
          </div>
        )}
      </div>
    </OverviewCard>
  );
}
