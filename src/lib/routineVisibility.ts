import type {
  ProgressionRule,
  Routine,
  RoutineConstraints,
  RoutineExercise,
  RoutineTrainingDay,
} from "./coachApi";

/**
 * ADR-0018 guard 4-e — THE PORTAL VISIBILITY PARTITION (BUG-195c AC3.7).
 *
 * Every component reachable from `Routine` is in exactly one of three sets:
 *
 *   · CONTROLLED — on screen in the routine editor, in a labelled field: a control the
 *     coach edits or, for the two fields ADR-0018 D3 gives the TRAINEE (`goal`, `level`),
 *     a read-only field labelled as theirs (D7.1). `control` is how QA finds it on the
 *     English page, and `qa/routine-visibility.spec.ts` does, for every entry.
 *   · DERIVED_BY_FORSAVE — computed by `forDraftSave` (`src/lib/routineDocument.ts`),
 *     never typed by the coach: the two day counts, and the trainee's own equipment and
 *     injuries, which are always sent `[]` (D9) and shown read-only by the page.
 *   · CARRIED_UNSEEN — travels in the body without a control. Each entry carries its
 *     REASON, in writing, because a field in this set with no reason is how BUG-211
 *     happened: a progression the coach never saw rode along into somebody else's plan.
 *
 * Why a guard and not a comment: 4-b (the api's partition) asks *"is this the trainee's
 * field?"* and 4-e asks *"can the coach see it?"* — two questions. `weeklyProgression` is
 * green under 4-b (it is genuinely the document's own) and would be red here without an
 * entry, and that is the whole point: neither guard alone would have caught BUG-211.
 *
 * "Exactly one" holds BY CONSTRUCTION — a record has one value per key — and "every
 * component" holds at BUILD time: `satisfies Record<RoutineComponent, Visibility>` fails
 * `tsc` (and therefore `next build`) for a component with no entry, and for an entry
 * naming a component the wire types do not have. The key set is derived from the `@wire`
 * interfaces, and the spec checks it against the vendored api spec too, so a field the
 * api adds reaches this file as a red build rather than as a silent passenger.
 */

type Components<T, Prefix extends string> = `${Prefix}#${Extract<keyof T, string>}`;

/** Every component of the `Routine` graph, named the way the api's partition names them. */
export type RoutineComponent =
  | Components<Routine, "Routine">
  | Components<RoutineConstraints, "Constraints">
  | Components<RoutineTrainingDay, "TrainingDay">
  | Components<RoutineExercise, "RoutineExercise">
  | Components<ProgressionRule, "ProgressionRule">;

export type Visibility =
  | {
      set: "CONTROLLED";
      /** An accessible LABEL on the English routine page, or the start of a BUTTON's name. */
      control: { label: string } | { button: string };
      /** Only rendered in a state the check must set up first (a timed exercise). */
      when?: "DURATION";
    }
  | { set: "DERIVED_BY_FORSAVE"; by: string }
  | { set: "CARRIED_UNSEEN"; reason: string };

/**
 * ADR-0018 D10's sentence — the reason `weeklyProgression` is carried and not cleared on
 * the DRAFT path (it IS cleared on the template path, W-2 / BUG-211).
 */
export const PROGRESSION_REASON =
  "The document stays with its own subject, and clearing it would delete the trainee's own generated progression.";

export const VISIBILITY = {
  "Routine#name": { set: "CONTROLLED", control: { label: "Plan name" } },
  "Routine#goal": { set: "CONTROLLED", control: { label: "Goal" } },
  "Routine#level": { set: "CONTROLLED", control: { label: "Level" } },
  "Routine#daysPerWeek": {
    set: "DERIVED_BY_FORSAVE",
    by: "trainingDays.length — the api derives it too, but validates what is SENT (@Min(2) @Max(6))",
  },
  "Routine#trainingDays": { set: "CONTROLLED", control: { button: "Add day" } },
  "Routine#weeklyProgression": { set: "CARRIED_UNSEEN", reason: PROGRESSION_REASON },
  "Routine#constraints": {
    set: "DERIVED_BY_FORSAVE",
    by: "rebuilt by forDraftSave from its four components, below",
  },
  "Routine#summary": { set: "CONTROLLED", control: { label: "Summary" } },

  "Constraints#equipment": {
    set: "DERIVED_BY_FORSAVE",
    by: "always [] (ADR-0018 D9) — the trainee's own list is shown read-only by the page",
  },
  "Constraints#injuries": {
    set: "DERIVED_BY_FORSAVE",
    by: "always [] (ADR-0018 D9) — the trainee's own list is shown read-only by the page",
  },
  "Constraints#minutesPerSession": { set: "CONTROLLED", control: { label: "Minutes per session" } },
  "Constraints#daysPerWeek": { set: "DERIVED_BY_FORSAVE", by: "trainingDays.length" },

  "TrainingDay#dayOfWeek": { set: "CONTROLLED", control: { label: "Day 1 weekday" } },
  "TrainingDay#focus": { set: "CONTROLLED", control: { label: "Day 1 focus" } },
  "TrainingDay#estimatedMinutes": { set: "CONTROLLED", control: { label: "Day 1 estimated minutes" } },
  "TrainingDay#exercises": { set: "CONTROLLED", control: { button: "Add exercise" } },

  "RoutineExercise#name": { set: "CONTROLLED", control: { button: "Replace:" } },
  "RoutineExercise#sets": { set: "CONTROLLED", control: { label: "Sets" } },
  "RoutineExercise#reps": { set: "CONTROLLED", control: { label: "Reps" } },
  "RoutineExercise#rest": { set: "CONTROLLED", control: { label: "Rest" } },
  "RoutineExercise#tempo": { set: "CONTROLLED", control: { label: "Tempo" } },
  "RoutineExercise#notes": { set: "CONTROLLED", control: { label: "Notes:" } },
  "RoutineExercise#trackingType": { set: "CONTROLLED", control: { label: "Tracked as" } },
  "RoutineExercise#durationSeconds": {
    set: "CONTROLLED",
    control: { label: "Seconds" },
    when: "DURATION",
  },
  "RoutineExercise#weight": { set: "CONTROLLED", control: { label: "Weight" } },

  "ProgressionRule#week": {
    set: "CARRIED_UNSEEN",
    reason: `Reachable only inside Routine#weeklyProgression, and carried with it. ${PROGRESSION_REASON}`,
  },
  "ProgressionRule#adjustment": {
    set: "CARRIED_UNSEEN",
    reason: `Reachable only inside Routine#weeklyProgression, and carried with it. ${PROGRESSION_REASON}`,
  },
  "ProgressionRule#rationale": {
    set: "CARRIED_UNSEEN",
    reason: `Reachable only inside Routine#weeklyProgression, and carried with it. ${PROGRESSION_REASON}`,
  },
} as const satisfies Record<RoutineComponent, Visibility>;
