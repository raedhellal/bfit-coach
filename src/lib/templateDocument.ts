import { copy } from "./copy";
import type {
  CoachTemplateSaveRequest,
  Routine,
  RoutineExercise,
  RoutineTrainingDay,
} from "./coachApi";

/**
 * The template editor's document, its bounds, and the one function that decides whether
 * the server will accept it.
 *
 * ── Why this module exists at all, and why it is not `routineDocument.ts` ────────────
 *
 * `src/lib/routineDocument.ts` maps the api's routine document DOWN to the trainee
 * editor's flatter model, and says in its own header that the reverse direction cannot
 * be written honestly: rebuilding a `Routine` from that projection would invent a
 * trainee's `goal` and `level` and would silently delete `tempo`, `notes`,
 * `trackingType`, `durationSeconds`, `weight` and `estimatedMinutes` from their plan.
 *
 * A template is a different object. It belongs to the COACH, it describes nobody, and
 * AC4 requires from the other side that **nothing travels in a template that the coach
 * cannot see and edit** — "text that cannot be shown must not be stored". So the
 * template editor edits the `Routine` ITSELF, in full, with a control for every field
 * that survives a round trip. There is no projection, so there is nothing to lose, and
 * the fields the ⛔ draft path cannot honestly invent are simply authored by the coach.
 *
 * ── The constraint this module exists to hold, stated once ──────────────────────────
 *
 * ADR-0016 §Amendment 2026-09-21 (V1b) WITHDREW the template validation group. Full
 * `@Valid Routine` runs at the save boundary, so the api accepts only a **publishable**
 * template — and the ADR names the cost it bought rather than hiding it: *"the coach
 * portal cannot use the server as a scratchpad… EV-188b must hold transient invalid
 * state locally."* b-fit-api's QA drove all four refusals (1 day, 1 day with a
 * mismatched `daysPerWeek`, 0 days, and a PUT editing a stored 2-day template down to
 * 1) and every one is a 400.
 *
 * Therefore: **this portal does not autosave, and it does not POST a document it can
 * already see the server will refuse.** `publishabilityReasons` is checked before every
 * write, and the Save control is disabled with those reasons on screen — a control that
 * looks pressable and then fails is the thing AC2 forbids by name for the 13th
 * exercise, and the same rule is applied here to the document as a whole.
 */

/**
 * `CoachTemplateSaveRequest.name`'s `@Size(max = 80)` / `VARCHAR(80)`.
 *
 * ⚠ It counts CHARACTERS in Postgres and UTF-16 CODE UNITS in JavaScript. They agree
 * for everything in the BMP — including Arabic base letters and harakat, which edge
 * case 8 drives — and disagree for anything outside it, i.e. emoji, where JS counts 2
 * and Postgres counts 1. The portal is therefore STRICTER than the server for an emoji
 * name, which is the safe direction: it refuses a name the server would take, rather
 * than promising one it would reject.
 */
export const TEMPLATE_NAME_MAX = 80;

/** `TrainingDayBounds` in the api — the SAME bound a trainee's plan is held to. */
export const MIN_TRAINING_DAYS = 2;
export const MAX_TRAINING_DAYS = 6;

/**
 * AC2 / Ruling 5c — `CoachTemplateTooLargeException.MAX_EXERCISES_PER_DAY`.
 *
 * A bound in the units a coach works in. The refusal it produces is a 400 that names
 * the day and its count; the portal's job is to make that 400 unreachable from the UI
 * by disabling "Add exercise" WITH its reason at 12, rather than by hiding the control.
 */
export const MAX_EXERCISES_PER_DAY = 12;

/**
 * `CoachTemplateDocument.MAX_FREE_TEXT`. Not a product number and it has no AC: it is
 * the backstop that makes the structural bound mean something, because `summary`,
 * `focus` and `notes` carry no `@Size` and a template inside the day/exercise bound
 * could otherwise hold a ten-megabyte summary. It refuses; it never truncates.
 */
export const MAX_FREE_TEXT = 2_000;

/** `PrimaryGoal` — the api's own enum. `Routine.goal` is `@NotBlank`, not enum-checked
 * at the DTO, but downstream reads it as one of these, so the control is a closed list
 * and not a text box. A coach typing "bulking" would store a value nothing understands. */
export const GOALS = ["BUILD_MUSCLE", "LOSE_WEIGHT", "GET_STRONGER", "ENDURANCE", "MOBILITY"] as const;
/** `FitnessLevel` — same reasoning. */
export const LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;

/** The editor's whole state: the library name, and the document under it. */
export interface TemplateDraft {
  name: string;
  document: Routine;
}

/**
 * A brand-new template: two days, the minimum the bound allows, with no exercises.
 *
 * It is deliberately NOT saveable as it stands — `TrainingDay.exercises` is `@NotEmpty`
 * — and the editor says so from the first render rather than at the first press of
 * Save. That is V1b's cost made visible instead of discovered.
 */
export function blankTemplate(): TemplateDraft {
  return {
    name: "",
    document: {
      name: copy.templates.newDocumentName,
      goal: "BUILD_MUSCLE",
      level: "BEGINNER",
      daysPerWeek: 2,
      trainingDays: [emptyDay(1), emptyDay(2)],
      weeklyProgression: [],
      constraints: { equipment: [], injuries: [], minutesPerSession: 45, daysPerWeek: 2 },
      summary: null,
    },
  };
}

export function emptyDay(dayOfWeek: number): RoutineTrainingDay {
  return {
    dayOfWeek,
    focus: copy.templates.newDayFocus,
    estimatedMinutes: null,
    exercises: [],
  };
}

/**
 * A freshly picked exercise. The defaults exist so a new row is never an empty
 * prescription; the five nullable fields start null because the coach has not said
 * anything about them, and null is what the api stores for "not prescribed".
 */
export function newExercise(name: string): RoutineExercise {
  return {
    name,
    sets: 3,
    reps: "8-12",
    rest: "90s",
    tempo: null,
    notes: null,
    trackingType: "WEIGHT_REPS",
    durationSeconds: null,
    weight: null,
  };
}

export function exerciseCount(document: Routine): number {
  return document.trainingDays.reduce((total, day) => total + day.exercises.length, 0);
}

/**
 * The document as the server will store it: `daysPerWeek` reconciled, and the two
 * trainee-answer lists EMPTY.
 *
 * The api strips both lists at the write boundary and refuses a stored row where they
 * are not empty, so sending them empty changes no outcome — and that is exactly why it
 * is done here rather than left to the server. AC4's property is "a template carries no
 * answer a trainee gave about themselves", and the portal being structurally incapable
 * of sending one is a stronger statement than the server throwing it away. There is no
 * code path in this surface that can put a trainee's equipment or injuries into a
 * template body.
 *
 * `daysPerWeek` is reconciled on BOTH `Routine` and `Constraints` because they carry
 * the same `@Min(2)/@Max(6)` and `RoutinePlanWriter.reconcileIdentity` derives the
 * persisted value from `trainingDays.size()` anyway — a document declaring 4 and
 * carrying 1 is what produced BUG-011's opaque 409, and agreeing with the list here
 * makes that unreachable rather than merely unlikely.
 */
export function forSave(draft: TemplateDraft): CoachTemplateSaveRequest {
  const days = draft.document.trainingDays.length;
  return {
    name: draft.name.trim(),
    document: {
      ...draft.document,
      daysPerWeek: days,
      constraints: {
        ...draft.document.constraints,
        equipment: [],
        injuries: [],
        daysPerWeek: days,
      },
    },
  };
}

/**
 * Every reason the server would refuse this document, in the coach's words.
 *
 * Empty means the save will be accepted on these grounds. It is NOT a promise the save
 * succeeds — `COACH_TEMPLATE_NAME_TAKEN` and `COACH_TEMPLATE_LIMIT_REACHED` are facts
 * about the coach's library that only the server holds, and both are handled at the
 * call site. What this rules out is the class of refusal the editor can see coming:
 * the full-publish-contract validation of ADR-0016 V1b.
 *
 * Each sentence names the day it is about where a day is at fault, because "invalid"
 * over a six-day template is a coach hunting.
 */
export function publishabilityReasons(draft: TemplateDraft): string[] {
  const reasons: string[] = [];
  const name = draft.name.trim();
  const document = draft.document;

  if (name === "") reasons.push(copy.templates.nameRequired);
  else if (name.length > 80) reasons.push(copy.templates.nameTooLong);

  if (document.name.trim() === "") reasons.push(copy.templates.documentNameRequired);

  const days = document.trainingDays;
  if (days.length < MIN_TRAINING_DAYS || days.length > MAX_TRAINING_DAYS) {
    reasons.push(copy.templates.dayCountBound);
  }
  days.forEach((day, index) => {
    if (day.exercises.length === 0) reasons.push(copy.templates.dayEmpty(index + 1));
    if (day.exercises.length > MAX_EXERCISES_PER_DAY) {
      reasons.push(copy.templates.tooLarge(index + 1, day.exercises.length));
    }
    if (day.focus.trim() === "") reasons.push(copy.templates.dayFocusRequired(index + 1));
  });

  const weekdays = new Set(days.map((day) => day.dayOfWeek));
  if (weekdays.size !== days.length) reasons.push(copy.templates.duplicateWeekday);

  if (longestFreeText(document) > MAX_FREE_TEXT) reasons.push(copy.templates.freeTextTooLong);

  return reasons;
}

/**
 * `CoachTemplateDocument.longestFreeText`, ported field for field — summary, focus,
 * exercise name and exercise note. Ported rather than approximated because a portal
 * that refuses at a DIFFERENT number than the server does is worse than one that does
 * not check: it either blocks a save the server would take, or lets through a 400 it
 * promised would not happen.
 */
function longestFreeText(document: Routine): number {
  let longest = document.summary?.length ?? 0;
  for (const day of document.trainingDays) {
    longest = Math.max(longest, day.focus.length);
    for (const exercise of day.exercises) {
      longest = Math.max(longest, exercise.name.length, exercise.notes?.length ?? 0);
    }
  }
  return longest;
}

/** The first weekday not already used, or null when all seven are taken. */
export function firstFreeWeekday(days: RoutineTrainingDay[]): number | null {
  const used = new Set(days.map((d) => d.dayOfWeek));
  return [1, 2, 3, 4, 5, 6, 7].find((day) => !used.has(day)) ?? null;
}
