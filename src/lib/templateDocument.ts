import type { Copy } from "./copy";
import type { CoachTemplateSaveRequest, Routine } from "./coachApi";
import {
  DEFAULT_MINUTES_PER_SESSION,
  MAX_TRAINING_DAYS,
  MIN_TRAINING_DAYS,
  documentReasons,
  emptyDay,
  withoutDurationReps,
} from "./routineDocument";

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

/**
 * `TrainingDayBounds` in the api — the SAME bound a trainee's plan is held to, which is
 * why it lives in `routineDocument.ts` and is only re-exported here.
 */
export { MIN_TRAINING_DAYS, MAX_TRAINING_DAYS };

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

/**
 * `PrimaryGoal` / `FitnessLevel` — the api's own enums, closed lists because downstream
 * reads `Routine.goal`/`.level` as one of these. Defined once, in `routineDocument.ts`.
 */
export { GOALS, LEVELS } from "./routineDocument";

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
export function blankTemplate(copy: Copy): TemplateDraft {
  return {
    name: "",
    document: {
      name: copy.templates.newDocumentName,
      goal: "BUILD_MUSCLE",
      level: "BEGINNER",
      daysPerWeek: 2,
      trainingDays: [emptyDay(1, copy.templates.newDayFocus), emptyDay(2, copy.templates.newDayFocus)],
      weeklyProgression: [],
      constraints: {
        equipment: [],
        injuries: [],
        minutesPerSession: DEFAULT_MINUTES_PER_SESSION,
        daysPerWeek: 2,
      },
      summary: null,
    },
  };
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
      // Staff review B1: a template must never carry reps on a timed exercise, or apply
      // refuses it with COACH_DRAFT_REPS_ON_DURATION — and the editor has no control to
      // clear them. Saving a template once in this editor is the repair.
      trainingDays: withoutDurationReps(draft.document.trainingDays),
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
export function publishabilityReasons(draft: TemplateDraft, copy: Copy): string[] {
  const reasons: string[] = [];
  const name = draft.name.trim();
  if (name === "") reasons.push(copy.templates.nameRequired);
  else if (name.length > TEMPLATE_NAME_MAX) reasons.push(copy.templates.nameTooLong);
  // The document's own rules are the trainee editor's rules too (BUG-195c): one port of
  // the api's validation, in `routineDocument.ts`, so the two editors cannot refuse at
  // different numbers. A template adds the two bounds only the template store has.
  return reasons.concat(
    documentReasons(draft.document, copy, {
      dayCountBound: copy.templates.dayCountBound,
      maxExercisesPerDay: MAX_EXERCISES_PER_DAY,
      maxFreeText: MAX_FREE_TEXT,
    })
  );
}
