"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { CatalogPicker } from "./CatalogPicker";
import { copy } from "@/lib/copy";
import { isoWeekdayLabel, truncateName } from "@/lib/format";
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

function emptyDay(existing: RoutineDayEntry[]): RoutineDayEntry {
  const used = new Set(existing.map((d) => d.dayOfWeek));
  let dayOfWeek = 1;
  while (used.has(dayOfWeek) && dayOfWeek < 7) dayOfWeek += 1;
  return { dayOfWeek, focus: copy.routine.newDayFocus, exercises: [] };
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
}: {
  clientId: string;
  activePlan: RoutinePlanView | null;
  initialDraft: CoachRoutineDraft | null;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<RoutinePlanView | null>(initialDraft ?? activePlan);
  /** True from the moment a draft exists on the server OR the coach edits anything. */
  const [isDraft, setIsDraft] = useState(initialDraft !== null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [preview, setPreview] = useState<PublishPreview | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
  }, [publishedPlanId, activePlan, initialDraft]);

  function edit(next: RoutinePlanView) {
    setPlan(next);
    setIsDraft(true);
    setNotice(null);
    setError(null);
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
    setPicker(null);
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
    router.refresh();
  }

  function saveDraft() {
    if (!plan) return;
    startTransition(async () => {
      const result = await saveDraftAction(clientId, {
        name: plan.name,
        trainingDays: plan.trainingDays,
      });
      if (!result.ok) {
        if (result.code === "ACCESS_DENIED") return accessEnded();
        setError(copy.routine.saveFailed);
        return;
      }
      setNotice(copy.routine.savedAt(new Date().toLocaleTimeString()));
      setError(null);
      setIsDraft(true);
      router.refresh();
    });
  }

  function discard() {
    startTransition(async () => {
      const result = await discardDraftAction(clientId);
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
      setNotice(null);
      setError(null);
      router.refresh();
    });
  }

  function openPublish() {
    if (!plan) return;
    startTransition(async () => {
      const result = await previewPublishAction(clientId, {
        name: plan.name,
        trainingDays: plan.trainingDays,
      });
      if (!result.ok) {
        if (result.code === "ACCESS_DENIED") return accessEnded();
        setError(FAILURE_COPY[result.code]);
        return;
      }
      setError(null);
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
      const result = await publishAction(clientId, preview.digest);
      if (!result.ok) {
        if (result.code === "ACCESS_DENIED") {
          setPreview(null);
          return accessEnded();
        }
        if (result.code === "REPAIRS_UNACKNOWLEDGED") {
          const again = await previewPublishAction(clientId, {
            name: plan.name,
            trainingDays: plan.trainingDays,
          });
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
      setNotice(copy.routine.published);
      setError(null);
      router.refresh();
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
                edit({ planId: null, name: copy.routine.title, trainingDays: [emptyDay([])] })
              }
            >
              {copy.routine.build}
            </Button>
          }
        />
      </Card>
    );
  }

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
          <Badge tone={isDraft ? "amber" : "green"}>
            {/* AC2, verbatim. */}
            {isDraft ? copy.routine.draftBadge : copy.routine.publishedBadge}
          </Badge>
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

        {notice && (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--ok-ink)" }}>{notice}</p>
        )}
        {error && (
          <p role="alert" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--err-ink)" }}>
            {error}
          </p>
        )}
      </Card>

      {plan.trainingDays.map((day, dayIndex) => (
        <Card key={`${day.dayOfWeek}-${dayIndex}`} style={{ marginBottom: 14 }}>
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
              <Badge tone="blue">{isoWeekdayLabel(day.dayOfWeek) || copy.routine.dayLabel(dayIndex + 1)}</Badge>
              <input
                aria-label={`${copy.routine.dayLabel(dayIndex + 1)} focus`}
                value={day.focus}
                title={day.focus}
                onChange={(e) =>
                  editDays((days) =>
                    days.map((d, i) => (i === dayIndex ? { ...d, focus: e.target.value } : d))
                  )
                }
                style={{
                  // BUG-146's floor: a text input a coach taps at 390 px is a control,
                  // and 36 px was below it. Everything else about the field is
                  // unchanged — only the tap area grows.
                  height: MIN_TOUCH_TARGET,
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border-2)",
                  background: "var(--surface)",
                  padding: "0 10px",
                  fontFamily: "var(--font-display)",
                  fontSize: 14.5,
                  fontWeight: 600,
                  color: "var(--ink)",
                  minWidth: 0,
                  maxWidth: 220,
                }}
              />
              <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                {copy.routine.exercises(day.exercises.length)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon="trash"
              onClick={() => editDays((days) => days.filter((_, i) => i !== dayIndex))}
            >
              {copy.routine.removeDay}
            </Button>
          </div>

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

      <Button
        variant="secondary"
        icon="plus"
        onClick={() => editDays((days) => [...days, emptyDay(days)])}
      >
        {copy.routine.addDay}
      </Button>

      <CatalogPicker
        open={picker !== null}
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

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 5 }}>
        {label}
      </div>
      <input
        type="number"
        min={1}
        max={20}
        value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
        style={FIELD_STYLE}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 5 }}>
        {label}
      </div>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={FIELD_STYLE} />
    </label>
  );
}

const FIELD_STYLE = {
  height: MIN_TOUCH_TARGET,
  width: 96,
  borderRadius: "var(--r-md)",
  border: "1px solid var(--border-2)",
  background: "var(--surface)",
  padding: "0 10px",
  fontFamily: "var(--font-body)",
  fontSize: 13.5,
  color: "var(--ink)",
} as const;
