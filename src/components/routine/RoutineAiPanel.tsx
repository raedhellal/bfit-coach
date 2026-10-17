"use client";

import { useEffect, useId, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { RoutineAiDiff } from "./RoutineAiDiff";
import { useCopy } from "@/lib/i18n/client";
import { muscleLabel } from "@/lib/catalogLabels";
import { logPortalEvent } from "@/lib/portalEvents";
import { settled } from "@/lib/settled";
import {
  ROUTINE_AI_CHIPS,
  ROUTINE_AI_DAYS,
  ROUTINE_AI_EMPHASIS_MAX,
  ROUTINE_AI_GOALS,
  ROUTINE_AI_INSTRUCTION_MAX,
  ROUTINE_AI_NOTES_MAX,
  ROUTINE_AI_SESSION_LENGTHS,
  briefBlocked,
  briefRequest,
  chipsIn,
  heldUntil,
  initialBriefForm,
  isRoutineAiGoal,
  notesLength,
  opsRejectedCount,
  pollDelayMs,
  reviseRequest,
  routineAiSentence,
  routineDiff,
  updateBlocked,
  withChip,
  type RoutineAiBriefForm,
  type RoutineAiFailure,
} from "@/lib/routineAi";
import {
  discardRoutineAiAction,
  keepRoutineAiAction,
  readRoutineAiAction,
  startRoutineAiAction,
  type RoutineAiActionFailure,
} from "@/lib/routineAiActions";
import type {
  CoachRoutineAiProposalRequest,
  CoachRoutineAiProposalResponse,
  CoachRoutineDraftResponse,
  Routine,
} from "@/lib/coachApi";

/**
 * EV-186b — « Régénérer avec l'IA » on the routine page: the brief, the running state, the
 * refusal and failure sentences, and « Écarter ». Rendered ONLY when the routine read's
 * `aiProposals.routine` is literally true (`routineAiCapability`, decided by the page): with it
 * false, absent or malformed the panel does not RENDER and the page makes no AI read (B1). Its
 * module is loaded with `next/dynamic` by `RoutineEditor` only when the capability is true, so the
 * flag-off page's first-load JS does not carry it (staff S-1, measured on `next build`).
 *
 * The work is server-side (ADR-0036 D36.2): « Générer » answers 202 and the panel POLLS the
 * api's GET. A coach who leaves and comes back gets the same proposal, because the page reads
 * it on the server and seeds `initial` from it (B3).
 *
 * EV-186n: a READY proposal is the per-day comparison (`RoutineAiDiff`) with the api's repair
 * marks; « Garder » keeps it into the coach's DRAFT (never a plan: nothing is published) and the
 * editor re-seeds from the kept draft (`onKept`). A Keep refused because the draft or the plan
 * moved (409 COACH_DRAFT_EXISTS / COACH_PROPOSAL_STALE), and an EXPIRED proposal, show their
 * sentence with « Réessayer », which starts a new Regenerate with the same brief (N4).
 *
 * EV-186f: « Modifier avec l'IA » opens the request box (a REVISE) beside « Régénérer avec
 * l'IA », only when the read's `aiProposals.instruction` is true AND the trainee has a draft or
 * a published routine to change (`canUpdate`, U6). The box has the table's label, placeholder,
 * counter and pain hint, and the four chips, which only pre-fill words (U1). Nothing typed is
 * refused here — no pain word, no length truncation (U2, U4): the api is the judge. A REVISE that
 * applied nothing fails with COACH_AI_NOTHING_APPLIED and the box comes back with the coach's
 * text in it (U5); a READY one that dropped some ops says how many above the comparison (U3).
 * The text lives in this island's state only: never stored, here or by the api (Ruling 6).
 */

type ProposalKind = "REGENERATE" | "REVISE";

type View =
  | { kind: "idle" }
  | { kind: "brief" }
  /** EV-186f — the Update request box. */
  | { kind: "update" }
  | { kind: "running"; proposalId: string | null; startedAt: number; proposalKind: ProposalKind }
  | { kind: "ready"; proposal: CoachRoutineAiProposalResponse }
  | { kind: "failed"; code: string; proposalId: string | null; proposalKind: ProposalKind }
  /** N4 — Keep was refused because something moved, or the proposal expired. */
  | { kind: "stale"; code: string; proposalId: string | null; proposalKind: ProposalKind };

const FAILED_RESULT: { ok: false; failure: RoutineAiActionFailure } = { ok: false, failure: { code: "FAILED" } };

/** What the page read, turned into the panel's first view. A failed read starts idle and reads again. */
function viewOf(proposal: CoachRoutineAiProposalResponse | null, now: number): View {
  const proposalId = proposal?.proposalId ?? null;
  const proposalKind = kindOf(proposal);
  switch (proposal?.status) {
    case "RUNNING": {
      const created = proposal.createdAt ? Date.parse(proposal.createdAt) : NaN;
      return { kind: "running", proposalId, startedAt: Number.isNaN(created) ? now : created, proposalKind };
    }
    case "READY":
      return proposal.proposal
        ? { kind: "ready", proposal }
        : { kind: "failed", code: "FAILED", proposalId, proposalKind };
    case "FAILED":
      return { kind: "failed", code: proposal.errorCode ?? "FAILED", proposalId, proposalKind };
    // Edge case 6: past `expiresAt` (24 h) it reads EXPIRED, and Keep would be STALE.
    case "EXPIRED":
      return { kind: "stale", code: "COACH_PROPOSAL_STALE", proposalId, proposalKind };
    default:
      return { kind: "idle" };
  }
}

/** The proposal's kind as the api served it; absent or unknown reads as a Regenerate (186b's only kind). */
function kindOf(proposal: { kind?: string | null } | null | undefined): ProposalKind {
  return proposal?.kind === "REVISE" ? "REVISE" : "REGENERATE";
}

/** The kind and id of what the panel is showing, for a discard and its log line. */
function shownProposal(view: View): { proposalKind: ProposalKind; proposalId: string | null } {
  switch (view.kind) {
    case "ready":
      return { proposalKind: kindOf(view.proposal), proposalId: view.proposal.proposalId ?? null };
    case "running":
    case "failed":
    case "stale":
      return { proposalKind: view.proposalKind, proposalId: view.proposalId };
    default:
      return { proposalKind: "REGENERATE", proposalId: null };
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
  traineeName,
  hasDraft,
  dirty,
  canUpdate = false,
  onKept,
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
  /** The full display name, for the replace confirm (`templates.replacesDraft`). */
  traineeName: string;
  /** A draft exists on the server: Keep replaces it, so it asks first (EV-186 AC2's confirm). */
  hasDraft: boolean;
  /** The editor holds unsaved edits: Keep replaces them too, so it asks first. */
  dirty: boolean;
  /**
   * EV-186f — « Modifier avec l'IA » is offered: `aiProposals.instruction` is true AND there is a
   * saved draft or a published routine for the api to change (U6). False draws exactly 186n's panel.
   */
  canUpdate?: boolean;
  /** Keep landed: the editor takes the kept draft (and its token) from this response. */
  onKept: (draft: CoachRoutineDraftResponse) => void;
}) {
  const copy = useCopy();
  const t = copy.routineAi;
  const router = useRouter();
  const titleId = useId();
  const notesId = useId();
  const counterId = useId();
  const requestId = useId();
  const requestCounterId = useId();
  const painHintId = useId();
  const requestRef = useRef<HTMLTextAreaElement>(null);
  const [view, setView] = useState<View>(() => viewOf(initial, Date.now()));
  const [form, setForm] = useState<RoutineAiBriefForm>(() => initialBriefForm(document));
  /**
   * The refusal sentence for the last press, shown in the panel until the next one. A 429's notice
   * names the kind it holds (`heldKind`) and is withdrawn when that hold lifts, so a sentence never
   * says « try again tomorrow » beside an enabled « Générer ».
   */
  const [notice, setNotice] = useState<{ text: string; heldKind?: ProposalKind } | null>(null);
  /**
   * A spent quota holds « Générer » until the api's Retry-After (the next midnight).
   * Per KIND (staff B1 on EV-186f): the api keeps separate counters — 3 regenerations and 10
   * edits per trainee, 30 and 100 per coach — so a spent EDIT quota must never hold « Générer » on
   * the Regenerate brief, nor the reverse. The hold keeps the refusal it came from, so the form of
   * that kind can say WHY its « Générer » is disabled every time it is opened (BUG-865/866: opening
   * a form cleared the notice while the hold stayed, leaving a disabled button with no reason).
   */
  const [held, setHeld] = useState<Partial<Record<ProposalKind, { until: number; failure: RoutineAiFailure }>>>({});
  const [hidden, setHidden] = useState(false);
  /** The body of the last run this panel started, for N4's « Réessayer » (kept for the session only). */
  const [lastBrief, setLastBrief] = useState<CoachRoutineAiProposalRequest | null>(null);
  /**
   * EV-186f — the Update box's text. Island state only, for the session (never stored): it
   * survives a refusal and a FAILED run, so the coach can rephrase (U5).
   */
  const [request, setRequest] = useState("");
  const [confirmKeep, setConfirmKeep] = useState(false);
  const [pending, startTransition] = useTransition();
  const mounted = useRef(true);
  /**
   * False until this island has hydrated. The editor loads the panel with `next/dynamic` (SSR on),
   * so its server HTML is on screen before its chunk arrives, and a click there is lost or replayed
   * late (measured: the open button stayed `idle` after a click in `next dev`). Every control the
   * server can draw is therefore DISABLED until hydration: no dead click, and the coach sees it.
   */
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    mounted.current = true;
    setHydrated(true);
    return () => {
      mounted.current = false;
    };
  }, []);

  /** A 403: the link ended. The next server render redirects to the denial page. */
  function accessEnded() {
    router.refresh();
  }

  function refused(failure: RoutineAiActionFailure, kind: ProposalKind = "REGENERATE"): void {
    if (failure.code === "ACCESS_DENIED") return accessEnded();
    const f: RoutineAiFailure = { ...(failure as RoutineAiFailure), kind };
    const until = heldUntil(f, Date.now());
    setNotice({ text: routineAiSentence(f, firstName, copy), ...(until !== null ? { heldKind: kind } : {}) });
    if (until !== null) setHeld((h) => ({ ...h, [kind]: { until, failure: f } }));
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

  // The hold lifts by itself at the instant the api named, and takes its sentence with it.
  useEffect(() => {
    const next = Math.min(...Object.values(held).map((h) => h.until));
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      setHeld((h) => Object.fromEntries(Object.entries(h).filter(([, at]) => at.until > now)));
      setNotice((n) => (n?.heldKind && (held[n.heldKind]?.until ?? 0) <= now ? null : n));
    }, Math.max(0, next - Date.now()));
    return () => clearTimeout(timer);
  }, [held]);

  function generate(given?: CoachRoutineAiProposalRequest) {
    const body = given ?? briefRequest(form);
    if (!body) return;
    setNotice(null);
    startTransition(async () => {
      const result = await settled(startRoutineAiAction(clientId, body), FAILED_RESULT);
      if (!mounted.current) return;
      if (result.ok) {
        setLastBrief(body);
        setView({ kind: "running", proposalId: result.proposalId, startedAt: Date.now(), proposalKind: body.kind });
        return;
      }
      refused(result.failure, body.kind);
      // 409 COACH_AI_PROPOSAL_RUNNING: say so, then wait on the run that is already going.
      if (result.failure.code === "COACH_AI_PROPOSAL_RUNNING") {
        const read = await settled(readRoutineAiAction(clientId), FAILED_RESULT);
        if (read.ok && mounted.current) adopt(read.proposal);
      }
    });
  }

  /** EV-186f — « Générer » from the request box: a REVISE with the text as typed. */
  function update() {
    const body = reviseRequest(request, t.chips);
    if (body) generate(body);
  }

  /** U1 — a chip press pre-fills its words in the box; it never sends anything. */
  function pressChip(label: string) {
    setRequest((text) => withChip(text, label));
    requestRef.current?.focus();
  }

  /**
   * N4: a new run with the same body (a Regenerate's brief, or an Update's request); without one in
   * this session, the form it came from.
   */
  function retry() {
    setNotice(null);
    if (lastBrief) return generate(lastBrief);
    // A failed Update whose box is no longer offered (no saved base, or the capability went off)
    // opens the Regenerate brief instead: the one AI action still available (staff nit, EV-186f).
    setView({ kind: shownProposal(view).proposalKind === "REVISE" && canUpdate ? "update" : "brief" });
  }

  function keep() {
    if (view.kind !== "ready") return;
    if (hasDraft || dirty) return setConfirmKeep(true);
    doKeep();
  }

  function doKeep() {
    if (view.kind !== "ready" || !view.proposal.proposalId) return;
    const proposalId = view.proposal.proposalId;
    const kind = kindOf(view.proposal);
    setNotice(null);
    startTransition(async () => {
      const result = await settled(keepRoutineAiAction(clientId, proposalId), FAILED_RESULT);
      if (!mounted.current) return;
      setConfirmKeep(false);
      if (!result.ok) {
        const code = result.failure.code;
        if (code === "ACCESS_DENIED") return accessEnded();
        if (code === "NOT_FOUND") return setHidden(true);
        if (code === "COACH_DRAFT_EXISTS" || code === "COACH_PROPOSAL_STALE") {
          return setView({ kind: "stale", code, proposalId, proposalKind: kind });
        }
        return refused(result.failure, kind);
      }
      logPortalEvent({ event: "coach_ai_proposal_kept", kind });
      setView({ kind: "idle" });
      setRequest("");
      onKept(result.draft);
    });
  }

  function discard() {
    // EV-376: the DELETE names the proposal on screen, so a run another tab started is left alone.
    const { proposalKind: kind, proposalId } = shownProposal(view);
    setNotice(null);
    startTransition(async () => {
      const result = await settled(discardRoutineAiAction(clientId, proposalId), FAILED_RESULT);
      if (!mounted.current) return;
      if (!result.ok) {
        if (result.failure.code === "NOT_FOUND") return setHidden(true);
        return refused(result.failure, kind);
      }
      logPortalEvent({ event: "coach_ai_proposal_discarded", kind });
      setView({ kind: "idle" });
    });
  }

  if (hidden) return null;

  const blocked = briefBlocked(form);
  const isHeld = (kind: ProposalKind) => (held[kind]?.until ?? 0) > Date.now();
  /** The kind whose « Générer » is on screen: the brief, the Update box, or a FAILED Update's box. */
  const formKind: ProposalKind | null =
    view.kind === "brief"
      ? "REGENERATE"
      : view.kind === "update" || (view.kind === "failed" && view.proposalKind === "REVISE" && canUpdate)
        ? "REVISE"
        : null;
  const formHold = formKind !== null && isHeld(formKind) ? held[formKind] : undefined;
  /** BUG-865/866: a held form always shows its kind's 429 sentence, re-derived from the hold. */
  const heldSentence = formHold ? routineAiSentence(formHold.failure, firstName, copy) : null;
  const pressNotice = notice && (notice.heldKind === undefined || isHeld(notice.heldKind)) ? notice.text : null;
  const shownNotice = pressNotice ?? heldSentence;
  /** Another refusal (e.g. a discard's) on a held form: both sentences, the hold's second. */
  const extraHeldSentence = pressNotice !== null && heldSentence !== null && heldSentence !== pressNotice ? heldSentence : null;
  const count = notesLength(form.notes);
  const requestCount = notesLength(request);
  const pressedChips = chipsIn(request, t.chips);
  /** The flow on screen, for the heading: an Update's views are titled « Modifier avec l'IA ». */
  const flow: ProposalKind = view.kind === "update" ? "REVISE" : shownProposal(view).proposalKind;
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

  /**
   * EV-186f — the request box: the table's label, placeholder and counter, the pain hint, the four
   * chips, « Générer ». `fresh` is the plain Update view (« Annuler » goes back to the buttons);
   * after a FAILED Update it is drawn with the coach's text and « Écarter » clears the run (U5).
   */
  function updateForm(fresh: boolean) {
    const sendBlocked = updateBlocked(request);
    return (
      <form
        data-testid="routine-ai-update"
        onSubmit={(e) => {
          e.preventDefault();
          update();
        }}
        style={{ display: "grid", gap: 10, marginTop: 4 }}
      >
        <div>
          <label htmlFor={requestId} style={labelStyle}>
            {t.requestLabel}
          </label>
          <textarea
            id={requestId}
            ref={requestRef}
            value={request}
            placeholder={t.requestPlaceholder}
            // Staff S1: a FAILED Update read on load server-draws this box; like its siblings it is
            // inert until hydration, so nothing typed before then is wiped by the controlled value.
            disabled={!hydrated}
            aria-describedby={`${requestCounterId} ${painHintId}`}
            onChange={(e) => setRequest(e.target.value)}
            rows={3}
            style={{ ...fieldStyle, maxWidth: 560, padding: "8px 12px", resize: "vertical" }}
          />
          {/* U2: counted as the api counts (NFC code points); over 500 it says so, nothing is cut. */}
          <p
            id={requestCounterId}
            data-testid="routine-ai-update-counter"
            style={{
              margin: "4px 0 0",
              fontSize: 12.5,
              color: requestCount > ROUTINE_AI_INSTRUCTION_MAX ? "var(--err-ink)" : "var(--ink-3)",
            }}
          >
            {t.counter(requestCount)}
          </p>
          {/* D36.6 item 5 / P7: no pain word is refused; the hint says where injuries come from. */}
          <p id={painHintId} data-testid="routine-ai-pain-hint" style={{ ...noteStyle, marginTop: 4 }}>
            {t.painHint(firstName)}
          </p>
          {/* U8: the api revises the SAVED base; unsaved edits never travel, and the coach is told so. */}
          {dirty && (
            <p data-testid="routine-ai-unsaved-note" style={{ ...noteStyle, marginTop: 4, color: "var(--warn-ink)" }}>
              {t.unsavedNote}
            </p>
          )}
        </div>
        {/* U1/U1a: content chips — each pre-fills its words (not a toggle, so no aria-pressed); drawn
            "soft" while those words are in the box, which is when the chip travels in `chips`. */}
        <div data-testid="routine-ai-chips" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ROUTINE_AI_CHIPS.map((chip) => (
            <Button
              key={chip}
              size="sm"
              variant={pressedChips.includes(chip) ? "soft" : "secondary"}
              disabled={!hydrated}
              onClick={() => pressChip(t.chips[chip])}
            >
              {t.chips[chip]}
            </Button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button type="submit" icon="star" disabled={sendBlocked !== null || isHeld("REVISE") || pending || !hydrated}>
            {t.submit}
          </Button>
          {fresh ? (
            <Button variant="ghost" onClick={() => setView({ kind: "idle" })} disabled={pending || !hydrated}>
              {t.cancel}
            </Button>
          ) : (
            <Button variant="secondary" onClick={discard} disabled={pending || !hydrated}>
              {t.discard}
            </Button>
          )}
        </div>
      </form>
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      className="routine-ai"
      data-testid="routine-ai-panel"
      data-ai-state={view.kind}
      // The id of the proposal on screen (none while idle or composing), so a spec can compare
      // the DELETE's `proposalId` with exactly this one (EV-186f U9a / EV-377 AC1).
      data-proposal-id={shownProposal(view).proposalId ?? undefined}
    >
      <Card style={{ marginBottom: 16 }}>
        {view.kind === "idle" ? (
          <>
            {/* Closed: the one control. Its words name the region too. */}
            <h3 id={titleId} className="sr-only">
              {t.title}
            </h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button
                icon="star"
                variant="soft"
                disabled={!hydrated}
                onClick={() => {
                  setNotice(null);
                  setView({ kind: "brief" });
                }}
              >
                {t.open}
              </Button>
              {/* EV-186f U1/U6: only with the capability AND a draft or published routine to change. */}
              {canUpdate && (
                <Button
                  icon="edit"
                  variant="soft"
                  disabled={!hydrated}
                  onClick={() => {
                    setNotice(null);
                    setView({ kind: "update" });
                  }}
                >
                  {t.updateOpen}
                </Button>
              )}
            </div>
          </>
        ) : (
          <h3 id={titleId} style={{ margin: "0 0 10px", fontSize: 15.5, fontWeight: 600, color: "var(--ink)" }}>
            {flow === "REVISE" ? t.updateTitle : t.title}
          </h3>
        )}

        {shownNotice && (
          <p role="alert" data-testid="routine-ai-notice" style={{ ...noteStyle, color: "var(--err-ink)" }}>
            {shownNotice}
          </p>
        )}
        {extraHeldSentence && (
          <p data-testid="routine-ai-held-notice" style={{ ...noteStyle, color: "var(--err-ink)" }}>
            {extraHeldSentence}
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
              <Button type="submit" icon="star" disabled={blocked !== null || isHeld("REGENERATE") || pending || !hydrated}>
                {t.submit}
              </Button>
              <Button variant="ghost" onClick={() => setView({ kind: "idle" })} disabled={pending || !hydrated}>
                {t.cancel}
              </Button>
            </div>
          </form>
        )}

        {view.kind === "update" && updateForm(true)}

        {view.kind === "running" && (
          <>
            <p role="status" style={noteStyle}>
              {t.running(firstName)}
            </p>
            <div style={{ marginTop: 10 }}>
              <Button variant="secondary" onClick={discard} disabled={pending || !hydrated}>
                {t.discard}
              </Button>
            </div>
          </>
        )}

        {view.kind === "failed" && view.proposalKind === "REVISE" && canUpdate && (
          <>
            {/* U5: the code's sentence, then the box again with the coach's text, to rephrase. */}
            <p role="alert" data-testid="routine-ai-failed" style={{ ...noteStyle, color: "var(--err-ink)" }}>
              {routineAiSentence({ code: view.code, kind: "REVISE" }, firstName, copy)}
            </p>
            {updateForm(false)}
          </>
        )}

        {view.kind === "failed" && !(view.proposalKind === "REVISE" && canUpdate) && (
          <>
            <p role="alert" data-testid="routine-ai-failed" style={{ ...noteStyle, color: "var(--err-ink)" }}>
              {routineAiSentence({ code: view.code, kind: view.proposalKind }, firstName, copy)}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <Button onClick={retry} disabled={pending || !hydrated}>
                {t.retry}
              </Button>
              <Button variant="secondary" onClick={discard} disabled={pending || !hydrated}>
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
            {/* U3: the reviser's ops that were not applied, counted from `outcome`, above the comparison. */}
            {opsRejectedCount(view.proposal) > 0 && (
              <p
                role="note"
                data-testid="routine-ai-ops-rejected"
                style={{ ...noteStyle, margin: "0 0 10px", color: "var(--warn-ink)" }}
              >
                {t.opsNotApplied(opsRejectedCount(view.proposal))}
              </p>
            )}
            <RoutineAiDiff
              diff={routineDiff(view.proposal.baseDocument ?? null, view.proposal.proposal)}
              marks={Array.isArray(view.proposal.repairMarks) ? view.proposal.repairMarks : []}
              baseSource={view.proposal.baseSource}
              firstName={firstName}
            />
            <p style={{ ...noteStyle, color: "var(--ink-3)" }}>{t.keepHint}</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <Button icon="check" onClick={keep} disabled={pending || !hydrated}>
                {t.keep}
              </Button>
              <Button variant="secondary" onClick={discard} disabled={pending || !hydrated}>
                {t.discard}
              </Button>
            </div>
          </>
        )}

        {view.kind === "stale" && (
          <>
            <p role="alert" style={{ ...noteStyle, color: "var(--err-ink)" }}>
              {routineAiSentence({ code: view.code, kind: view.proposalKind }, firstName, copy)}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <Button onClick={retry} disabled={pending || !hydrated}>
                {t.retry}
              </Button>
              <Button variant="secondary" onClick={discard} disabled={pending || !hydrated}>
                {t.discard}
              </Button>
            </div>
          </>
        )}
      </Card>
      {/* EV-186 AC2's confirm, at the moment the draft is actually replaced (Keep). */}
      <Modal
        dirty={false}
        open={confirmKeep}
        onClose={() => !pending && setConfirmKeep(false)}
        title={t.keepConfirmTitle}
        icon="alert"
        iconTone="amber"
        width={440}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmKeep(false)} disabled={pending || !hydrated}>
              {t.cancel}
            </Button>
            <Button onClick={doKeep} disabled={pending || !hydrated}>
              {t.keep}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{copy.templates.replacesDraft(traineeName)}</p>
      </Modal>
    </section>
  );
}
