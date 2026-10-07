"use client";

import { useEffect, useId, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, EmptyState, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/StatusPill";
import { StickyActionBar } from "@/components/ui/StickyActionBar";
import { RoutineDocumentEditor, initialOpenDays } from "./RoutineDocumentEditor";
import { useCopy } from "@/lib/i18n/client";
import { settled } from "@/lib/settled";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import {
  blankRoutine,
  documentReasons,
  editableDocument,
  forDraftSave,
  withServerFields,
} from "@/lib/routineDocument";
import { failureSentence, type RoutineFailure, type RoutineWrite } from "@/lib/routineFailure";
import {
  discardDraftAction,
  previewPublishAction,
  publishAction,
  reloadRoutineAction,
  saveDraftAction,
} from "@/lib/routineActions";
import type { CoachRoutineDraftResponse, PublishPreview, Routine } from "@/lib/coachApi";
import { useAdoptPrehydrationInput } from "@/lib/useAdoptPrehydrationInput";

/**
 * EV-184b's editor for a TRAINEE's plan: the working copy, the draft write path and the
 * two-phase publish. Since BUG-195c it is a shell around `RoutineDocumentEditor` — the
 * one editor both coach surfaces share (AC3.3) — and it owns only what is the draft's:
 *
 *   · **The whole document.** The working copy is the api's `Routine`, field for field,
 *     and `forDraftSave` turns it into the request in one place. Nothing a coach cannot
 *     see is invented, and nothing they did not change is dropped: a plan's `tempo`,
 *     `notes`, `trackingType`, `durationSeconds`, `weight` and `estimatedMinutes` now
 *     survive a save (AC3.2), where the old projection deleted them.
 *   · **The token** (ADR-0018 D6). Every save echoes the `updatedAt` of the draft this
 *     editor last read or wrote, verbatim; null means "only if there is no draft". A
 *     draft somebody else saved in between — another tab, another device, a template
 *     apply — is a `409 COACH_DRAFT_EXISTS`, and NOTHING is written. The editor then
 *     asks (AC3.6): keep editing, load the version that was saved, or replace it — the
 *     last with the same sentence and control template apply uses, and only on a press.
 *     There is no path from here that overwrites a draft the coach has not been told
 *     about.
 *   · **The server's fields.** `goal` and `level` are the trainee's, resolved by the api
 *     on every save and shown read-only; their equipment and injuries are sent `[]` and
 *     shown by the page, never by this component. A save's response is laid over the
 *     working copy for exactly those fields (`withServerFields`), so what the coach sees
 *     is what was stored — without re-seeding over anything typed during the round trip.
 *
 * Publish is never a single press: `previewPublishAction` saves (with the token) and
 * returns the repairs, and `publishAction` echoes the digest the coach was shown.
 *
 * EV-337f1 (the programme frame) moved where things are DRAWN, and nothing about how they
 * behave: Save draft, Discard draft and Publish live in one `StickyActionBar` named
 * « Actions du programme » (the only three on the page), the save/publish notice and the
 * error sit in that bar so they are in sight wherever the coach is in the plan, and the
 * page's aside (the trainee's profile, « Enregistrer comme modèle ») arrives as `aside`
 * so the editor and its bar can share one two-column frame. Token, `dirty`, `revision`
 * and the `loads` remount are untouched.
 */

/** The live plan, already made editable by the page (`editableDocument`). */
export interface PublishedRoutine {
  /** A new `plans` row per publish — the identity the re-seed keys on. */
  planId: string | null;
  document: Routine;
}

/** The saved draft and the token it was read at. */
export interface SavedRoutineDraft {
  document: Routine;
  updatedAt: string;
}

/** The 409's two facts: what to echo if the coach confirms, and which press it answered. */
interface Conflict {
  existingUpdatedAt: string | null;
  intent: RoutineWrite;
}

const FAILED: { ok: false; failure: RoutineFailure } = { ok: false, failure: { code: "FAILED" } };

export function RoutineEditor({
  clientId,
  traineeName,
  activePlan,
  initialDraft,
  sourceTemplateName = null,
  unbindableExercises = [],
  profile = null,
  aside = null,
  lead = null,
}: {
  clientId: string;
  /** For the conflict dialog's overwrite sentence, which names whose draft it replaces. */
  traineeName: string;
  activePlan: PublishedRoutine | null;
  initialDraft: SavedRoutineDraft | null;
  /** EV-188 AC3 — "Started from {name}"; null for a hand-built draft or a deleted template. */
  sourceTemplateName?: string | null;
  /**
   * EV-188 AC5 — exercise names the catalogue would not match today, re-derived by the
   * api on every open and NEVER stored. Marked in place; nothing is removed on it.
   */
  unbindableExercises?: string[];
  /**
   * EV-342f — the trainee's profile (`ProfileLine` around the card), server-rendered and
   * passed through untouched: one line ABOVE the editor below 1280 px, the card at the top
   * of the second column from 1280 px (`.prog-split`). Null draws none.
   */
  profile?: ReactNode;
  /**
   * EV-337f1 — the page's aside (« Enregistrer comme modèle » since EV-342f moved the profile
   * to `profile`), server-rendered and passed through untouched. AFTER the editor below
   * 1280 px (EV-342f), under the profile in the second column from 1280 px. Null draws no aside.
   */
  aside?: ReactNode;
  /**
   * EV-337f1 — everything the page draws above the frame (the client header, the tab's
   * `h2`, the trainee-changed banner), server-rendered and passed through. It is inside the
   * editor's root ONLY so that the sticky action bar's containing block starts at the top
   * of the page: a sticky box never rises above its parent's top. With the header, the
   * `h2` and the banner outside, a 320 × 568 phone left « Publier » under the tab bar on
   * load (measured on Yusuf, whose banner put the editor's first card at y ≈ 402: the bar
   * could not climb past it). `qa/pro-programme-frame.spec.ts` F1.1 goes red on that.
   */
  lead?: ReactNode;
}) {
  const copy = useCopy();
  const publishHintId = useId();
  const router = useRouter();
  const [document, setDocument] = useState<Routine | null>(
    initialDraft?.document ?? activePlan?.document ?? null
  );
  /**
   * The staleness token, in a REF: it is read inside async transitions (a publish that
   * re-previews after a 409 must echo the token its own first half just produced, not
   * the one captured when the button was pressed) and it renders nothing.
   *
   * It starts from the draft the page READ — never from `GET …/routine`'s
   * `draftUpdatedAt` alone. If the envelope says a draft exists but its document could
   * not be read, the page opens the published plan, and echoing the envelope's token
   * would let a save overwrite a draft this coach has never seen. Null there makes that
   * save a 409, and the coach is asked.
   */
  const token = useRef<string | null>(initialDraft?.updatedAt ?? null);
  /** False only for a from-scratch plan that has never been saved (goal/level not resolved yet). */
  const [resolved, setResolved] = useState(true);
  /** True from the moment a draft exists on the server OR the coach edits anything. */
  const [isDraft, setIsDraft] = useState(initialDraft !== null);
  /**
   * EV-190 AC2's flag — "not on the server", and deliberately NOT `isDraft` (a saved
   * draft with no edits has nothing outstanding). Set by `edit`, cleared only by a
   * write that landed AND that nothing was typed after (`revision`).
   */
  const [dirty, setDirty] = useState(false);
  /** Bumped by every edit; a save clears `dirty` only if no edit happened in flight. */
  const revision = useRef(0);
  // BUG-686 follow-up: what was typed into the server HTML before hydration reaches state.
  const scope = useAdoptPrehydrationInput<HTMLDivElement>();
  const [preview, setPreview] = useState<PublishPreview | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const leaving = useUnsavedChanges(dirty);
  /**
   * Bumped whenever the document is REPLACED by one from the server rather than edited:
   * « Load the saved version », Discard, and the re-seed after a publish. It is the `key`
   * of `RoutineDocumentEditor`, so a replaced document remounts every row.
   *
   * Why (BUG-490, staff witness E): an `ExerciseRow` keeps the seconds it held when its
   * exercise was switched to Weight & reps, and rows are keyed by name + position. A
   * document from elsewhere can put ANOTHER exercise of the same name in that position —
   * another tab removed day 2, so day 3's Plank takes day 2's card and index — and the row
   * stayed mounted and offered day 2's seconds to day 3's Plank. Nothing in the editor can
   * tell whether the exercise under a row is still the one it stashed for, so a replaced
   * document drops every stash. It also drops the session's catalog badges and an open
   * picker, which is what a reload does too.
   */
  const [loads, setLoads] = useState(0);
  const replaced = () => setLoads((n) => n + 1);
  /**
   * EV-337f2 — which training days are open. Held HERE, not in the keyed editor, so the
   * remount above drops stashes and badges but not the coach's place: a publish from day 6
   * (the re-seed) or « Load the saved version » leaves the days open that were open.
   * Positional, as the cards are. The rule on load is `initialOpenDays` (F2.2).
   *
   * Computed ONCE, from the initial document and its unbindable exercises. After a re-seed,
   * a day that newly holds an unbindable exercise stays as the coach left it (closed, if it
   * was): F2.2's exception applies "on load", and a re-seed is not a load.
   */
  const [openDays, setOpenDays] = useState<boolean[]>(() =>
    initialOpenDays(
      initialDraft?.document ?? activePlan?.document ?? null,
      new Set(unbindableExercises.map((name) => name.toLowerCase()))
    )
  );

  /*
   * U6 — the notice and the error are where the coach is looking. They used to render in
   * the TOP card and the page scrolled them into view, which took the coach away from the
   * day they were editing. Since EV-337f1 they render in the sticky action bar, which is on
   * screen wherever the coach is in the plan (F1.3), so nothing scrolls.
   */

  /**
   * Re-seed the working copy when the SERVER's published plan changes identity — a
   * publish writes a new `plans` row, and the coach must see the REPAIRED plan the
   * trainee received (EV-184 AC3), not the draft they submitted. Keyed on `planId` so an
   * ordinary save, which re-renders through its action, does not blow away the cursor
   * mid-edit.
   */
  const publishedPlanId = activePlan?.planId ?? null;
  const lastPublishedPlanId = useRef(publishedPlanId);
  useEffect(() => {
    if (lastPublishedPlanId.current === publishedPlanId) return;
    lastPublishedPlanId.current = publishedPlanId;
    setDocument(initialDraft?.document ?? activePlan?.document ?? null);
    replaced();
    token.current = initialDraft?.updatedAt ?? null;
    setIsDraft(initialDraft !== null);
    setResolved(true);
    setDirty(false);
  }, [publishedPlanId, activePlan, initialDraft]);

  function edit(next: Routine) {
    revision.current += 1;
    setDocument(next);
    setIsDraft(true);
    setDirty(true);
    setNotice(null);
    setError(null);
  }

  /** A write that landed: take the token and the server's own fields from it. */
  function applySaved(saved: CoachRoutineDraftResponse, sentRevision: number) {
    token.current = saved.updatedAt ?? token.current;
    setDocument((current) => (current ? withServerFields(current, saved.document) : current));
    setResolved(true);
    setIsDraft(true);
    if (revision.current === sentRevision) setDirty(false);
  }

  /**
   * A write answered 403: the trainee revoked the link mid-session (ADR-0012 AC6).
   * `router.refresh()` makes the next request, whose layout read 403s and redirects to
   * /clients/denied. The guard's flag and history entry go FIRST (EV-190 edge case 4).
   */
  function accessEnded(): void {
    setDirty(false);
    setPreview(null);
    setConflict(null);
    leaving.release(() => router.refresh());
  }

  /** Every refusal of every write lands here, so none of them can be handled two ways. */
  function refused(failure: RoutineFailure, write: RoutineWrite, sent: Routine) {
    if (failure.code === "ACCESS_DENIED") return accessEnded();
    if (failure.code === "DRAFT_EXISTS") {
      setPreview(null);
      setError(null);
      setConflict({ existingUpdatedAt: failure.existingUpdatedAt, intent: write });
      return;
    }
    setError(failureSentence(failure, write, sent, copy));
  }

  /**
   * After a write that landed: hand the history back when nothing is outstanding.
   *
   * No `router.refresh()` (ADR-0033 branch 2a). `saveDraftAction` calls
   * `revalidatePath`, so its response already carries this page rendered after the
   * write: the router installs that render and clears its cache before the `await`
   * above returns, and the page's content streams in behind the result (measured: the
   * notice paints ~120 ms in, the render lands ~290 ms in, at a 60 ms fixture hold). A
   * refresh rendered the page a second time: every read twice per Save draft. The new
   * props re-seed nothing here (the re-seed is keyed on the published `planId`, which a
   * save does not change), exactly as with the refresh.
   */
  function afterWrite(sentRevision: number) {
    if (revision.current === sentRevision) leaving.release();
  }

  const reasons = document
    ? documentReasons(document, copy, { dayCountBound: copy.routine.dayCountBound })
    : [];
  const writable = document !== null && reasons.length === 0;

  function saveDraft(echo: string | null = token.current) {
    if (!document || !writable) return;
    const sent = revision.current;
    const body = forDraftSave(document, echo);
    startTransition(async () => {
      // A server action whose request fails resolves `undefined` rather than rejecting;
      // `settled` turns both into a value, so a failed save can never take the editor
      // down with it (EV-190 AC2).
      const result = await settled(saveDraftAction(clientId, body), FAILED);
      if (!result.ok) return refused(result.failure, "save", body.document);
      applySaved(result.draft, sent);
      setConflict(null);
      setError(null);
      setNotice(copy.routine.savedAt(new Date().toLocaleTimeString()));
      afterWrite(sent);
    });
  }

  function openPublish(echo: string | null = token.current) {
    if (!document || !writable) return;
    const sent = revision.current;
    const body = forDraftSave(document, echo);
    startTransition(async () => {
      const result = await settled(previewPublishAction(clientId, body), { ...FAILED, saved: null });
      if (!result.ok) {
        // If the save half landed, the work is on the server: the token moves and the
        // unsaved warning drops, whatever went wrong with the preview after it.
        if (result.saved) applySaved(result.saved, sent);
        return refused(result.failure, "publish", body.document);
      }
      applySaved(result.draft, sent);
      setConflict(null);
      setError(null);
      setPreview(result.preview);
    });
  }

  function discard() {
    startTransition(async () => {
      const result = await settled(discardDraftAction(clientId), FAILED);
      if (!result.ok) {
        if (result.failure.code === "ACCESS_DENIED") return accessEnded();
        setError(copy.routine.discardFailed);
        return;
      }
      // AC2: "returns the page to the published plan exactly" — from the server's copy.
      setDiscarding(false);
      setDocument(activePlan?.document ?? null);
      replaced();
      token.current = null;
      setIsDraft(false);
      setResolved(true);
      setDirty(false);
      setNotice(null);
      setError(null);
      // No refresh: `discardDraftAction` revalidates, so its response carried the page.
      leaving.release();
    });
  }

  /**
   * AC3's confirm, and ADR-0015 D4's 409. `COACH_PUBLISH_REPAIRS_UNACKNOWLEDGED` means
   * the draft moved between the preview and this click, so the ONLY correct answer is to
   * preview again — which saves first, WITH the token, so a draft another tab changed is
   * a `COACH_DRAFT_EXISTS` and the coach is asked, never overwritten.
   */
  function confirmPublish() {
    if (!preview || !document) return;
    const digest = preview.digest;
    const current = document;
    startTransition(async () => {
      const result = await settled(publishAction(clientId, digest), FAILED);
      if (!result.ok) {
        if (result.failure.code === "REPAIRS_UNACKNOWLEDGED") {
          const sent = revision.current;
          const body = forDraftSave(current, token.current);
          const again = await settled(previewPublishAction(clientId, body), { ...FAILED, saved: null });
          if (again.ok) {
            applySaved(again.draft, sent);
            setPreview(again.preview);
            setError(null);
            return;
          }
          if (again.saved) applySaved(again.saved, sent);
          setPreview(null);
          return refused(again.failure, "publish", body.document);
        }
        setPreview(null);
        return refused(result.failure, "publish", current);
      }
      setPreview(null);
      token.current = null; // publish deletes the draft row
      setIsDraft(false);
      setDirty(false);
      setNotice(copy.routine.published);
      setError(null);
      /**
       * No refresh (ADR-0033 branch 2a, D33.9). `publishAction` revalidates, so its
       * response carries the page rendered AFTER the publish: the new `planId`, the
       * REPAIRED plan as `activePlan` and no draft. It streams in behind this
       * continuation (as the refresh's did, only sooner), and when it lands the
       * `planId` effect above re-seeds the working copy from it (EV-184 AC3), remounts
       * the rows (`replaced`) and resets the token to the absent draft's null — the
       * same values this continuation sets, so the order does not matter.
       * `qa/publish-reseed-no-refresh.spec.ts` holds that.
       */
      leaving.release();
    });
  }

  /** The conflict dialog's non-destructive answer: show what the server holds now. */
  function loadSaved() {
    startTransition(async () => {
      const result = await settled(reloadRoutineAction(clientId), FAILED);
      if (!result.ok) {
        if (result.failure.code === "ACCESS_DENIED") return accessEnded();
        setConflict(null);
        setError(copy.routine.conflictLoadFailed);
        return;
      }
      revision.current += 1;
      replaced();
      if (result.draft) {
        setDocument(editableDocument(null, result.draft.document));
        token.current = result.draft.updatedAt;
        setIsDraft(true);
      } else {
        // Published or discarded in the meantime: the live plan is what there is.
        setDocument(
          result.published ? editableDocument(result.published.planName, result.published.document) : null
        );
        token.current = null;
        setIsDraft(false);
      }
      setResolved(true);
      setDirty(false);
      setConflict(null);
      setError(null);
      setNotice(copy.routine.conflictLoaded);
    });
  }

  /** The conflict dialog's destructive answer — only on a press, only with the 409's token. */
  function replaceSaved() {
    const existing = conflict?.existingUpdatedAt;
    const intent = conflict?.intent;
    if (!existing || !intent) return;
    setConflict(null);
    if (intent === "save") saveDraft(existing);
    else openPublish(existing);
  }

  // AC1: no plan and no draft is an empty state with ONE primary control.
  if (!document) {
    return (
      <div className="prog-editor">
        {lead}
        <ProgrammeFrame profile={profile} aside={aside}>
          <Card>
            <EmptyState
              icon="dumbbell"
              title={copy.routine.emptyTitle}
              sub={copy.routine.emptyBody}
              action={
                <Button
                  icon="plus"
                  onClick={() => {
                    edit(blankRoutine(copy.routine.title, copy.routine.newDayFocus));
                    // A from-scratch plan's goal and level are placeholders until the first
                    // save resolves them from the trainee's profile.
                    setResolved(false);
                  }}
                >
                  {copy.routine.build}
                </Button>
              }
            />
          </Card>
        </ProgrammeFrame>
      </div>
    );
  }

  /**
   * The marks apply to the names the SERVER checked. A row the coach added or replaced
   * since carries a name not in this set and is unmarked — the api has not been asked
   * about it, and claiming it is fine would be answering a question only it can.
   */
  const unbindable = new Set(unbindableExercises.map((name) => name.toLowerCase()));
  const flaggedInPlan = document.trainingDays.reduce(
    (total, day) => total + day.exercises.filter((ex) => unbindable.has(ex.name.toLowerCase())).length,
    0
  );

  return (
    <div className="prog-editor" ref={scope}>
      {lead}
      <ProgrammeFrame profile={profile} aside={aside}>
        <Card style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            {/* EV-342f F.3: below 1280 px the name takes the whole row (`.prog-name`). */}
            <div className="prog-name" style={{ minWidth: 0 }}>
              <label htmlFor="plan-name" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>
                {copy.routine.planNameLabel}
              </label>
              <input
                id="plan-name"
                className="prog-name-input"
                value={document.name}
                title={document.name}
                onChange={(e) => edit({ ...document, name: e.target.value })}
                style={{
                  display: "block",
                  marginTop: 6,
                  height: MIN_TOUCH_TARGET,
                  // The width is the class's (EV-342f F.3): a media query cannot reach an
                  // inline declaration (BUG-380).
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border-2)",
                  background: "var(--surface)",
                  padding: "0 12px",
                  fontFamily: "var(--font-display)",
                  fontSize: 17,
                  fontWeight: 700,
                  color: "var(--ink)",
                }}
              />
            </div>
            {/*
              The status pill (EV-337f1 F1.5, ruling 15): today's words, as text, never colour
              alone, and no date or time (a server instant needs a zone, D13).
            */}
            <span className="prog-status">
              {/* EV-184 AC2, verbatim. */}
              <StatusPill
                tone={isDraft ? "amber" : "green"}
                icon={isDraft ? "edit" : "checkCircle"}
                label={isDraft ? copy.routine.draftBadge : copy.routine.publishedBadge}
              />
              {/* EV-190 AC2: shown from the first edit until the next SUCCESSFUL save. */}
              {dirty && <StatusPill tone="red" icon="alert" label={copy.routine.unsavedBadge} />}
            </span>
          </div>

          {/*
            ADR-0016 V1b / ADR-0018 D1 — the server accepts only a publishable document, so
            the editor holds transient invalid state LOCALLY and says what is outstanding,
            rather than offering a Save that fails with a 400 a coach cannot act on.
          */}
          {reasons.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>
                {copy.routine.notSaveableYet}
              </p>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {reasons.map((reason) => (
                  <li key={reason} style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.6 }}>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* EV-188 AC3, verbatim. Present only while the template still exists. */}
          {sourceTemplateName && isDraft && (
            <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
              {copy.templates.startedFrom(sourceTemplateName)}
            </p>
          )}

          {/* EV-188 AC5 — the count is the flagged rows STILL PRESENT. */}
          {flaggedInPlan > 0 && (
            <p
              role="status"
              style={{
                margin: "12px 0 0",
                padding: "10px 12px",
                borderRadius: "var(--r-lg)",
                background: "var(--warn-bg)",
                color: "var(--warn-ink)",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {copy.templates.unbindable(flaggedInPlan)}
            </p>
          )}
        </Card>

        <RoutineDocumentEditor
          key={loads}
          document={document}
          onChange={edit}
          subject={{ kind: "trainee", resolved }}
          dayCountBound={copy.routine.dayCountBound}
          unbindable={unbindable}
          replaceHint
          openDays={openDays}
          onOpenDaysChange={setOpenDays}
        />
      </ProgrammeFrame>

      {/*
        EV-201 AC4 — what Publish does, ALWAYS, before it is pressed. Since EV-337f1 it is in
        the page directly above the action bar (plan §5.3: "the publish hint sentence moves
        above the bar, in the page"), never inside it, and Publish names it as its
        description so a screen reader hears it on the control itself.
      */}
      <p id={publishHintId} className="prog-publish-hint">
        {copy.routine.publishShowsFirst}
      </p>

      {/*
        EV-337f1 F1.1–F1.3 — the ONE place the plan is saved, discarded or published: a
        sticky bar above the tab bar (< 1024) or the legal footer (≥ 1024), so « Publier »
        is under the thumb at day 6 of a six-day plan. Below 768 px Save and Discard share
        a row and Publish has the bar's full width under them. The notice and the error are
        IN the bar, so a save from day 6 is answered at day 6. DOM order = keyboard order:
        Save, Discard, Publish, as before.
      */}
      <StickyActionBar label={copy.routine.actionsLabel}>
        {notice && (
          <p className="action-bar-note" role="status" data-tone="ok">
            {notice}
          </p>
        )}
        {error && (
          <p className="action-bar-note" role="alert" data-tone="err">
            {error}
          </p>
        )}
        <div className="prog-bar-actions">
          <div className="prog-bar-pair">
            <Button
              variant="secondary"
              icon="check"
              onClick={() => saveDraft()}
              disabled={pending || !writable}
              style={BAR_BUTTON}
            >
              {pending ? copy.routine.saving : copy.routine.saveDraft}
            </Button>
            <Button
              variant="ghost"
              icon="trash"
              onClick={() => setDiscarding(true)}
              disabled={pending || !isDraft}
              style={BAR_BUTTON}
            >
              {copy.routine.discardDraft}
            </Button>
          </div>
          <Button
            icon="upload"
            onClick={() => openPublish()}
            disabled={pending || !writable}
            ariaDescribedBy={publishHintId}
            style={BAR_BUTTON}
          >
            {pending ? copy.routine.publishing : copy.routine.publish}
          </Button>
        </div>
      </StickyActionBar>

      <Modal
        dirty={false}
        open={discarding}
        onClose={() => !pending && setDiscarding(false)}
        title={copy.routine.discardTitle}
        icon="trash"
        iconTone="red"
        width={420}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDiscarding(false)} disabled={pending}>
              {copy.routine.cancel}
            </Button>
            <Button variant="danger" onClick={discard} disabled={pending}>
              {copy.routine.discardDraft}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
          {copy.routine.discardBody}
        </p>
      </Modal>

      {/*
        AC3.6 — the 409 COACH_DRAFT_EXISTS dialog. Three answers and a default that loses
        nothing: "Keep editing" closes it and writes nothing; "Load the saved version"
        shows what the server holds now; "Replace the draft" is the apply dialog's control
        and sentence, offered only when the 409 carried a timestamp to echo — without one
        a retry would overwrite on a guess.
      */}
      <Modal
        dirty={false}
        open={conflict !== null}
        onClose={() => !pending && setConflict(null)}
        title={copy.routine.conflictTitle}
        icon="shield"
        iconTone="amber"
        width={480}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConflict(null)} disabled={pending}>
              {copy.routine.conflictKeepEditing}
            </Button>
            <Button variant="secondary" onClick={loadSaved} disabled={pending}>
              {copy.routine.conflictLoad}
            </Button>
            {conflict?.existingUpdatedAt && (
              <Button variant="danger" onClick={replaceSaved} disabled={pending}>
                {copy.templates.replaceAndUse}
              </Button>
            )}
          </>
        }
      >
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
            {copy.routine.conflictBody}
          </p>
          {/* Staff review S1 — "Load" discards this page's edits, and says so first. */}
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
            {copy.routine.conflictLoadWarning}
          </p>
          <p
            role="alert"
            style={{
              margin: 0,
              padding: "10px 12px",
              borderRadius: "var(--r-lg)",
              background: "var(--warn-bg)",
              color: "var(--warn-ink)",
              fontSize: 13.5,
              lineHeight: 1.5,
            }}
          >
            {conflict?.existingUpdatedAt
              ? copy.templates.replacesDraft(traineeName)
              : copy.routine.conflictUnreadable}
          </p>
        </div>
      </Modal>

      {/*
        AC2's confirm. "Stay" is the default action and leaves every edit intact, because
        a dialog about losing work whose primary button loses it is a trap.
      */}
      <Modal
        dirty={false}
        open={leaving.prompted}
        onClose={leaving.stay}
        title={copy.routine.leaveTitle}
        icon="shield"
        iconTone="amber"
        width={420}
        footer={
          <>
            <Button variant="secondary" onClick={leaving.stay}>
              {copy.routine.leaveStay}
            </Button>
            <Button variant="danger" onClick={leaving.leave}>
              {copy.routine.leaveConfirm}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
          {copy.routine.leaveBody}
        </p>
      </Modal>

      <PublishModal
        preview={preview}
        pending={pending}
        onCancel={() => setPreview(null)}
        onConfirm={confirmPublish}
      />
    </div>
  );
}

/**
 * AC3's modal, in its two shapes.
 *
 * With repairs: the heading counts them, each is ONE line naming the exercise, the
 * replacement and the rule, and there are exactly two controls. Without: one sentence
 * and one control. No third state, no "don't show this again", no silent publish.
 */
function PublishModal({
  preview,
  pending,
  onCancel,
  onConfirm,
}: {
  preview: PublishPreview | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const copy = useCopy();
  const repairs = preview?.repairs ?? [];
  const hasRepairs = repairs.length > 0;
  return (
    <Modal
      dirty={false}
      open={preview !== null}
      onClose={() => !pending && onCancel()}
      title={hasRepairs ? copy.routine.repairsTitle(repairs.length) : copy.routine.noChanges}
      icon={hasRepairs ? "shield" : "check"}
      iconTone={hasRepairs ? "amber" : "blue"}
      width={520}
      footer={
        hasRepairs ? (
          <>
            <Button variant="secondary" onClick={onCancel} disabled={pending}>
              {copy.routine.cancel}
            </Button>
            <Button onClick={onConfirm} disabled={pending}>
              {copy.routine.publishWithChanges}
            </Button>
          </>
        ) : (
          <Button onClick={onConfirm} disabled={pending}>
            {copy.routine.publish}
          </Button>
        )
      }
    >
      {hasRepairs ? (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
          {repairs.map((repair, i) => (
            <li
              key={`${repair}-${i}`}
              title={repair}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 9,
                padding: "10px 12px",
                borderRadius: "var(--r-lg)",
                background: "var(--warn-bg)",
                color: "var(--warn-ink)",
                fontSize: 13.5,
                lineHeight: 1.45,
              }}
            >
              <UiIcon name="shield" size={16} color="var(--warn-ink)" />
              <span>
                {/*
                  The api serves the whole sentence (EV-184a `repairs: List<String>`),
                  so the portal renders it verbatim and composes nothing. Edge case 6's
                  in-modal truncation of a long exercise name is not possible on a
                  string the portal cannot take apart — the line wraps instead, and the
                  full text is on the `title`. That is the cost of the string shape and
                  it is named in `PublishRepair`.
                */}
                {repair}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)" }}>
          {copy.routine.noChangesBody}
        </p>
      )}
    </Modal>
  );
}

/**
 * EV-337f1 — the bar's buttons may WRAP their label between words (French « Enregistrer le
 * brouillon » is two lines in half of a 320 px bar, edge case 3), so they grow from the
 * 44 px floor instead of clipping. Wider than the label needs, nothing wraps.
 */
const BAR_BUTTON: CSSProperties = {
  height: "auto",
  minHeight: MIN_TOUCH_TARGET,
  padding: "6px 14px",
  whiteSpace: "normal",
  lineHeight: "18px",
  textAlign: "center",
};

/**
 * EV-337f1 F1.4 — the programme's two-column frame, beside each other from a 1280 px
 * viewport by grid placement. CSS decides, never a viewport hook (plan §3 rule 5).
 *
 * EV-342f (audit A6) — in ONE column (below 1280 px) the document order is the reading
 * order: the profile line, the editor, then « Enregistrer comme modèle ». It used to be the
 * whole aside first, which put the plan-name field at y≈630 at 1024×800. From 1280 px the
 * profile and the aside are placed back in the second column, one under the other, so that
 * layout is unchanged (F.4).
 */
function ProgrammeFrame({ profile, aside, children }: { profile: ReactNode; aside: ReactNode; children: ReactNode }) {
  return (
    <div className="layout-split prog-split">
      {profile ? <div className="prog-profile">{profile}</div> : null}
      <div className="prog-main">{children}</div>
      {aside ? <div className="prog-aside">{aside}</div> : null}
    </div>
  );
}
