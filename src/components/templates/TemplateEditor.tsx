"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, MIN_TOUCH_TARGET, Modal } from "@/components/ui/kit";
import { CatalogPicker } from "@/components/routine/CatalogPicker";
import {
  DayFocusField,
  FIELD_STYLE,
  NumberField,
  TextField,
  WeekdaySelect,
} from "@/components/routine/RoutineFields";
import { copy } from "@/lib/copy";
import { isoWeekdayLabel, truncateName } from "@/lib/format";
import { settled } from "@/lib/settled";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import {
  GOALS,
  LEVELS,
  MAX_EXERCISES_PER_DAY,
  MAX_TRAINING_DAYS,
  MIN_TRAINING_DAYS,
  TEMPLATE_NAME_MAX,
  emptyDay,
  exerciseCount,
  firstFreeWeekday,
  forSave,
  newExercise,
  publishabilityReasons,
  type TemplateDraft,
} from "@/lib/templateDocument";
import {
  createTemplateAction,
  updateTemplateAction,
  type TemplateFailure,
} from "@/lib/templateActions";
import type { CatalogExercise, Routine, RoutineTrainingDay } from "@/lib/coachApi";

/**
 * AC1/AC2's template editor — the standalone one, on the coach's own resource.
 *
 * ═══ WHY THIS EDITS THE WHOLE `Routine` AND `RoutineEditor` DOES NOT ═══════════
 *
 * EV-184b's editor holds a LOSSY projection of a trainee's plan, and `coachApi.ts`'s ⛔
 * block explains why its write path has been broken against live since it shipped:
 * `tempo`, `notes`, `trackingType`, `durationSeconds`, `weight` and `estimatedMinutes`
 * are on the wire and on no coach control, so rebuilding the document from the editor
 * would silently delete them from a trainee's plan — and `goal` and `level` are
 * `@NotBlank` facts about a person the portal has no honest source for.
 *
 * Neither argument survives the move to a template. A template describes NOBODY, so
 * `goal` and `level` are the coach's own prescription and they author them here. And
 * AC4 requires the loss to be impossible from the other side: *"nothing travels in a
 * template that the coach cannot see and edit… text that cannot be shown must not be
 * stored"*. So the editor's state IS the document, every surviving field has a control,
 * and there is no projection to lose anything in.
 *
 * ═══ AND WHY THERE IS NO AUTOSAVE ═════════════════════════════════════════════
 *
 * ADR-0016 §Amendment 2026-09-21 withdrew the template validation group: the server
 * runs the FULL publish contract at the save boundary, so a document with fewer than
 * two training days, or a day with no exercises, is a 400 — b-fit-api's QA drove all
 * four shapes. The ADR names the cost rather than hiding it: *"the coach portal cannot
 * use the server as a scratchpad… EV-188b must hold transient invalid state locally."*
 *
 * This component is that. It keeps the work in React state, marks it unsaved, refuses
 * to POST a document `publishabilityReasons` can already see the server will refuse,
 * and lists what is outstanding — rather than offering a Save that fails with a 400 a
 * coach cannot act on. The unsaved-changes guard is the same one the routine editor
 * uses, for the same reason: losing a tab mid-edit is the failure mode this design
 * buys, so it is the one that is defended.
 */

type PickerTarget =
  | { mode: "add"; dayIndex: number }
  | { mode: "replace"; dayIndex: number; exerciseIndex: number };

const FAILURE_COPY: Record<TemplateFailure, string> = {
  NAME_TAKEN: copy.templates.nameTaken,
  LIMIT_REACHED: copy.templates.limitReached(50),
  TOO_LARGE: copy.templates.saveFailed,
  SOURCE_EMPTY: copy.templates.sourceEmpty,
  NOT_PUBLISHABLE: copy.templates.saveFailed,
  PLAN_EMPTY: copy.routine.planEmpty,
  CATALOG_UNAVAILABLE: copy.routine.catalogUnavailable,
  ACCESS_DENIED: copy.templates.notYours,
  FAILED: copy.templates.saveFailed,
};

export function TemplateEditor({
  templateId: initialTemplateId,
  initial,
}: {
  /** Null for "New template": the first successful save is a POST, then a navigation. */
  templateId: string | null;
  initial: TemplateDraft;
}) {
  const router = useRouter();
  /**
   * Null until the first save on a NEW template, and the id from then on.
   *
   * It is state rather than a prop because the create does NOT navigate — see `save`.
   */
  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId);
  const [draft, setDraft] = useState<TemplateDraft>(initial);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weekdayError, setWeekdayError] = useState<{ dayIndex: number; message: string } | null>(
    null
  );
  const [pending, startTransition] = useTransition();
  const leaving = useUnsavedChanges(dirty);

  // U6 — put the feedback where the coach is looking, and announce it.
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!notice && !error) return;
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [notice, error]);

  function edit(next: TemplateDraft) {
    setDraft(next);
    setDirty(true);
    setNotice(null);
    setError(null);
    setWeekdayError(null);
  }
  function editDocument(mutate: (document: Routine) => Routine) {
    edit({ ...draft, document: mutate(draft.document) });
  }
  function editDays(mutate: (days: RoutineTrainingDay[]) => RoutineTrainingDay[]) {
    editDocument((document) => ({ ...document, trainingDays: mutate(document.trainingDays) }));
  }
  function editDay(dayIndex: number, mutate: (day: RoutineTrainingDay) => RoutineTrainingDay) {
    editDays((days) => days.map((day, i) => (i === dayIndex ? mutate(day) : day)));
  }

  /**
   * The weekday duplicate is REFUSED with its reason and the previous value stands —
   * the same rule as the routine editor, for the same hard reason: `RoutinePlanWriter`
   * keys a map on `dayOfWeek`, so two days on one weekday silently collapse into one.
   * A template that can hold the collision produces it on every trainee it is used on.
   */
  function setWeekday(dayIndex: number, dayOfWeek: number) {
    const clash = draft.document.trainingDays.some(
      (day, i) => i !== dayIndex && day.dayOfWeek === dayOfWeek
    );
    if (clash) {
      setWeekdayError({ dayIndex, message: copy.routine.weekdayTaken(isoWeekdayLabel(dayOfWeek)) });
      return;
    }
    editDay(dayIndex, (day) => ({ ...day, dayOfWeek }));
  }

  function onPick(picked: CatalogExercise) {
    const target = picker;
    if (!target) return;
    if (target.mode === "replace") setPicker(null);
    editDay(target.dayIndex, (day) => {
      if (target.mode === "add") {
        // The bound is enforced on the control; this is the belt to that brace, and it
        // refuses rather than truncating — nothing here ever drops a prescription.
        if (day.exercises.length >= MAX_EXERCISES_PER_DAY) return day;
        return { ...day, exercises: [...day.exercises, newExercise(picked.name)] };
      }
      return {
        ...day,
        exercises: day.exercises.map((ex, i) =>
          // A replace keeps the prescription — sets, reps, rest, and every field the
          // coach has authored — and changes the exercise. Same rule as EV-201 AC2.
          i === target.exerciseIndex ? { ...ex, name: picked.name } : ex
        ),
      };
    });
  }

  const reasons = publishabilityReasons(draft);
  const saveable = reasons.length === 0;

  function save() {
    if (!saveable) return;
    startTransition(async () => {
      const body = forSave(draft);
      const result = await settled(
        templateId ? updateTemplateAction(templateId, body) : createTemplateAction(body),
        { ok: false, code: "FAILED" } as const
      );
      if (!result.ok) {
        // A FAILED save leaves the unsaved flag standing: the coach is still holding
        // work the server has not got.
        setError(FAILURE_COPY[result.code]);
        return;
      }
      setError(null);
      setNotice(copy.templates.saved);
      setDirty(false);
      if (templateId === null) {
        /**
         * A create becomes an edit — WITHOUT a router navigation.
         *
         * `router.replace("/templates/{id}")` is the obvious move and it is wrong here:
         * it unmounts this island, so the "Template saved" confirmation the coach just
         * earned is destroyed by the navigation that follows it, and they are left on a
         * new URL with no sign that anything happened. Measured, not assumed — it is
         * what the first cut of this did.
         *
         * `history.replaceState` corrects the URL without a remount, so a reload or a
         * shared link lands on `/templates/{id}` and cannot create a second template,
         * and the Back button still goes to the library. The unsaved-changes guard's
         * sentinel is released FIRST — a `replaceState` over the sentinel entry would
         * leave the guard holding a history entry that no longer points where it thinks.
         */
        const id = result.template.id;
        leaving.release(() => {
          setTemplateId(id);
          window.history.replaceState(window.history.state, "", `/templates/${id}`);
        });
        return;
      }
      leaving.release(() => router.refresh());
    });
  }

  const days = draft.document.trainingDays;
  const addDayRefusal =
    firstFreeWeekday(days) === null
      ? copy.routine.allWeekdaysUsed
      : days.length >= MAX_TRAINING_DAYS
        ? copy.templates.dayCountBound
        : null;

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <label style={{ display: "block", minWidth: 0, flex: "1 1 260px" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
              {copy.templates.nameLabel}
            </div>
            <input
              value={draft.name}
              title={draft.name}
              maxLength={TEMPLATE_NAME_MAX}
              onChange={(e) => edit({ ...draft, name: e.target.value })}
              style={{
                height: MIN_TOUCH_TARGET,
                // See RoutineFields' DayFocusField: the label is the flex item that
                // shrinks, so the input must be told to follow it.
                width: "100%",
                minWidth: 0,
                maxWidth: 360,
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
          </label>
          {dirty && <Badge tone="red">{copy.templates.unsavedBadge}</Badge>}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <Button icon="check" onClick={save} disabled={pending || !saveable}>
            {pending ? copy.templates.saving : copy.templates.save}
          </Button>
        </div>

        {/*
          🔴 ADR-0016 §Amendment V1b's cost, stated on the screen that pays it.

          The server accepts only a publishable template, so there is no autosave and
          nothing here reaches it until Save is pressed. A coach who does not know that
          loses a tab and blames the product; a Save that looks pressable and then 400s
          is the failure AC2 forbids by name for the 13th exercise, applied to the
          document as a whole.
        */}
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          {copy.templates.localOnly}
        </p>
        {!saveable && (
          <div style={{ marginTop: 10 }}>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>
              {copy.templates.notSaveableYet}
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
        AC4's other half: every field the document CARRIES is on screen and editable.
        `goal` and `level` are closed lists because downstream reads them as
        `PrimaryGoal` and `FitnessLevel`; a free text box would store a value nothing
        understands and the coach would never find out.
      */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <TextField
            label={copy.templates.documentNameLabel}
            value={draft.document.name}
            width={220}
            onChange={(name) => editDocument((document) => ({ ...document, name }))}
          />
          <SelectField
            label={copy.templates.goalLabel}
            value={draft.document.goal}
            options={GOALS}
            onChange={(goal) => editDocument((document) => ({ ...document, goal }))}
          />
          <SelectField
            label={copy.templates.levelLabel}
            value={draft.document.level}
            options={LEVELS}
            onChange={(level) => editDocument((document) => ({ ...document, level }))}
          />
          <NumberField
            label={copy.templates.minutesLabel}
            value={draft.document.constraints.minutesPerSession}
            min={1}
            max={240}
            onChange={(minutesPerSession) =>
              editDocument((document) => ({
                ...document,
                constraints: { ...document.constraints, minutesPerSession },
              }))
            }
          />
        </div>
        <label style={{ display: "block", marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 5 }}>
            {copy.templates.summaryLabel}
          </div>
          <textarea
            value={draft.document.summary ?? ""}
            rows={2}
            onChange={(e) =>
              editDocument((document) => ({
                ...document,
                // An empty box is the ABSENCE of a summary, not an empty string: the
                // wire field is nullable and a "" would be a summary that renders as a
                // blank line wherever a summary is rendered.
                summary: e.target.value.trim() === "" ? null : e.target.value,
              }))
            }
            style={{
              width: "100%",
              minWidth: 0,
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border-2)",
              background: "var(--surface)",
              padding: "8px 10px",
              fontFamily: "var(--font-body)",
              fontSize: 13.5,
              color: "var(--ink)",
              resize: "vertical",
            }}
          />
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{copy.templates.summaryHint}</span>
        </label>
      </Card>

      <div style={{ margin: "0 0 12px" }}>
        <h2 className="dt" style={{ margin: 0, fontSize: 15.5, fontWeight: 600, color: "var(--ink)" }}>
          {copy.routine.trainingDaysHeading}
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          {copy.routine.trainingDaysNote}
        </p>
        {days.length <= MIN_TRAINING_DAYS && (
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
            {copy.templates.dayCountBound}
          </p>
        )}
      </div>

      {days.map((day, dayIndex) => (
        // Keyed on POSITION: `dayOfWeek` is editable, and a key that changes remounts
        // the card and steals focus from the select the coach just used.
        <Card key={dayIndex} style={{ marginBottom: 14 }}>
          {/* A named group per day, for the same reason the exercise rows have one. */}
          <div role="group" aria-label={copy.routine.dayLabel(dayIndex + 1)}>
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
              <WeekdaySelect
                dayIndex={dayIndex}
                value={day.dayOfWeek}
                onChange={(dayOfWeek) => setWeekday(dayIndex, dayOfWeek)}
              />
              <DayFocusField
                dayIndex={dayIndex}
                value={day.focus}
                onChange={(focus) => editDay(dayIndex, (d) => ({ ...d, focus }))}
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
              title={days.length <= MIN_TRAINING_DAYS ? copy.templates.dayCountBound : undefined}
              disabled={days.length <= MIN_TRAINING_DAYS}
              onClick={() => editDays((list) => list.filter((_, i) => i !== dayIndex))}
            >
              {copy.routine.removeDay}
            </Button>
          </div>

          {weekdayError?.dayIndex === dayIndex && (
            <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: "var(--err-ink)" }}>
              {weekdayError.message}
            </p>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            {day.exercises.map((exercise, exerciseIndex) => (
              <div
                key={`${exercise.name}-${exerciseIndex}`}
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
                <span
                  title={exercise.name}
                  style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", minWidth: 0 }}
                >
                  {truncateName(exercise.name)}
                </span>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <NumberField
                    label={copy.routine.sets}
                    value={exercise.sets}
                    onChange={(sets) =>
                      editExercise(dayIndex, exerciseIndex, (ex) => ({ ...ex, sets }))
                    }
                  />
                  <TextField
                    label={copy.routine.reps}
                    value={exercise.reps ?? ""}
                    onChange={(reps) =>
                      editExercise(dayIndex, exerciseIndex, (ex) => ({
                        // `reps` is nullable on the wire — a DURATION exercise has none
                        // — so an emptied field is null and not "".
                        ...ex,
                        reps: reps.trim() === "" ? null : reps,
                      }))
                    }
                  />
                  <TextField
                    label={copy.routine.rest}
                    value={exercise.rest}
                    onChange={(rest) =>
                      editExercise(dayIndex, exerciseIndex, (ex) => ({ ...ex, rest }))
                    }
                  />
                  <TextField
                    label={copy.templates.tempoLabel}
                    value={exercise.tempo ?? ""}
                    onChange={(tempo) =>
                      editExercise(dayIndex, exerciseIndex, (ex) => ({
                        ...ex,
                        tempo: tempo.trim() === "" ? null : tempo,
                      }))
                    }
                  />
                  <TextField
                    label={copy.templates.weightLabel}
                    value={exercise.weight ?? ""}
                    onChange={(weight) =>
                      editExercise(dayIndex, exerciseIndex, (ex) => ({
                        ...ex,
                        weight: weight.trim() === "" ? null : weight,
                      }))
                    }
                  />
                  <SelectField
                    label={copy.templates.trackingLabel}
                    value={exercise.trackingType ?? "WEIGHT_REPS"}
                    options={["WEIGHT_REPS", "DURATION"] as const}
                    labels={{
                      WEIGHT_REPS: copy.templates.trackingWeightReps,
                      DURATION: copy.templates.trackingDuration,
                    }}
                    onChange={(value) =>
                      editExercise(dayIndex, exerciseIndex, (ex) => ({
                        ...ex,
                        trackingType: value === "DURATION" ? "DURATION" : "WEIGHT_REPS",
                      }))
                    }
                  />
                  {exercise.trackingType === "DURATION" && (
                    <NumberField
                      label={copy.templates.durationLabel}
                      value={exercise.durationSeconds ?? 60}
                      min={1}
                      max={3600}
                      onChange={(durationSeconds) =>
                        editExercise(dayIndex, exerciseIndex, (ex) => ({ ...ex, durationSeconds }))
                      }
                    />
                  )}
                </div>

                {/*
                  AC4 — a per-exercise note is free text the document CARRIES, so it is
                  on screen and editable. "Text that cannot be shown must not be stored."
                */}
                <label style={{ display: "block" }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 5 }}
                  >
                    {copy.templates.notesLabel}
                  </div>
                  <input
                    aria-label={`${copy.templates.notesLabel}: ${exercise.name}`}
                    value={exercise.notes ?? ""}
                    onChange={(e) =>
                      editExercise(dayIndex, exerciseIndex, (ex) => ({
                        ...ex,
                        notes: e.target.value.trim() === "" ? null : e.target.value,
                      }))
                    }
                    style={{ ...FIELD_STYLE, width: "100%", minWidth: 0 }}
                  />
                </label>

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
                      editDay(dayIndex, (d) => ({
                        ...d,
                        exercises: d.exercises.filter((_, i) => i !== exerciseIndex),
                      }))
                    }
                  >
                    {copy.routine.remove}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/*
            AC2, verbatim: at 12 the control is UNAVAILABLE and reads
            "12 exercises is the most in one day." — "it is never a control that looks
            pressable and then fails".
          */}
          <div style={{ marginTop: 12 }}>
            <Button
              variant="soft"
              icon="plus"
              disabled={day.exercises.length >= MAX_EXERCISES_PER_DAY}
              title={
                day.exercises.length >= MAX_EXERCISES_PER_DAY ? copy.templates.dayFull : undefined
              }
              onClick={() => setPicker({ mode: "add", dayIndex })}
            >
              {copy.routine.addExercise}
            </Button>
            {day.exercises.length >= MAX_EXERCISES_PER_DAY && (
              <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
                {copy.templates.dayFull}
              </p>
            )}
          </div>
          </div>
        </Card>
      ))}

      <Button
        variant="secondary"
        icon="plus"
        title={addDayRefusal ?? undefined}
        disabled={addDayRefusal !== null}
        onClick={() => {
          const next = firstFreeWeekday(days);
          if (next === null) return;
          editDays((list) => [...list, emptyDay(next)]);
        }}
      >
        {copy.routine.addDay}
      </Button>
      {addDayRefusal && (
        <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>{addDayRefusal}</p>
      )}

      <p style={{ margin: "14px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
        {copy.templates.rowSummary(days.length, exerciseCount(draft.document))}
      </p>

      <CatalogPicker
        open={picker !== null}
        keepOpen={picker?.mode === "add"}
        title={picker?.mode === "replace" ? copy.routine.catalogReplaceTitle : copy.routine.catalogTitle}
        onClose={() => setPicker(null)}
        onPick={onPick}
      />

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
    </div>
  );

  function editExercise(
    dayIndex: number,
    exerciseIndex: number,
    mutate: (exercise: RoutineTrainingDay["exercises"][number]) => RoutineTrainingDay["exercises"][number]
  ) {
    editDay(dayIndex, (day) => ({
      ...day,
      exercises: day.exercises.map((ex, i) => (i === exerciseIndex ? mutate(ex) : ex)),
    }));
  }

  function move(dayIndex: number, from: number, to: number) {
    editDay(dayIndex, (day) => {
      if (to < 0 || to >= day.exercises.length) return day;
      const next = [...day.exercises];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...day, exercises: next };
    });
  }
}

/** A closed vocabulary rendered as a select. `labels` maps a wire token to a word. */
function SelectField<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly T[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 5 }}>
        {label}
      </div>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...FIELD_STYLE, width: "auto", minWidth: 120 }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}
