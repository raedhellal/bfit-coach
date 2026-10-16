"use client";

import { useEffect, useId, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, MIN_TOUCH_TARGET } from "@/components/ui/kit";
import { useCopy } from "@/lib/i18n/client";
import { muscleLabel } from "@/lib/catalogLabels";
import { isoWeekdayLabel } from "@/lib/format";
import { logPortalEvent } from "@/lib/portalEvents";
import { settled } from "@/lib/settled";
import {
  ROUTINE_AI_DAYS,
  ROUTINE_AI_EMPHASIS_MAX,
  ROUTINE_AI_GOALS,
  ROUTINE_AI_NOTES_MAX,
  ROUTINE_AI_SESSION_LENGTHS,
  briefBlocked,
  briefRequest,
  heldUntil,
  initialBriefForm,
  isRoutineAiGoal,
  notesLength,
  pollDelayMs,
  routineAiSentence,
  type RoutineAiBriefForm,
  type RoutineAiFailure,
} from "@/lib/routineAi";
import {
  discardRoutineAiAction,
  readRoutineAiAction,
  startRoutineAiAction,
  type RoutineAiActionFailure,
} from "@/lib/routineAiActions";
import type { CoachRoutineAiProposalResponse, Routine } from "@/lib/coachApi";

/**
 * EV-186b — « Régénérer avec l'IA » on the routine page: the brief, the running state, the
 * refusal and failure sentences, and « Écarter ». Rendered ONLY when the routine read's
 * `aiProposals.routine` is literally true (`routineAiCapability`, decided by the page): with it
 * false, absent or malformed the page does not import a byte of this (B1).
 *
 * The work is server-side (ADR-0036 D36.2): « Générer » answers 202 and the panel POLLS the
 * api's GET. A coach who leaves and comes back gets the same proposal, because the page reads
 * it on the server and seeds `initial` from it (B3).
 *
 * NOT in this slice (EV-186n): the per-day comparison, the repair marks, « Garder » and the
 * STALE copy. A READY proposal is shown here as a plain read-only list of its sessions, which
 * is what the STUB banner sits above (B5); nothing in this component can write a draft or a
 * plan. « Modifier avec l'IA » (EV-186f) is not drawn either: the vendored contract's `kind`
 * is REGENERATE only.
 */

type View =
  | { kind: "idle" }
  | { kind: "brief" }
  | { kind: "running"; proposalId: string | null; startedAt: number }
  | { kind: "ready"; proposal: CoachRoutineAiProposalResponse }
  | { kind: "failed"; code: string };

const FAILED_RESULT: { ok: false; failure: RoutineAiActionFailure } = { ok: false, failure: { code: "FAILED" } };

/** What the page read, turned into the panel's first view. A failed read starts idle and reads again. */
function viewOf(proposal: CoachRoutineAiProposalResponse | null, now: number): View {
  switch (proposal?.status) {
    case "RUNNING": {
      const created = proposal.createdAt ? Date.parse(proposal.createdAt) : NaN;
      return { kind: "running", proposalId: proposal.proposalId ?? null, startedAt: Number.isNaN(created) ? now : created };
    }
    case "READY":
      return proposal.proposal ? { kind: "ready", proposal } : { kind: "failed", code: "FAILED" };
    case "FAILED":
      return { kind: "failed", code: proposal.errorCode ?? "FAILED" };
    // EXPIRED: nothing can be done with it in this slice; EV-186n gives it the STALE sentence.
    case "EXPIRED":
      return { kind: "failed", code: "FAILED" };
    default:
      return { kind: "idle" };
  }
}

export function RoutineAiPanel({
  clientId,
  firstName,
  document,
  initial,
  muscles,
  injuries,
  equipment,
}: {
  clientId: string;
  /** `firstName(traineeDisplayName, locale)` — sentence-initial form; the copy applies `mid()`. */
  firstName: string;
  /** The plan the editor opened on (draft, else published), for the brief's starting values. */
  document: Routine | null;
  /** The proposal the page read, or null when that read failed (the panel then reads once). */
  initial: CoachRoutineAiProposalResponse | null;
  /** The catalogue's `muscles` facet, or null when it could not be read. */
  muscles: string[] | null;
  /** The trainee's stored injuries, as words (read-only, never sent). */
  injuries: string[];
  /** Their equipment as words, or null when they never answered (read-only, never sent). */
  equipment: string[] | null;
}) {
  const copy = useCopy();
  const t = copy.routineAi;
  const router = useRouter();
  const titleId = useId();
  const notesId = useId();
  const counterId = useId();
  const [view, setView] = useState<View>(() => viewOf(initial, Date.now()));
  const [form, setForm] = useState<RoutineAiBriefForm>(() => initialBriefForm(document));
  /** The refusal sentence for the last press, shown in the panel until the next one. */
  const [notice, setNotice] = useState<string | null>(null);
  /** A spent quota holds « Générer » until the api's Retry-After (the next midnight). */
  const [held, setHeld] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** A 403: the link ended. The next server render redirects to the denial page. */
  function accessEnded() {
    router.refresh();
  }

  function refused(failure: RoutineAiActionFailure): void {
    if (failure.code === "ACCESS_DENIED") return accessEnded();
    const f = failure as RoutineAiFailure;
    setNotice(routineAiSentence(f, firstName, copy));
    const until = heldUntil(f, Date.now());
    if (until !== null) setHeld(until);
  }

  /** Apply a GET's answer to the panel. */
  function adopt(proposal: CoachRoutineAiProposalResponse): void {
    setView(viewOf(proposal, Date.now()));
  }

  // The page's own read failed: ask once, so a coach coming back still finds a running proposal.
  useEffect(() => {
    if (initial !== null) return;
    let live = true;
    void settled(readRoutineAiAction(clientId), FAILED_RESULT).then((result) => {
      if (!live || !mounted.current) return;
      if (result.ok) adopt(result.proposal);
      else if (result.failure.code === "ACCESS_DENIED") accessEnded();
      else if (result.failure.code === "NOT_FOUND") setHidden(true);
    });
    return () => {
      live = false;
    };
    // Once, on mount: `initial` is the page's read and does not change under this island.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // B3: poll while RUNNING. Only the api's FAILED ends a run; the panel never times one out.
  const runningId = view.kind === "running" ? view.proposalId : undefined;
  const runningSince = view.kind === "running" ? view.startedAt : 0;
  useEffect(() => {
    if (view.kind !== "running") return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      timer = setTimeout(async () => {
        const result = await settled(readRoutineAiAction(clientId), FAILED_RESULT);
        if (!live || !mounted.current) return;
        if (!result.ok) {
          if (result.failure.code === "ACCESS_DENIED") return accessEnded();
          if (result.failure.code === "NOT_FOUND") return setHidden(true);
          return tick(); // no answer: ask again, nothing on screen claims a failure it did not see
        }
        const p = result.proposal;
        // A different proposal than the one being waited on (another tab replaced it): show it.
        if (p.status === "RUNNING") return tick();
        if (p.status === "CANCELLED" || p.status === "NONE") return setView({ kind: "idle" });
        adopt(p);
      }, pollDelayMs(Date.now() - runningSince));
    };
    tick();
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.kind, runningId, runningSince, clientId]);

  // The hold lifts by itself at the instant the api named.
  useEffect(() => {
    if (held === null) return;
    const timer = setTimeout(() => setHeld(null), Math.max(0, held - Date.now()));
    return () => clearTimeout(timer);
  }, [held]);

  function generate() {
    const body = briefRequest(form);
    if (!body) return;
    setNotice(null);
    startTransition(async () => {
      const result = await settled(startRoutineAiAction(clientId, body), FAILED_RESULT);
      if (!mounted.current) return;
      if (result.ok) {
        setView({ kind: "running", proposalId: result.proposalId, startedAt: Date.now() });
        return;
      }
      refused(result.failure);
      // 409 COACH_AI_PROPOSAL_RUNNING: say so, then wait on the run that is already going.
      if (result.failure.code === "COACH_AI_PROPOSAL_RUNNING") {
        const read = await settled(readRoutineAiAction(clientId), FAILED_RESULT);
        if (read.ok && mounted.current) adopt(read.proposal);
      }
    });
  }

  function discard() {
    const kind = view.kind === "ready" ? (view.proposal.kind ?? "REGENERATE") : "REGENERATE";
    setNotice(null);
    startTransition(async () => {
      const result = await settled(discardRoutineAiAction(clientId), FAILED_RESULT);
      if (!mounted.current) return;
      if (!result.ok) {
        if (result.failure.code === "NOT_FOUND") return setHidden(true);
        return refused(result.failure);
      }
      logPortalEvent({ event: "coach_ai_proposal_discarded", kind });
      setView({ kind: "idle" });
    });
  }

  if (hidden) return null;

  const blocked = briefBlocked(form);
  const isHeld = held !== null && held > Date.now();
  const count = notesLength(form.notes);
  const fieldStyle: CSSProperties = {
    display: "block",
    marginTop: 6,
    minHeight: MIN_TOUCH_TARGET,
    width: "100%",
    maxWidth: 360,
    borderRadius: "var(--r-md)",
    border: "1px solid var(--border-2)",
    background: "var(--surface)",
    padding: "0 12px",
    fontSize: 14,
    color: "var(--ink)",
  };
  const labelStyle: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" };
  const noteStyle: CSSProperties = { margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--ink-2)" };

  return (
    <section
      aria-labelledby={titleId}
      className="routine-ai"
      data-testid="routine-ai-panel"
      data-ai-state={view.kind}
    >
      <Card style={{ marginBottom: 16 }}>
        {view.kind === "idle" ? (
          <>
            {/* Closed: the one control. Its words name the region too. */}
            <h3 id={titleId} className="sr-only">
              {t.title}
            </h3>
            <Button
              icon="star"
              variant="soft"
              onClick={() => {
                setNotice(null);
                setView({ kind: "brief" });
              }}
            >
              {t.open}
            </Button>
          </>
        ) : (
          <h3 id={titleId} style={{ margin: "0 0 10px", fontSize: 15.5, fontWeight: 600, color: "var(--ink)" }}>
            {t.title}
          </h3>
        )}

        {notice && (
          <p role="alert" data-testid="routine-ai-notice" style={{ ...noteStyle, color: "var(--err-ink)" }}>
            {notice}
          </p>
        )}

        {view.kind === "brief" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              generate();
            }}
            style={{ display: "grid", gap: 14, marginTop: 4 }}
          >
            {/* AC1 control 1: the goal, pre-filled from the trainee's (served) goal. */}
            <label style={labelStyle}>
              {t.goalLabel}
              <select
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: isRoutineAiGoal(e.target.value) ? e.target.value : "" })}
                style={fieldStyle}
                required
              >
                <option value="">{t.choose}</option>
                {ROUTINE_AI_GOALS.map((goal) => (
                  <option key={goal} value={goal}>
                    {copy.intakePage.values.primaryGoal[goal] ?? goal}
                  </option>
                ))}
              </select>
            </label>
            {/* AC1 control 2: 2–6, the publishable plan's bound. */}
            <label style={labelStyle}>
              {t.daysLabel}
              <select
                value={form.days === "" ? "" : String(form.days)}
                onChange={(e) => setForm({ ...form, days: e.target.value === "" ? "" : Number(e.target.value) })}
                style={fieldStyle}
                required
              >
                <option value="">{t.choose}</option>
                {ROUTINE_AI_DAYS.map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {/* AC1 control 3: the api's fixed durations. */}
            <label style={labelStyle}>
              {t.sessionLengthLabel}
              <select
                value={form.sessionLength === "" ? "" : String(form.sessionLength)}
                onChange={(e) =>
                  setForm({ ...form, sessionLength: e.target.value === "" ? "" : Number(e.target.value) })
                }
                style={fieldStyle}
                required
              >
                <option value="">{t.choose}</option>
                {ROUTINE_AI_SESSION_LENGTHS.map((n) => (
                  <option key={n} value={String(n)}>
                    {copy.intakePage.minutes(n)}
                  </option>
                ))}
              </select>
            </label>
            {/* AC1 control 4: the catalogue's own vocabulary, never free text; the value sent is the raw facet value. */}
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={labelStyle}>{t.emphasisLabel}</legend>
              {muscles === null ? (
                <p style={noteStyle}>{t.emphasisUnavailable}</p>
              ) : (
                <>
                  <p style={{ ...noteStyle, marginTop: 2, color: "var(--ink-3)" }}>{t.emphasisHint}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 6 }}>
                    {muscles.map((muscle) => {
                      const checked = form.emphasis.includes(muscle);
                      const full = !checked && form.emphasis.length >= ROUTINE_AI_EMPHASIS_MAX;
                      return (
                        <label
                          key={muscle}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: MIN_TOUCH_TARGET, fontSize: 14 }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={full}
                            onChange={() =>
                              setForm({
                                ...form,
                                emphasis: checked
                                  ? form.emphasis.filter((m) => m !== muscle)
                                  : [...form.emphasis, muscle],
                              })
                            }
                          />
                          {muscleLabel(muscle, copy)}
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </fieldset>
            {/* AC1 control 5: notes, 500 with a visible counter; never truncated here. */}
            <div>
              <label htmlFor={notesId} style={labelStyle}>
                {t.notesLabel}
              </label>
              <textarea
                id={notesId}
                value={form.notes}
                aria-describedby={counterId}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                style={{ ...fieldStyle, maxWidth: 560, padding: "8px 12px", resize: "vertical" }}
              />
              <p
                id={counterId}
                data-testid="routine-ai-counter"
                style={{
                  margin: "4px 0 0",
                  fontSize: 12.5,
                  color: count > ROUTINE_AI_NOTES_MAX ? "var(--err-ink)" : "var(--ink-3)",
                }}
              >
                {t.counter(count)}
              </p>
            </div>
            {/* AC1: the trainee's stored injuries and equipment, as text. No control sends them. */}
            <div data-testid="routine-ai-profile" style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
              <p style={{ margin: 0 }}>{t.profileLine(firstName)}</p>
              <p style={{ margin: 0 }}>
                {copy.common.labelled(
                  copy.routine.injuries,
                  injuries.length > 0 ? injuries.join(", ") : copy.routine.profileNoInjury
                )}
              </p>
              <p style={{ margin: 0 }}>
                {copy.common.labelled(
                  copy.routine.equipment,
                  equipment === null
                    ? copy.routine.profileUnanswered
                    : equipment.length > 0
                      ? equipment.join(", ")
                      : copy.routine.profileNoInjury
                )}
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button type="submit" icon="star" disabled={blocked !== null || isHeld || pending}>
                {t.submit}
              </Button>
              <Button variant="ghost" onClick={() => setView({ kind: "idle" })} disabled={pending}>
                {t.cancel}
              </Button>
            </div>
          </form>
        )}

        {view.kind === "running" && (
          <>
            <p role="status" style={noteStyle}>
              {t.running(firstName)}
            </p>
            <div style={{ marginTop: 10 }}>
              <Button variant="secondary" onClick={discard} disabled={pending}>
                {t.discard}
              </Button>
            </div>
          </>
        )}

        {view.kind === "failed" && (
          <>
            <p role="alert" style={{ ...noteStyle, color: "var(--err-ink)" }}>
              {routineAiSentence({ code: view.code }, firstName, copy)}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <Button
                onClick={() => {
                  setNotice(null);
                  setView({ kind: "brief" });
                }}
                disabled={pending}
              >
                {t.retry}
              </Button>
              <Button variant="secondary" onClick={discard} disabled={pending}>
                {t.discard}
              </Button>
            </div>
          </>
        )}

        {view.kind === "ready" && view.proposal.proposal && (
          <>
            {/* B5: the STUB banner, above the proposal. */}
            {view.proposal.engine === "STUB" && (
              <p
                role="note"
                data-testid="routine-ai-stub-banner"
                style={{
                  margin: "0 0 10px",
                  padding: "10px 12px",
                  borderRadius: "var(--r-lg)",
                  background: "var(--warn-bg)",
                  color: "var(--warn-ink)",
                  fontSize: 13,
                }}
              >
                {t.stubBanner}
              </p>
            )}
            <ProposalSessions document={view.proposal.proposal} />
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" onClick={discard} disabled={pending}>
                {t.discard}
              </Button>
            </div>
          </>
        )}
      </Card>
    </section>
  );
}

/** The READY proposal, read-only, session by session (EV-186n replaces this with the comparison). */
function ProposalSessions({ document }: { document: Routine }) {
  const copy = useCopy();
  return (
    <ol data-testid="routine-ai-proposal" style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: 10 }}>
      {document.trainingDays.map((day) => (
        <li key={day.dayOfWeek}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
            {`${isoWeekdayLabel(day.dayOfWeek, copy.locale)} · ${day.focus}`}
          </p>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {day.exercises.map((ex, index) => (
              <li key={`${index}-${ex.name}`} style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
                {ex.name}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
