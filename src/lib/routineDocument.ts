import type {
  CoachRoutineDraft,
  Routine,
  RoutineDayEntry,
  RoutineExercise,
  RoutineExerciseEntry,
  RoutinePlanView,
} from "./coachApi";

/**
 * The one place the api's routine DOCUMENT becomes the routine editor's MODEL.
 *
 * It exists because those are two different shapes and pretending otherwise is what
 * produced the live crash of 2026-09-18: `src/lib/coachApi.ts` typed the api's
 * envelope as if it were the editor's model, the fixture obligingly served the
 * invented shape, 106 Playwright tests agreed with it, and the first real response
 * threw inside a server component's render.
 *
 * Read-direction only, deliberately. The reverse — model back to document — is the
 * write path, and it cannot be written honestly today; see the ⛔ block in
 * `coachApi.ts`. A function here that produced a `Routine` would be inventing a
 * trainee's goal and training level, which is the failure this module was extracted
 * to make impossible rather than merely unlikely.
 */

/**
 * One prescription row.
 *
 * `catalogSlug`, `primaryMuscles` and `equipment` are **null**: the wire's
 * `RoutineExercise` carries none of them. That is not a gap to paper over — the
 * catalog identity the coach picked genuinely does not survive a round trip through
 * `generated_routines`, and rendering a guess here would be this surface claiming an
 * exercise is a particular catalog row on no evidence.
 *
 * `reps` is nullable on the wire (a DURATION exercise has none) and the editor's model
 * is a plain string, so a null becomes `""` — an empty field the coach can fill, never
 * the word "null" on a screen.
 */
function toEntry(exercise: RoutineExercise): RoutineExerciseEntry {
  return {
    catalogSlug: null,
    name: exercise.name,
    primaryMuscles: null,
    equipment: null,
    sets: exercise.sets,
    reps: exercise.reps ?? "",
    rest: exercise.rest,
  };
}

function toDay(day: Routine["trainingDays"][number]): RoutineDayEntry {
  return {
    dayOfWeek: day.dayOfWeek,
    focus: day.focus,
    // `exercises` is `@NotEmpty` on the wire, but this list crosses an untyped JSON
    // boundary: an api that answers with a null here must render an empty day, not
    // throw inside the render the way `guardrails` did.
    exercises: Array.isArray(day.exercises) ? day.exercises.map(toEntry) : [],
  };
}

/**
 * The active plan as the editor holds it, or null when there is none.
 *
 * `planId` and `planName` are the ENVELOPE's fields and `document` is the routine —
 * three siblings on `CoachRoutineResponse`, not one nested object. The plan's name
 * comes from `planName` (the `plans` row) and falls back to the document's own `name`,
 * because they are two different columns and a plan row can exist whose name the
 * document disagrees with.
 *
 * Returns null when the document is absent, whatever `planId` says: a plan id with no
 * routine has nothing to edit, and AC1's "No active plan" empty state is the honest
 * answer to it.
 */
export function toPlanView(
  planId: string | null,
  planName: string | null,
  document: Routine | null | undefined
): RoutinePlanView | null {
  if (!document) return null;
  return {
    planId,
    name: planName ?? document.name,
    trainingDays: Array.isArray(document.trainingDays) ? document.trainingDays.map(toDay) : [],
  };
}

/**
 * The saved draft as the editor holds it.
 *
 * A draft has **no `planId`** — it has never been published, so there is no `plans`
 * row for it, and carrying the active plan's id here would make the editor treat the
 * coach's unpublished work as the trainee's live plan.
 *
 * Returns null when either half is missing. `updatedAt` is not decoration: it is the
 * only thing that makes "Draft — not yet published" datable, and a draft document with
 * no timestamp is a response this surface does not understand well enough to render.
 */
export function toDraftView(
  document: Routine | null | undefined,
  updatedAt: string | null | undefined
): CoachRoutineDraft | null {
  const plan = toPlanView(null, null, document);
  if (!plan || !updatedAt) return null;
  return { ...plan, updatedAt };
}
