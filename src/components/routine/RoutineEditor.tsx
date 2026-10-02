"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { RoutineDocumentEditor } from "./RoutineDocumentEditor";
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
}) {
  const copy = useCopy();
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
   * U6 — the notice and the error render in the TOP card and are brought into view and
   * announced, because after an edit at the bottom of day 5 both are off-screen.
   */
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!notice && !error) return;
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [notice, error]);

  /**
   * Re-seed the working copy when the SERVER's published plan changes identity — a
   * publish writes a new `plans` row, and the coach must see the REPAIRED plan the
   * trainee received (EV-184 AC3), not the draft they submitted. Keyed on `planId` so an
   * ordinary save, which refreshes the route, does not blow away the cursor mid-edit.
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

  /** After a write, refresh the route — through `release` when nothing is outstanding. */
  function refreshAfterWrite(sentRevision: number) {
    if (revision.current === sentRevision) leaving.release(() => router.refresh());
    else router.refresh();
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
      refreshAfterWrite(sent);
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
      leaving.release(() => router.refresh());
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
      leaving.release(() => router.refresh());
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
    <div>
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
          <div style={{ minWidth: 0 }}>
            <label htmlFor="plan-name" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>
              {copy.routine.planNameLabel}
            </label>
            <input
              id="plan-name"
              value={document.name}
              title={document.name}
              onChange={(e) => edit({ ...document, name: e.target.value })}
              style={{
                display: "block",
                marginTop: 6,
                height: MIN_TOUCH_TARGET,
                width: "min(360px, 100%)",
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
          <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Badge tone={isDraft ? "amber" : "green"}>
              {/* EV-184 AC2, verbatim. */}
              {isDraft ? copy.routine.draftBadge : copy.routine.publishedBadge}
            </Badge>
            {/* EV-190 AC2: shown from the first edit until the next SUCCESSFUL save. */}
            {dirty && <Badge tone="red">{copy.routine.unsavedBadge}</Badge>}
          </span>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <Button variant="secondary" icon="check" onClick={() => saveDraft()} disabled={pending || !writable}>
            {pending ? copy.routine.saving : copy.routine.saveDraft}
          </Button>
          <Button
            variant="ghost"
            icon="trash"
            onClick={() => setDiscarding(true)}
            disabled={pending || !isDraft}
          >
            {copy.routine.discardDraft}
          </Button>
          <Button icon="upload" onClick={() => openPublish()} disabled={pending || !writable}>
            {pending ? copy.routine.publishing : copy.routine.publish}
          </Button>
        </div>

        {/* EV-201 AC4 — next to the Publish control, ALWAYS, and before it is pressed. */}
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          {copy.routine.publishShowsFirst}
        </p>

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

        <div ref={feedbackRef}>
          {notice && (
            <p role="status" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--ok-ink)" }}>
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--err-ink)" }}>
              {error}
            </p>
          )}
        </div>
      </Card>

      <RoutineDocumentEditor
        key={loads}
        document={document}
        onChange={edit}
        subject={{ kind: "trainee", resolved }}
        dayCountBound={copy.routine.dayCountBound}
        unbindable={unbindable}
        replaceHint
      />

      <Modal
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
