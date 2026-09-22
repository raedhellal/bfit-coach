"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { CatalogPicker } from "./CatalogPicker";
import { DayFocusField, NumberField, TextField, WeekdaySelect } from "./RoutineFields";
import { copy } from "@/lib/copy";
import { settled } from "@/lib/settled";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { ISO_WEEKDAY_NUMBERS, isoWeekdayLabel, truncateName } from "@/lib/format";
import {
  discardDraftAction,
  previewPublishAction,
  publishAction,
  saveDraftAction,
  type RoutineFailure,
} from "@/lib/routineActions";
import type {
  CatalogExercise,
  CoachRoutineDraft,
  PublishPreview,
  RoutineDayEntry,
  RoutineExerciseEntry,
  RoutinePlanView,
} from "@/lib/coachApi";

/**
 * EV-184b's editor. The whole of the trainee's plan, editable, with the two-phase
 * publish.
 *
 * It is a client island for a reason the rest of this app avoids: every AC2 change —
 * reorder, replace, remove, add, sets/reps/rest — must be "visible on the page
 * immediately", which is a local-state requirement. So the editor keeps a working copy
 * and the server is written to only by "Save draft" and by Publish (which saves first).
 *
 * Two properties hold by construction rather than by review:
 *   · an exercise can only arrive through `CatalogPicker`, carrying a catalog slug —
 *     there is no text input anywhere that produces an exercise name (AC2);
 *   · the trainee's injuries are rendered by the page, outside this component, and no
 *     state here can reach them, so the editor cannot submit them (CS-22 / ADR-0001).
 *
 * Publish is never a single press: `previewPublishAction` saves and returns the
 * repairs, and `publishAction` echoes the digest the coach was shown. A draft that
 * changes between the two invalidates the digest, and the api answers 409 — which is
 * the point of the digest and not an error the coach can be walked into by the UI,
 * because the editor is frozen while the modal is open.
 */

type PickerTarget =
  | { mode: "add"; dayIndex: number }
  | { mode: "replace"; dayIndex: number; exerciseIndex: number };

/**
 * `TrainingDayBounds` in the api: a plan is 2 to 6 training days. EV-190 AC1 asks for
 * the add and remove controls to be disabled AT each end WITH a visible reason, which
 * is why these are two named constants and not two literals in a JSX expression.
 *
 * A plan that already holds 7 days (pre-existing data, edge case 1) renders untouched:
 * the editor refuses to add an eighth and says why. It never drops one silently.
 */
const MIN_TRAINING_DAYS = 2;
const MAX_TRAINING_DAYS = 6;

/**
 * The weekday a NEWLY ADDED day starts on — the first one not already in the plan.
 *
 * This is now a default the coach can see and change, which is the whole of EV-190 R1.
 * Until this story it was the ONLY thing that decided `dayOfWeek`, and nothing in the
 * portal edited it afterwards: every hand-built 4-day plan landed Monday-Thursday, and
 * `RoutinePlanWriter` derived the trainee's whole 7-row `plan_schedule` — every
 * `rest_day` flag, and therefore `TrainingDayScheduleFactory`'s training-day vs
 * rest-day NUTRITION — from it. A UI convenience was steering two surfaces.
 *
 * `firstFreeWeekday` returns null when all seven are taken; the caller refuses rather
 * than returning a duplicate, because `RoutinePlanWriter`'s
 * `workoutByDay.put(day.dayOfWeek(), ...)` would silently drop one of the two.
 */
function firstFreeWeekday(existing: RoutineDayEntry[]): number | null {
  const used = new Set(existing.map((d) => d.dayOfWeek));
  return ISO_WEEKDAY_NUMBERS.find((day) => !used.has(day)) ?? null;
}

function emptyDay(dayOfWeek: number): RoutineDayEntry {
  return { dayOfWeek, focus: copy.routine.newDayFocus, exercises: [] };
}

/** The two days a brand-new plan starts with: the minimum the bound allows. */
function startingDays(): RoutineDayEntry[] {
  const first = emptyDay(1);
  return [first, emptyDay(firstFreeWeekday([first]) ?? 2)];
}

function toEntry(exercise: CatalogExercise): RoutineExerciseEntry {
  return {
    catalogSlug: exercise.slug,
    name: exercise.name,
    primaryMuscles: exercise.primaryMuscles,
    equipment: exercise.equipment,
    // Defaults a coach immediately overrides; they exist so a freshly added exercise is
    // never an empty prescription.
    sets: 3,
    reps: "8-12",
    rest: "90s",
  };
}

const FAILURE_COPY: Record<RoutineFailure, string> = {
  PLAN_EMPTY: copy.routine.planEmpty,
  CATALOG_UNAVAILABLE: copy.routine.catalogUnavailable,
  REPAIRS_UNACKNOWLEDGED: copy.routine.publishFailed,
  ACCESS_DENIED: copy.client.notFound,
  FAILED: copy.routine.publishFailed,
};

export function RoutineEditor({
  clientId,
  activePlan,
  initialDraft,
  sourceTemplateName = null,
  unbindableExercises = [],
}: {
  clientId: string;
  activePlan: RoutinePlanView | null;
  initialDraft: CoachRoutineDraft | null;
  /**
   * EV-188 AC3 — the name of the template this draft was started from, resolved by the
   * page from `CoachRoutineDraftResponse.sourceTemplateId`. Null for a hand-built
   * draft, and null again once that template is deleted (`ON DELETE SET NULL`), which
   * is AC2's delete rule showing through: the line disappears and nothing else does.
   */
  sourceTemplateName?: string | null;
  /**
   * EV-188 AC5 — exercise names the catalogue would not match today, re-derived by the
   * api on every open and NEVER stored.
   *
   * The editor marks them IN PLACE and offers Replace and Remove, both of which already
   * exist and both of which do something. It removes nothing on its own: "nothing
   * removes an exercise from a coach's programming except a coach pressing Remove"
   * (Ruling 5a). Because the list is re-derived rather than cached, the marks survive a
   * reload and then disappear after a catalogue re-sync with no edit having been made.
   */
  unbindableExercises?: string[];
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<RoutinePlanView | null>(initialDraft ?? activePlan);
  /** True from the moment a draft exists on the server OR the coach edits anything. */
  const [isDraft, setIsDraft] = useState(initialDraft !== null);
  /**
   * U2's flag, and the reason it is NOT `isDraft`.
   *
   * `isDraft` is true for a saved draft with no edits — a coach who opens a draft they
   * saved yesterday and touches nothing has `isDraft === true` and nothing outstanding.
   * Guarding on it would prompt on every navigation off this page, and a prompt that
   * fires when nothing is unsaved is dismissed reflexively and then ignored on the day
   * it matters.
   *
   * `dirty` is set by `edit()` — the single funnel every mutation in this component
   * goes through — and cleared ONLY by a successful save, publish or discard. A FAILED
   * save does not clear it: the coach is still holding unsaved work (AC2).
   */
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [preview, setPreview] = useState<PublishPreview | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * AC1's refusal, held against the day card that refused it so the reason is next to
   * the control the coach just used rather than at the top of a scrolled page.
   */
  const [weekdayError, setWeekdayError] = useState<{
    dayIndex: number;
    message: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const leaving = useUnsavedChanges(dirty);
  /**
   * U6 — put the feedback where the coach is looking.
   *
   * The notice and the error render in the TOP card, next to the controls that produce
   * them. After adding an exercise at the bottom of day 5 both the control and its
   * confirmation are off-screen, so a coach presses Save draft, sees nothing move, and
   * presses it again.
   *
   * EV-190's NOT-list settles what the fix is: "scroll the notice into view and
   * announce it" — not a sticky action bar, which is a redesign and is out. So the
   * element keeps its place in the document and is brought to the coach, and it is a
   * live region so the confirmation exists for someone who is not looking at all.
   */
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!notice && !error) return;
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [notice, error]);

  /**
   * Re-seed the working copy when the SERVER's published plan changes identity.
   *
   * Publishing returns a new `planId` (a new `plans` row, superseding the previous
   * assignment), and `router.refresh()` re-renders this page's props — but this is a
   * client island with its own state, so without this the editor would keep showing
   * the draft the coach submitted rather than the REPAIRED plan the trainee actually
   * received. AC3 says the repaired exercise is verifiably absent; a coach must be
   * able to verify that on the screen they published from, not only after a reload.
   *
   * It keys on `planId` rather than on the whole prop so an ordinary "Save draft" —
   * which refreshes the route but does not change the published plan — does not blow
   * away the coach's cursor mid-edit. The success notice is set before the refresh
   * and survives, because this only resets the plan itself.
   */
  const publishedPlanId = activePlan?.planId ?? null;
  const lastPublishedPlanId = useRef(publishedPlanId);
  useEffect(() => {
    if (lastPublishedPlanId.current === publishedPlanId) return;
    lastPublishedPlanId.current = publishedPlanId;
    setPlan(initialDraft ?? activePlan);
    setIsDraft(initialDraft !== null);
    // The working copy was just replaced by the server's, so nothing local is
    // outstanding — whatever the coach had is either published or gone.
    setDirty(false);
  }, [publishedPlanId, activePlan, initialDraft]);

  function edit(next: RoutinePlanView) {
    setPlan(next);
    setIsDraft(true);
    setDirty(true);
    setNotice(null);
    setError(null);
    setWeekdayError(null);
  }

  /**
   * AC1 — the weekday control, with the duplicate refused rather than accepted.
   *
   * The seven weekdays are all OFFERED, including ones already in the plan, and a
   * duplicate is refused WITH ITS REASON. Disabling the taken options instead would be
   * a control that does nothing when pressed and explains nothing, and a coach moving
   * a session from Wednesday to Tuesday would be told neither why Tuesday is not
   * there nor which day is on it.
   *
   * The previous value stands because the `select` is controlled: refusing simply does
   * not call `edit`, and React re-renders it at the value in state.
   */
  function setWeekday(dayIndex: number, dayOfWeek: number) {
    if (!plan) return;
    const clash = plan.trainingDays.some((d, i) => i !== dayIndex && d.dayOfWeek === dayOfWeek);
    if (clash) {
      setWeekdayError({ dayIndex, message: copy.routine.weekdayTaken(isoWeekdayLabel(dayOfWeek)) });
      return;
    }
    editDays((days) =>
      days.map((d, i) => (i === dayIndex ? { ...d, dayOfWeek } : d))
    );
  }

  function editDays(mutate: (days: RoutineDayEntry[]) => RoutineDayEntry[]) {
    if (!plan) return;
    edit({ ...plan, trainingDays: mutate(plan.trainingDays) });
  }

  function editExercises(
    dayIndex: number,
    mutate: (exercises: RoutineExerciseEntry[]) => RoutineExerciseEntry[]
  ) {
    editDays((days) =>
      days.map((day, i) => (i === dayIndex ? { ...day, exercises: mutate(day.exercises) } : day))
    );
  }

  function move(dayIndex: number, from: number, to: number) {
    editExercises(dayIndex, (exercises) => {
      if (to < 0 || to >= exercises.length) return exercises;
      const next = [...exercises];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function onPick(exercise: CatalogExercise) {
    const target = picker;
    if (!target) return;
    // U4: an ADD leaves the picker open for the next one — building a six-exercise day
    // was six open/search/pick cycles. A REPLACE has nothing left to do, so it closes.
    if (target.mode === "replace") setPicker(null);
    editExercises(target.dayIndex, (exercises) => {
      if (target.mode === "add") return [...exercises, toEntry(exercise)];
      return exercises.map((ex, i) =>
        i === target.exerciseIndex
          ? { ...toEntry(exercise), sets: ex.sets, reps: ex.reps, rest: ex.rest }
          : ex
      );
    });
  }

  /**
   * A write answered 403: the trainee revoked the link mid-session (ADR-0012 AC6 —
   * "the coach's very next request is refused"). `router.refresh()` makes that next
   * request: it re-runs `[id]/layout.tsx`, whose own overview read now 403s, and the
   * layout redirects to /clients/denied.
   *
   * The alternative this replaces was an error sentence under an editor still full of
   * a revoked trainee's plan, with every control still offering to write to it. The
   * remedy for losing access is leaving the page, not a line of copy on it.
   */
  function accessEnded(): void {
    /**
     * EV-190 edge case 4. The unsaved-changes guard must not hold a coach whose access
     * has ended on a page of a revoked trainee's plan, so the flag is dropped BEFORE
     * the refresh that triggers the layout's redirect. Nothing about this work is
     * recoverable — the link it belonged to is gone — and a dialog here would be a
     * dialog about the coach's own convenience blocking a consent decision the trainee
     * made.
     */
    setDirty(false);
    // The guard's own history entry has to come out BEFORE the refresh, or the
    // layout's redirect to /clients/denied never lands. See `release`.
    leaving.release(() => router.refresh());
  }

  function saveDraft() {
    if (!plan) return;
    startTransition(async () => {
      /**
       * A server action is a `fetch`, and a `fetch` can fail. Without this `catch` a
       * dropped connection rejected inside the transition, the coach saw no sentence
       * at all, and the only thing that told them the save had not happened was the
       * absence of the "Draft saved" line. EV-190 AC2 turns that into a correctness
       * requirement: a FAILED save must leave the unsaved-changes flag standing, so
       * the failure has to be a value, not an unhandled rejection.
       */
      const result = await settled(
        saveDraftAction(clientId, { name: plan.name, trainingDays: plan.trainingDays }),
        { ok: false, code: "FAILED" } as const
      );
      if (!result.ok) {
        if (result.code === "ACCESS_DENIED") return accessEnded();
        setError(copy.routine.saveFailed);
        return;
      }
      setNotice(copy.routine.savedAt(new Date().toLocaleTimeString()));
      setError(null);
      setIsDraft(true);
      setDirty(false);
      // Every refresh that follows a cleared flag goes through `release` for the same
      // reason the access-ended path does: the guard's history entry has to come out
      // before the router is asked to do anything, not while it is doing it.
      leaving.release(() => router.refresh());
    });
  }

  function discard() {
    startTransition(async () => {
      const result = await settled(discardDraftAction(clientId), {
        ok: false,
        code: "FAILED",
      } as const);
      if (!result.ok) {
        if (result.code === "ACCESS_DENIED") return accessEnded();
        setError(copy.routine.discardFailed);
        return;
      }
      // AC2: "returns the page to the published plan exactly" — so the published plan
      // is what the editor shows, from the server's copy, not from a local undo stack.
      setDiscarding(false);
      setPlan(activePlan);
      setIsDraft(false);
      setDirty(false);
      setNotice(null);
      setError(null);
      leaving.release(() => router.refresh());
    });
  }

  function openPublish() {
    if (!plan) return;
    startTransition(async () => {
      const result = await settled(
        previewPublishAction(clientId, {
          name: plan.name,
          trainingDays: plan.trainingDays,
        }),
        { ok: false, code: "FAILED", saved: false } as const
      );
      if (!result.ok) {
        if (result.code === "ACCESS_DENIED") return accessEnded();
        // The draft write is the first half of this action. If it landed, the coach's
        // work is on the server and the unsaved warning must stop — what failed was
        // the publish, and the error sentence below says so.
        if (result.saved) setDirty(false);
        setError(FAILURE_COPY[result.code]);
        return;
      }
      setError(null);
      // Opening the preview means the draft was saved first (`previewPublishAction`
      // saves, then previews), so nothing is outstanding.
      setDirty(false);
      setPreview(result.preview);
    });
  }

  /**
   * AC3's confirm, and ADR-0015 D4's 409.
   *
   * `COACH_PUBLISH_REPAIRS_UNACKNOWLEDGED` means the draft moved between the preview
   * and this click — EV-184 edge case 2's second tab — so the repairs the coach
   * acknowledged are not the ones the server just computed. The ONLY correct answer is
   * to run preview again and show the modal with the new repair list: retrying publish
   * with the stale digest cannot succeed, and sending a fresh digest the coach has not
   * read would publish an unacknowledged repair, which is the single thing the digest
   * exists to prevent. The modal stays open on purpose — the coach is mid-decision and
   * a dismissed dialog would look like the publish went through.
   */
  function confirmPublish() {
    if (!preview || !plan) return;
    startTransition(async () => {
      const result = await settled(publishAction(clientId, preview.digest), {
        ok: false,
        code: "FAILED",
      } as const);
      if (!result.ok) {
        if (result.code === "ACCESS_DENIED") {
          setPreview(null);
          return accessEnded();
        }
        if (result.code === "REPAIRS_UNACKNOWLEDGED") {
          const again = await settled(
            previewPublishAction(clientId, {
              name: plan.name,
              trainingDays: plan.trainingDays,
            }),
            { ok: false, code: "FAILED", saved: false } as const
          );
          if (again.ok) {
            setPreview(again.preview);
            setError(null);
            return;
          }
          // The re-preview is a WRITE too (it saves the draft first), so it can be the
          // request that discovers the link ended. Falling through to FAILURE_COPY
          // here would print the roster sentence inside a modal over a revoked
          // trainee's plan — the one path where the 409 recovery could still strand
          // the coach on data they may no longer read.
          if (again.code === "ACCESS_DENIED") {
            setPreview(null);
            return accessEnded();
          }
          setError(FAILURE_COPY[again.code]);
          setPreview(null);
          return;
        }
        setError(FAILURE_COPY[result.code]);
        setPreview(null);
        return;
      }
      setPreview(null);
      setIsDraft(false);
      setDirty(false);
      setNotice(copy.routine.published);
      setError(null);
      leaving.release(() => router.refresh());
    });
  }

  // AC1: no plan and no draft is an empty state with ONE primary control, never a
  // blank page and never `null`.
  if (!plan) {
    return (
      <Card>
        <EmptyState
          icon="dumbbell"
          title={copy.routine.emptyTitle}
          sub={copy.routine.emptyBody}
          action={
            <Button
              icon="plus"
              onClick={() =>
                edit({ planId: null, name: copy.routine.title, trainingDays: startingDays() })
              }
            >
              {copy.routine.build}
            </Button>
          }
        />
      </Card>
    );
  }

  /**
   * The marks apply to the DRAFT the server sent. Once the coach edits, a row they
   * added or replaced carries a name that is not in this set and is therefore unmarked
   * — which is right: the api has not been asked about it, and claiming it is fine
   * would be this surface answering a question only the catalogue can.
   */
  const unbindable = new Set(unbindableExercises.map((name) => name.toLowerCase()));
  /** How many of the flagged names are still IN the plan the coach is looking at. */
  const flaggedInPlan = plan.trainingDays.reduce(
    (total, day) =>
      total + day.exercises.filter((ex) => unbindable.has(ex.name.toLowerCase())).length,
    0
  );

  const addDayRefusal =
    firstFreeWeekday(plan.trainingDays) === null
      ? copy.routine.allWeekdaysUsed
      : plan.trainingDays.length >= MAX_TRAINING_DAYS
        ? copy.routine.dayCountBound
        : null;

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
            <label
              htmlFor="plan-name"
              style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}
            >
              {copy.routine.planNameLabel}
            </label>
            <input
              id="plan-name"
              value={plan.name}
              title={plan.name}
              onChange={(e) => edit({ ...plan, name: e.target.value })}
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
          <Button variant="secondary" icon="check" onClick={saveDraft} disabled={pending}>
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
          <Button icon="upload" onClick={openPublish} disabled={pending}>
            {pending ? copy.routine.publishing : copy.routine.publish}
          </Button>
        </div>

        {/*
          EV-201 AC4 — next to the Publish control, ALWAYS, and before it is pressed.

          `openPublish` saves the draft and opens `PublishModal`; only the modal's
          confirm calls `publishAction`. The button says "Publish" and does not publish,
          which is EV-184's safety design and was stated nowhere on this screen.
        */}
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          {copy.routine.publishShowsFirst}
        </p>

        {/* EV-188 AC3, verbatim. Present only while the template still exists. */}
        {sourceTemplateName && isDraft && (
          <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
            {copy.templates.startedFrom(sourceTemplateName)}
          </p>
        )}

        {/*
          EV-188 AC5, verbatim, ABOVE the plan — "may", because the matcher is fuzzy and
          the product does not claim to know more than it does. The count is the flagged
          rows STILL PRESENT, so removing one takes it out of the sentence as well as
          off the row; the sentence and the marks can never disagree.
        */}
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

      {/*
        AC1 / AC6 — the heading states the KIND of control that sits under it. Ruling 2
        (c): "Evoli enforces these" is said only where QA has demonstrated the
        enforcement end to end, and these weekdays are written straight into
        `plan_schedule` on publish.
      */}
      <div style={{ margin: "0 0 12px" }}>
        <h2
          className="dt"
          style={{ margin: 0, fontSize: 15.5, fontWeight: 600, color: "var(--ink)" }}
        >
          {copy.routine.trainingDaysHeading}
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          {copy.routine.trainingDaysNote}
        </p>
        {/*
          The bound, said ONCE and visibly, when the plan is at the bottom of it. Every
          "Remove day" control is disabled at that point and a disabled control with no
          reason reads as a broken one — but the reason belongs to the plan, not to each
          of the two cards, so it is not repeated per card.
        */}
        {plan.trainingDays.length <= MIN_TRAINING_DAYS && (
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
            {copy.routine.dayCountBound}
          </p>
        )}
      </div>

      {plan.trainingDays.map((day, dayIndex) => (
        /**
         * The key is the POSITION, not the weekday.
         *
         * `${day.dayOfWeek}-${dayIndex}` was safe only for as long as nothing could
         * edit `dayOfWeek` — R1 makes it editable, and a key that changes remounts the
         * card: the weekday `select` loses focus on every change, so setting four days
         * in a row means finding the control again four times. Nothing else in this
         * component keys on the weekday (the exercise rows key on slug + index, and
         * `weekdayError` carries the day INDEX), so position is the whole of the
         * identity here. Re-sorting by weekday would break that — which is the other
         * reason the cards keep their array order.
         */
        <Card key={dayIndex} style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 14,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              {/*
                R1 — was a static `Badge` showing whatever weekday the insertion order
                happened to produce. A coach programmes in weekdays ("Monday, Wednesday,
                Friday"), not in "day 1..4", so the control offers the seven weekdays by
                name and shows the day's current value.

                The cards keep their ARRAY order and are never re-sorted when a weekday
                changes: a card that jumps while the coach is typing in it loses their
                place, and the order of this list decides nothing — the trainee's week is
                ordered by the weekday itself (`RoutinePlanWriter` keys a map on it).
              */}
              <WeekdaySelect
                dayIndex={dayIndex}
                value={day.dayOfWeek}
                onChange={(dayOfWeek) => setWeekday(dayIndex, dayOfWeek)}
              />
              {/*
                EV-201 AC1's labelled focus field, and the load-bearing `width: 100%`
                senior-qa measured on 2026-09-21 (item 4), both now in
                `RoutineFields.tsx` so the template editor cannot grow a second copy of
                the same overflow. The reasoning lives with the component.
              */}
              <DayFocusField
                dayIndex={dayIndex}
                value={day.focus}
                onChange={(focus) =>
                  editDays((days) =>
                    days.map((d, i) => (i === dayIndex ? { ...d, focus } : d))
                  )
                }
              />
              <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                {copy.routine.exercises(day.exercises.length)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon="trash"
              ariaLabel={`${copy.routine.removeDay}: ${isoWeekdayLabel(day.dayOfWeek)}`}
              title={
                plan.trainingDays.length <= MIN_TRAINING_DAYS
                  ? copy.routine.dayCountBound
                  : undefined
              }
              disabled={plan.trainingDays.length <= MIN_TRAINING_DAYS}
              onClick={() => editDays((days) => days.filter((_, i) => i !== dayIndex))}
            >
              {copy.routine.removeDay}
            </Button>
          </div>

          {/* AC1's refusal, verbatim, against the day that refused it. */}
          {weekdayError?.dayIndex === dayIndex && (
            <p
              role="alert"
              style={{ margin: "0 0 12px", fontSize: 13, color: "var(--err-ink)" }}
            >
              {weekdayError.message}
            </p>
          )}

          {/*
            EV-201 AC2 — the hint, ONCE PER DAY CARD, above the rows whose Replace
            controls it is about (the story leaves the placement to the implementer and
            asks for it to be stated: per day card, not per exercise row, because six
            copies of one sentence in a six-exercise day is noise and the fact is about
            the control, not about a particular exercise).

            Edge case 1: a day with no exercises has no Replace control, so the sentence
            would be orphaned over an empty day — it is not rendered there.
          */}
          {day.exercises.length > 0 && (
            <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--ink-3)" }}>
              {copy.routine.replaceKeepsPrescription}
            </p>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            {day.exercises.map((exercise, exerciseIndex) => (
              <div
                key={`${exercise.catalogSlug}-${exerciseIndex}`}
                /**
                 * Each prescription is a named group. Without it the row's Sets / Reps
                 * / Rest fields are three labels repeated once per exercise on the
                 * page, with nothing tying a value to the exercise it belongs to —
                 * for a screen reader and for QA alike. The name is the exercise's
                 * FULL name, not the truncated display string, so the group is still
                 * addressable when the visible label is elided (edge case 6).
                 */
                role="group"
                aria-label={exercise.name}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-lg)",
                  padding: 12,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    title={exercise.name}
                    style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", minWidth: 0 }}
                  >
                    {/* Edge case 6: 40+ characters truncate rather than wrapping the row. */}
                    {truncateName(exercise.name)}
                  </span>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {/*
                      EV-188 AC5 — marked IN PLACE, in the day it belongs to, so the
                      coach can see WHICH exercises without reading a list. The two
                      actions the AC requires (Replace, Remove) are the row's own and
                      both already do something.
                    */}
                    {unbindable.has(exercise.name.toLowerCase()) && (
                      <Badge tone="amber">{copy.templates.notInCatalogue}</Badge>
                    )}
                    {exercise.primaryMuscles && (
                      <Badge tone="neutral">{exercise.primaryMuscles}</Badge>
                    )}
                    {exercise.equipment && <Badge tone="neutral">{exercise.equipment}</Badge>}
                  </span>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <NumberField
                    label={copy.routine.sets}
                    value={exercise.sets}
                    onChange={(sets) =>
                      editExercises(dayIndex, (list) =>
                        list.map((ex, i) => (i === exerciseIndex ? { ...ex, sets } : ex))
                      )
                    }
                  />
                  {/* `reps` and `rest` are STRINGS in the persisted record ("8-12",
                      "90s"), so they are text fields, not steppers. */}
                  <TextField
                    label={copy.routine.reps}
                    value={exercise.reps}
                    onChange={(reps) =>
                      editExercises(dayIndex, (list) =>
                        list.map((ex, i) => (i === exerciseIndex ? { ...ex, reps } : ex))
                      )
                    }
                  />
                  <TextField
                    label={copy.routine.rest}
                    value={exercise.rest}
                    onChange={(rest) =>
                      editExercises(dayIndex, (list) =>
                        list.map((ex, i) => (i === exerciseIndex ? { ...ex, rest } : ex))
                      )
                    }
                  />
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="up"
                    ariaLabel={`${copy.routine.moveUp}: ${exercise.name}`}
                    onClick={() => move(dayIndex, exerciseIndex, exerciseIndex - 1)}
                    disabled={exerciseIndex === 0}
                  >
                    {copy.routine.moveUp}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="down"
                    ariaLabel={`${copy.routine.moveDown}: ${exercise.name}`}
                    onClick={() => move(dayIndex, exerciseIndex, exerciseIndex + 1)}
                    disabled={exerciseIndex === day.exercises.length - 1}
                  >
                    {copy.routine.moveDown}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="refresh"
                    ariaLabel={`${copy.routine.replace}: ${exercise.name}`}
                    onClick={() => setPicker({ mode: "replace", dayIndex, exerciseIndex })}
                  >
                    {copy.routine.replace}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="x"
                    ariaLabel={`${copy.routine.remove}: ${exercise.name}`}
                    onClick={() =>
                      editExercises(dayIndex, (list) =>
                        list.filter((_, i) => i !== exerciseIndex)
                      )
                    }
                  >
                    {copy.routine.remove}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            <Button
              variant="soft"
              icon="plus"
              onClick={() => setPicker({ mode: "add", dayIndex })}
            >
              {copy.routine.addExercise}
            </Button>
          </div>
        </Card>
      ))}

      {/*
        AC1's two refusals at the top end, both with a VISIBLE reason rather than an
        inert control: the 2-6 bound, and the seven weekdays running out (only reachable
        on a pre-existing 7-day plan, edge case 1 — `MAX_TRAINING_DAYS` stops it first
        on anything this editor built).
      */}
      <Button
        variant="secondary"
        icon="plus"
        title={addDayRefusal ?? undefined}
        disabled={addDayRefusal !== null}
        onClick={() => {
          const next = firstFreeWeekday(plan.trainingDays);
          if (next === null) return;
          editDays((days) => [...days, emptyDay(next)]);
        }}
      >
        {copy.routine.addDay}
      </Button>
      {addDayRefusal && (
        <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
          {addDayRefusal}
        </p>
      )}

      <CatalogPicker
        open={picker !== null}
        keepOpen={picker?.mode === "add"}
        title={
          picker?.mode === "replace"
            ? copy.routine.catalogReplaceTitle
            : copy.routine.catalogTitle
        }
        onClose={() => setPicker(null)}
        onPick={onPick}
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
        AC2's confirm. Two controls and no third option: "Stay" is the default action
        and leaves every edit intact, because a dialog about losing work whose primary
        button loses it is a trap.
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
