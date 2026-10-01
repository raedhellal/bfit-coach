"use client";

import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui/kit";
import { CatalogPicker } from "./CatalogPicker";
import {
  DayFocusField,
  FIELD_STYLE,
  NumberField,
  OptionalNumberField,
  SelectField,
  TextField,
  WeekdaySelect,
} from "./RoutineFields";
import { useCopy } from "@/lib/i18n/client";
import { isoWeekdayLabel, truncateName } from "@/lib/format";
import { equipmentLabel, musclesLabel } from "@/lib/catalogLabels";
import {
  GOALS,
  LEVELS,
  MIN_TRAINING_DAYS,
  MAX_TRAINING_DAYS,
  emptyDay,
  exerciseCount,
  firstFreeWeekday,
  isDuration,
  newExercise,
  withTrackingType,
} from "@/lib/routineDocument";
import type { CatalogExercise, Routine, RoutineExercise, RoutineTrainingDay } from "@/lib/coachApi";

/**
 * THE routine editor — one component, used by both coach editors (BUG-195c AC3.3,
 * ADR-0018 D7: "the routine editor is TemplateEditor… lifted as a shared component, not
 * a copy").
 *
 * `TemplateEditor` (the coach's library) and `RoutineEditor` (a trainee's draft) are
 * now SHELLS around this: each owns its own persistence — a template save, or a draft
 * save with a staleness token and the two-phase publish — and nothing else. Everything a
 * coach can see and change in a `Routine` is here, once. Two coach editors of one
 * document that drift apart is the defect ADR-0018 spent round 2 correcting at the api
 * layer; a second copy of this file would re-create it at the web layer.
 *
 * Every component of `Routine` is in exactly one of three sets, and
 * `src/lib/routineVisibility.ts` is where that is written down and checked:
 *   · CONTROLLED — a control below (the list names it);
 *   · DERIVED_BY_FORSAVE — computed by the save's body builder, not by the coach;
 *   · CARRIED_UNSEEN — `weeklyProgression`, with ADR-0018 D10's reason. It is carried
 *     untouched, and this component SAYS that it is (`progressionCarried`), so a coach
 *     is never surprised that something they cannot edit is part of what they publish.
 *
 * The ONE difference between the two editors is D7.1 and it is a prop, `subject`:
 *   · a TEMPLATE describes nobody, so the coach authors `goal` and `level`;
 *   · a TRAINEE's draft describes a person, so `goal` and `level` are THEIR answers,
 *     resolved by the server on every save, and shown here read-only and labelled as
 *     coming from their profile. (Their equipment and injuries are shown read-only by
 *     the page, above the editor, and are never in this component's reach.)
 *
 * Stateless about the document: the parent holds it and every change goes through
 * `onChange`, which is where the parent's unsaved-changes flag is raised. The only state
 * here is UI state — which picker is open, a refused weekday, and the catalog badges of
 * exercises picked in this session (the wire carries no catalog identity, so those
 * badges are lost on reload by design; see `RoutineExercise` in coachApi.ts).
 */

type PickerTarget =
  | { mode: "add"; dayIndex: number }
  | { mode: "replace"; dayIndex: number; exerciseIndex: number };

export type DocumentSubject =
  | { kind: "template" }
  /**
   * `resolved` is false only for a plan built from scratch that has never been saved:
   * its goal and level are the request's placeholders, so the fields say when they will
   * be set rather than printing a placeholder as the trainee's goal.
   */
  | { kind: "trainee"; resolved: boolean };

export function RoutineDocumentEditor({
  document,
  onChange,
  subject,
  dayCountBound,
  maxExercisesPerDay,
  unbindable,
  showDocumentName = false,
  replaceHint = false,
  showRowSummary = false,
}: {
  document: Routine;
  onChange: (next: Routine) => void;
  subject: DocumentSubject;
  /** The 2–6 bound in the editor's own words ("A plan has…" / "A template has…"). */
  dayCountBound: string;
  /** Templates only (12). A trainee draft has no per-day cap. */
  maxExercisesPerDay?: number;
  /**
   * EV-188 AC5 — lower-cased exercise names the catalogue would not match today, marked
   * IN PLACE. Nothing is removed on it; Replace and Remove are the row's own controls.
   */
  unbindable?: ReadonlySet<string>;
  /** A template has a library name AND a routine name; a trainee's plan has one name. */
  showDocumentName?: boolean;
  /** EV-201 AC2's per-day hint over the Replace controls. */
  replaceHint?: boolean;
  /** The template editor's "{days} · {exercises}" line. */
  showRowSummary?: boolean;
}) {
  const copy = useCopy();
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [weekdayError, setWeekdayError] = useState<{ dayIndex: number; message: string } | null>(
    null
  );
  /** Catalog badges for exercises picked THIS session, by lower-cased name. */
  const [picked, setPicked] = useState<Record<string, CatalogExercise>>({});

  const days = document.trainingDays;

  function change(next: Routine) {
    setWeekdayError(null);
    onChange(next);
  }
  function editDays(mutate: (list: RoutineTrainingDay[]) => RoutineTrainingDay[]) {
    change({ ...document, trainingDays: mutate(document.trainingDays) });
  }
  function editDay(dayIndex: number, mutate: (day: RoutineTrainingDay) => RoutineTrainingDay) {
    editDays((list) => list.map((day, i) => (i === dayIndex ? mutate(day) : day)));
  }
  function editExercise(
    dayIndex: number,
    exerciseIndex: number,
    mutate: (exercise: RoutineExercise) => RoutineExercise
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

  /**
   * EV-190 AC1 — the weekday duplicate is REFUSED with its reason and the previous value
   * stands. `RoutinePlanWriter` keys a map on `dayOfWeek`, so two days on one weekday
   * silently collapse into one on publish — and the same weekdays decide the trainee's
   * rest-day nutrition.
   */
  function setWeekday(dayIndex: number, dayOfWeek: number) {
    const clash = days.some((day, i) => i !== dayIndex && day.dayOfWeek === dayOfWeek);
    if (clash) {
      setWeekdayError({
        dayIndex,
        message: copy.routine.weekdayTaken(isoWeekdayLabel(dayOfWeek, copy.locale)),
      });
      return;
    }
    editDay(dayIndex, (day) => ({ ...day, dayOfWeek }));
  }

  function onPick(exercise: CatalogExercise) {
    const target = picker;
    if (!target) return;
    // EV-190 U4: an ADD leaves the picker open for the next one; a REPLACE is one act.
    if (target.mode === "replace") setPicker(null);
    setPicked((current) => ({ ...current, [exercise.name.toLowerCase()]: exercise }));
    editDay(target.dayIndex, (day) => {
      if (target.mode === "add") {
        // The bound is enforced on the control; this is the belt to that brace, and it
        // refuses rather than truncating — nothing here ever drops a prescription.
        if (maxExercisesPerDay !== undefined && day.exercises.length >= maxExercisesPerDay) return day;
        return { ...day, exercises: [...day.exercises, newExercise(exercise)] };
      }
      // A replace keeps the whole prescription and changes the exercise (EV-201 AC2).
      return {
        ...day,
        exercises: day.exercises.map((ex, i) =>
          i === target.exerciseIndex ? { ...ex, name: exercise.name } : ex
        ),
      };
    });
  }

  const addDayRefusal =
    firstFreeWeekday(days) === null
      ? copy.routine.allWeekdaysUsed
      : days.length >= MAX_TRAINING_DAYS
        ? dayCountBound
        : null;

  return (
    <div>
      {/*
        The document's own fields. Every one the document CARRIES is on screen: a
        control for the coach's, a read-only value for the trainee's, and a sentence
        for the one that is carried unseen.
      */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          {showDocumentName && (
            <TextField
              label={copy.templates.documentNameLabel}
              value={document.name}
              width={220}
              onChange={(name) => change({ ...document, name })}
            />
          )}
          {subject.kind === "template" ? (
            <>
              <SelectField
                label={copy.templates.goalLabel}
                value={document.goal}
                options={GOALS}
                labels={copy.templates.goalLabels}
                onChange={(goal) => change({ ...document, goal })}
              />
              <SelectField
                label={copy.templates.levelLabel}
                value={document.level}
                options={LEVELS}
                labels={copy.templates.levelLabels}
                onChange={(level) => change({ ...document, level })}
              />
            </>
          ) : (
            <>
              {/*
                AC3.4 — read-only, and the page's "From the trainee's profile" sentence
                beneath says whose they are. A real `readOnly` input rather than text, so
                assistive tech and QA both read "read-only" and not merely "text".
              */}
              <ReadOnlyField
                label={copy.templates.goalLabel}
                value={
                  subject.resolved
                    ? (copy.templates.goalLabels[document.goal] ?? document.goal)
                    : copy.routine.subjectOnSave
                }
              />
              <ReadOnlyField
                label={copy.templates.levelLabel}
                value={
                  subject.resolved
                    ? (copy.templates.levelLabels[document.level] ?? document.level)
                    : copy.routine.subjectOnSave
                }
              />
            </>
          )}
          <NumberField
            label={copy.templates.minutesLabel}
            value={document.constraints.minutesPerSession}
            min={1}
            max={240}
            onChange={(minutesPerSession) =>
              change({ ...document, constraints: { ...document.constraints, minutesPerSession } })
            }
          />
        </div>
        {subject.kind === "trainee" && (
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
            {copy.routine.subjectFromProfile}
          </p>
        )}
        <label style={{ display: "block", marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 5 }}>
            {copy.templates.summaryLabel}
          </div>
          <textarea
            aria-label={copy.templates.summaryLabel}
            value={document.summary ?? ""}
            rows={2}
            onChange={(e) =>
              change({
                ...document,
                // An empty box is the ABSENCE of a summary: the wire field is nullable
                // and "" would render as a blank line wherever a summary is shown.
                summary: e.target.value.trim() === "" ? null : e.target.value,
              })
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
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {subject.kind === "template" ? copy.templates.summaryHint : copy.routine.summaryHint}
          </span>
        </label>
        {/* ADR-0018 D10 — CARRIED_UNSEEN, said rather than hidden. */}
        {document.weeklyProgression.length > 0 && (
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
            {copy.routine.progressionCarried(document.weeklyProgression.length)}
          </p>
        )}
      </Card>

      {/*
        AC1 / AC6 — the heading states the KIND of control that sits under it: these
        weekdays are written straight into `plan_schedule` on publish.
      */}
      <div style={{ margin: "0 0 12px" }}>
        <h2 className="dt" style={{ margin: 0, fontSize: 15.5, fontWeight: 600, color: "var(--ink)" }}>
          {copy.routine.trainingDaysHeading}
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
          {copy.routine.trainingDaysNote}
        </p>
        {/* The bound, said ONCE, when the plan is at the bottom of it. */}
        {days.length <= MIN_TRAINING_DAYS && (
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>{dayCountBound}</p>
        )}
      </div>

      {days.map((day, dayIndex) => (
        /**
         * Keyed on POSITION: `dayOfWeek` is editable, and a key that changes remounts the
         * card and steals focus from the select the coach just used. The cards keep their
         * array order and are never re-sorted — the trainee's week is ordered by the
         * weekday itself.
         */
        <Card key={dayIndex} style={{ marginBottom: 14 }}>
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
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
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
                <OptionalNumberField
                  label={copy.routine.estimatedMinutesLabel}
                  ariaLabel={copy.routine.estimatedMinutesName(dayIndex + 1)}
                  value={day.estimatedMinutes}
                  min={1}
                  max={600}
                  onChange={(estimatedMinutes) => editDay(dayIndex, (d) => ({ ...d, estimatedMinutes }))}
                />
                <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                  {copy.routine.exercises(day.exercises.length)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon="trash"
                ariaLabel={copy.common.labelled(copy.routine.removeDay, isoWeekdayLabel(day.dayOfWeek, copy.locale))}
                title={days.length <= MIN_TRAINING_DAYS ? dayCountBound : undefined}
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

            {/* EV-201 AC2 — once per day card, and not over an empty day. */}
            {replaceHint && day.exercises.length > 0 && (
              <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--ink-3)" }}>
                {copy.routine.replaceKeepsPrescription}
              </p>
            )}

            <div style={{ display: "grid", gap: 10 }}>
              {day.exercises.map((exercise, exerciseIndex) => (
                <ExerciseRow
                  key={`${exercise.name}-${exerciseIndex}`}
                  exercise={exercise}
                  first={exerciseIndex === 0}
                  last={exerciseIndex === day.exercises.length - 1}
                  unbindable={unbindable?.has(exercise.name.toLowerCase()) ?? false}
                  picked={picked[exercise.name.toLowerCase()] ?? null}
                  onChange={(mutate) => editExercise(dayIndex, exerciseIndex, mutate)}
                  onMove={(delta) => move(dayIndex, exerciseIndex, exerciseIndex + delta)}
                  onReplace={() => setPicker({ mode: "replace", dayIndex, exerciseIndex })}
                  onRemove={() =>
                    editDay(dayIndex, (d) => ({
                      ...d,
                      exercises: d.exercises.filter((_, i) => i !== exerciseIndex),
                    }))
                  }
                />
              ))}
            </div>

            {/*
              A template's day is capped at 12: at the cap the control is UNAVAILABLE and
              says why — never a control that looks pressable and then fails.
            */}
            <div style={{ marginTop: 12 }}>
              {(() => {
                const full = maxExercisesPerDay !== undefined && day.exercises.length >= maxExercisesPerDay;
                return (
                  <>
                    <Button
                      variant="soft"
                      icon="plus"
                      disabled={full}
                      title={full ? copy.templates.dayFull : undefined}
                      onClick={() => setPicker({ mode: "add", dayIndex })}
                    >
                      {copy.routine.addExercise}
                    </Button>
                    {full && (
                      <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
                        {copy.templates.dayFull}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </Card>
      ))}

      {/*
        AC1's two refusals at the top end, both with a VISIBLE reason: the 2–6 bound, and
        the seven weekdays running out (only reachable on a pre-existing 7-day plan).
      */}
      <Button
        variant="secondary"
        icon="plus"
        title={addDayRefusal ?? undefined}
        disabled={addDayRefusal !== null}
        onClick={() => {
          const next = firstFreeWeekday(days);
          if (next === null) return;
          editDays((list) => [
            ...list,
            emptyDay(
              next,
              subject.kind === "template" ? copy.templates.newDayFocus : copy.routine.newDayFocus
            ),
          ]);
        }}
      >
        {copy.routine.addDay}
      </Button>
      {addDayRefusal && (
        <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>{addDayRefusal}</p>
      )}

      {showRowSummary && (
        <p style={{ margin: "14px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
          {copy.templates.rowSummary(days.length, exerciseCount(document))}
        </p>
      )}

      <CatalogPicker
        open={picker !== null}
        keepOpen={picker?.mode === "add"}
        title={picker?.mode === "replace" ? copy.routine.catalogReplaceTitle : copy.routine.catalogTitle}
        onClose={() => setPicker(null)}
        onPick={onPick}
      />
    </div>
  );
}

/** One prescription: every field `RoutineExercise` carries, in one named group. */
function ExerciseRow({
  exercise,
  first,
  last,
  unbindable,
  picked,
  onChange,
  onMove,
  onReplace,
  onRemove,
}: {
  exercise: RoutineExercise;
  first: boolean;
  last: boolean;
  unbindable: boolean;
  picked: CatalogExercise | null;
  onChange: (mutate: (exercise: RoutineExercise) => RoutineExercise) => void;
  onMove: (delta: number) => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const copy = useCopy();
  const timed = isDuration(exercise);
  /**
   * BUG-490 — the seconds this row held when the coach switched it to « Charge et
   * répétitions ». `withTrackingType` still CLEARS them from the document (a number under
   * a control nobody can see must not travel, so nothing is sent while the mode is
   * Charge), and they are kept HERE, in the row, so switching back to « Durée » brings
   * them back instead of an empty box. A reload starts the row afresh: what was never
   * saved is not remembered.
   */
  const [stashedSeconds, setStashedSeconds] = useState<number | null>(null);
  function changeTracking(value: string) {
    if (value === "DURATION") {
      const restore = stashedSeconds;
      onChange((ex) => {
        const next = withTrackingType(ex, "DURATION");
        return next.durationSeconds === null && restore !== null ? { ...next, durationSeconds: restore } : next;
      });
      return;
    }
    if (timed) setStashedSeconds(exercise.durationSeconds);
    onChange((ex) => withTrackingType(ex, "WEIGHT_REPS"));
  }
  return (
    <div
      /**
       * Each prescription is a named group, named by the exercise's FULL name (not the
       * truncated label), so its fields are tied to it for a screen reader and for QA.
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
        <span title={exercise.name} style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", minWidth: 0 }}>
          {/* Edge case 6: 40+ characters truncate rather than wrapping the row. */}
          {truncateName(exercise.name)}
        </span>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {/* EV-188 AC5 — marked in place; Replace and Remove below both act on it. */}
          {unbindable && <Badge tone="amber">{copy.templates.notInCatalogue}</Badge>}
          {picked?.primaryMuscles && <Badge tone="neutral">{musclesLabel(picked.primaryMuscles, copy)}</Badge>}
          {picked?.equipment && <Badge tone="neutral">{equipmentLabel(picked.equipment, copy)}</Badge>}
        </span>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <NumberField
          label={copy.routine.sets}
          value={exercise.sets}
          onChange={(sets) => onChange((ex) => ({ ...ex, sets }))}
        />
        {/*
          `reps` is a STRING ("8-12", "AMRAP"), nullable on the wire. A timed exercise has
          none, so its Reps field is replaced by Seconds; `forDraftSave` sends `null` for
          any reps an older timed exercise still carries (the plan writer never used them).
        */}
        {!timed && (
          <TextField
            label={copy.routine.reps}
            value={exercise.reps ?? ""}
            onChange={(reps) =>
              onChange((ex) => ({ ...ex, reps: reps.trim() === "" ? null : reps }))
            }
          />
        )}
        {timed && (
          <OptionalNumberField
            label={copy.templates.durationLabel}
            value={exercise.durationSeconds}
            min={1}
            max={3600}
            onChange={(durationSeconds) => onChange((ex) => ({ ...ex, durationSeconds }))}
          />
        )}
        <TextField
          label={copy.routine.rest}
          value={exercise.rest}
          onChange={(rest) => onChange((ex) => ({ ...ex, rest }))}
        />
        <TextField
          label={copy.templates.tempoLabel}
          value={exercise.tempo ?? ""}
          onChange={(tempo) => onChange((ex) => ({ ...ex, tempo: tempo.trim() === "" ? null : tempo }))}
        />
        <TextField
          label={copy.templates.weightLabel}
          value={exercise.weight ?? ""}
          onChange={(weight) =>
            onChange((ex) => ({ ...ex, weight: weight.trim() === "" ? null : weight }))
          }
        />
        <SelectField
          label={copy.templates.trackingLabel}
          value={timed ? "DURATION" : "WEIGHT_REPS"}
          options={["WEIGHT_REPS", "DURATION"] as const}
          labels={{
            WEIGHT_REPS: copy.templates.trackingWeightReps,
            DURATION: copy.templates.trackingDuration,
          }}
          onChange={changeTracking}
        />
      </div>

      {/* "Text that cannot be shown must not be stored" — the note is on screen. */}
      <label style={{ display: "block" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 5 }}>
          {copy.templates.notesLabel}
        </div>
        <input
          aria-label={copy.common.labelled(copy.templates.notesLabel, exercise.name)}
          value={exercise.notes ?? ""}
          onChange={(e) =>
            onChange((ex) => ({ ...ex, notes: e.target.value.trim() === "" ? null : e.target.value }))
          }
          style={{ ...FIELD_STYLE, width: "100%", minWidth: 0 }}
        />
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button
          variant="ghost"
          size="sm"
          icon="up"
          ariaLabel={copy.common.labelled(copy.routine.moveUp, exercise.name)}
          onClick={() => onMove(-1)}
          disabled={first}
        >
          {copy.routine.moveUp}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon="down"
          ariaLabel={copy.common.labelled(copy.routine.moveDown, exercise.name)}
          onClick={() => onMove(1)}
          disabled={last}
        >
          {copy.routine.moveDown}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon="refresh"
          ariaLabel={copy.common.labelled(copy.routine.replace, exercise.name)}
          onClick={onReplace}
        >
          {copy.routine.replace}
        </Button>
        <Button variant="ghost" size="sm" icon="x" ariaLabel={copy.common.labelled(copy.routine.remove, exercise.name)} onClick={onRemove}>
          {copy.routine.remove}
        </Button>
      </div>
    </div>
  );
}

/** A value the coach can read and not change (AC3.4). */
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 5 }}>
        {label}
      </div>
      <input
        readOnly
        aria-readonly="true"
        value={value}
        title={value}
        style={{
          ...FIELD_STYLE,
          width: "auto",
          minWidth: 140,
          background: "var(--surface-2)",
          color: "var(--ink-2)",
        }}
      />
    </label>
  );
}
