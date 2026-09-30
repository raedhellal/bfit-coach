import type { Copy } from "./copy";
import type {
  CatalogExercise,
  CoachRoutineDraftRequest,
  Routine,
  RoutineConstraints,
  RoutineExercise,
  RoutineTrainingDay,
  TrackingType,
} from "./coachApi";

/**
 * The routine DOCUMENT as both coach editors hold it, and the one place it is turned
 * back into a request body.
 *
 * ── What changed with BUG-195c, and why this module is now two-way ─────────────────
 *
 * This file used to map the api's `Routine` DOWN to a flatter editor model (name + days
 * + sets/reps/rest) and said in its own header that the reverse could not be written
 * honestly: rebuilding a `Routine` from that projection would invent a trainee's goal
 * and level and would silently delete `tempo`, `notes`, `trackingType`,
 * `durationSeconds`, `weight` and `estimatedMinutes` from their plan. That is why
 * "Save draft" and Publish sent two of eight fields and were a 400 against every real
 * api since EV-184b shipped (BUG-195).
 *
 * ADR-0018 removed both reasons, and this module is the portal half of that:
 *
 *   · There is no projection. The editor's state IS the `Routine`, every field that
 *     survives a round trip has a control (`src/components/routine/
 *     RoutineDocumentEditor.tsx`), and the one field that does not — the trainee's own
 *     `weeklyProgression` — is carried untouched and DECLARED in
 *     `src/lib/routineVisibility.ts` (guard 4-e).
 *   · `goal` and `level` are the TRAINEE's and the SERVER resolves them (D3). The
 *     portal sends whatever it was served — or, for a plan built from scratch, the
 *     placeholders below — and renders what the response carries. It invents nothing
 *     it then shows as fact: an unsaved from-scratch plan says "set from their profile
 *     when you save" instead of printing a placeholder as the trainee's goal.
 *
 * Client-safe: TYPES only from `coachApi.ts`, which is `server-only`.
 */

/** `TrainingDayBounds` in the api: a plan — and a template — is 2 to 6 training days. */
export const MIN_TRAINING_DAYS = 2;
export const MAX_TRAINING_DAYS = 6;

/** `RoutineExercise.sets` is `@Min(1) @Max(20)`. */
export const MIN_SETS = 1;
export const MAX_SETS = 20;

/**
 * The goal and level a FROM-SCRATCH draft is sent with. `Routine.goal`/`.level` are
 * `@NotBlank`, so the body must carry something, and ADR-0018 D9 says what: *"send what
 * you were served; the server decides"*. A from-scratch plan was served nothing, so it
 * sends the api's own missing-profile defaults (`CoachDraftResolution.DEFAULT_GOAL` /
 * `DEFAULT_LEVEL`) — values the api already knows, never shown to the coach as the
 * trainee's, and overwritten by the trainee's real answers in the save's response.
 */
export const UNRESOLVED_GOAL = "GET_STRONGER";
export const UNRESOLVED_LEVEL = "BEGINNER";

/**
 * `PrimaryGoal` — the api's own enum. `Routine.goal` is `@NotBlank`, not enum-checked at
 * the DTO, but downstream reads it as one of these, so a template's control is a closed
 * list and not a text box: a coach typing "bulking" would store a value nothing reads.
 */
export const GOALS = ["BUILD_MUSCLE", "LOSE_WEIGHT", "GET_STRONGER", "ENDURANCE", "MOBILITY"] as const;
/** `FitnessLevel` — same reasoning. */
export const LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;

/** The session length a from-scratch plan starts at — the coach's field (A3.1), on screen. */
export const DEFAULT_MINUTES_PER_SESSION = 45;

export function emptyDay(dayOfWeek: number, focus: string): RoutineTrainingDay {
  return { dayOfWeek, focus, estimatedMinutes: null, exercises: [] };
}

/** The first weekday not already used, or null when all seven are taken. */
export function firstFreeWeekday(days: RoutineTrainingDay[]): number | null {
  const used = new Set(days.map((d) => d.dayOfWeek));
  return [1, 2, 3, 4, 5, 6, 7].find((day) => !used.has(day)) ?? null;
}

export function exerciseCount(document: Routine): number {
  return document.trainingDays.reduce((total, day) => total + day.exercises.length, 0);
}

/**
 * A freshly picked exercise.
 *
 * `trackingType` comes FROM THE CATALOG ROW (ADR-0018 D1's residual, AC3.5): a Plank
 * is picked as DURATION, with no reps and no invented duration — `durationSeconds` is
 * null until the coach prescribes one (D3: "a new DURATION entry gets
 * `durationSeconds: null` rather than a fabricated 60"). Anything else starts as the
 * usual 3 × 8-12, which a coach immediately overrides. A coach may still switch the
 * tracking either way: a timed set of a weighted lift is a legitimate prescription,
 * which is why the api does not override this and the portal does not lock it.
 */
export function newExercise(picked: Pick<CatalogExercise, "name" | "exerciseType">): RoutineExercise {
  const duration = picked.exerciseType === "DURATION";
  return {
    name: picked.name,
    sets: 3,
    reps: duration ? null : "8-12",
    rest: "90s",
    tempo: null,
    notes: null,
    trackingType: duration ? "DURATION" : "WEIGHT_REPS",
    durationSeconds: null,
    weight: null,
  };
}

/**
 * Switching how an exercise is tracked, with the field the new mode hides CLEARED.
 *
 * A DURATION exercise carrying `reps` is `400 COACH_DRAFT_REPS_ON_DURATION` (the plan
 * writer drops them), and a WEIGHT_REPS one carrying `durationSeconds` would be a
 * number stored under a control the coach can no longer see. Both would be a value
 * travelling that nobody is shown, which is the one thing this editor exists to refuse.
 * The coach made the change and the control they were typing in visibly goes with it.
 */
export function withTrackingType(exercise: RoutineExercise, trackingType: TrackingType): RoutineExercise {
  if (trackingType === "DURATION") return { ...exercise, trackingType, reps: null };
  return { ...exercise, trackingType, durationSeconds: null };
}

/** `RoutineExercise.isDuration()` — `DURATION.equalsIgnoreCase(trackingType)`, ported. */
export function isDuration(exercise: RoutineExercise): boolean {
  return String(exercise.trackingType ?? "").toUpperCase() === "DURATION";
}

/**
 * A document that crossed an untyped JSON boundary, made safe to edit.
 *
 * Every nested list and every nullable field is normalised — `exercises` is
 * `@NotEmpty` on the wire, but the 2026-09-18 crash was a field the types promised and
 * the api did not send, so nothing here dereferences on trust. Absent optional fields
 * become `null`, which is what the api stores for "not prescribed".
 *
 * `planName` is the `plans` row's name and wins over the document's own when present:
 * they are two columns and the editor has always shown the plan's.
 */
export function editableDocument(planName: string | null, document: Routine): Routine {
  const days = Array.isArray(document.trainingDays) ? document.trainingDays : [];
  const constraints: Partial<RoutineConstraints> = document.constraints ?? {};
  return {
    name: planName ?? document.name ?? "",
    goal: document.goal ?? UNRESOLVED_GOAL,
    level: document.level ?? UNRESOLVED_LEVEL,
    daysPerWeek: days.length,
    trainingDays: days.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      focus: day.focus ?? "",
      estimatedMinutes: day.estimatedMinutes ?? null,
      exercises: (Array.isArray(day.exercises) ? day.exercises : []).map((exercise) => ({
        name: exercise.name,
        sets: exercise.sets,
        reps: exercise.reps ?? null,
        rest: exercise.rest ?? "",
        tempo: exercise.tempo ?? null,
        notes: exercise.notes ?? null,
        trackingType: exercise.trackingType ?? null,
        durationSeconds: exercise.durationSeconds ?? null,
        weight: exercise.weight ?? null,
      })),
    })),
    weeklyProgression: Array.isArray(document.weeklyProgression) ? document.weeklyProgression : [],
    constraints: {
      equipment: Array.isArray(constraints.equipment) ? constraints.equipment : [],
      injuries: Array.isArray(constraints.injuries) ? constraints.injuries : [],
      minutesPerSession: constraints.minutesPerSession ?? DEFAULT_MINUTES_PER_SESSION,
      daysPerWeek: days.length,
    },
    summary: document.summary ?? null,
  };
}

/**
 * A trainee plan built from scratch (AC1's "Build a plan"): two empty days, the minimum
 * the bound allows. Not saveable until each day has an exercise — the editor lists why
 * rather than letting the server discover it (ADR-0016 V1b's cost, D1 applies it here).
 */
export function blankRoutine(name: string, dayFocus: string): Routine {
  const first = emptyDay(1, dayFocus);
  const days = [first, emptyDay(firstFreeWeekday([first]) ?? 2, dayFocus)];
  return {
    name,
    goal: UNRESOLVED_GOAL,
    level: UNRESOLVED_LEVEL,
    daysPerWeek: days.length,
    trainingDays: days,
    weeklyProgression: [],
    constraints: {
      equipment: [],
      injuries: [],
      minutesPerSession: DEFAULT_MINUTES_PER_SESSION,
      daysPerWeek: days.length,
    },
    summary: null,
  };
}

/**
 * `reps: null` on every DURATION exercise — the ONE place that rule lives, called by BOTH
 * body builders: `forDraftSave` here and `templateDocument.forSave`.
 *
 * The api refuses a timed exercise that carries reps (`400 COACH_DRAFT_REPS_ON_DURATION`,
 * ADR-0018 D9) on the draft save AND on template apply, because the plan writer drops
 * them. The shared editor hides the Reps control for a timed exercise, so a coach can
 * neither see nor clear such a value — which is exactly how the pre-BUG-195c template
 * editor left them behind (every new exercise started "8-12", and switching to
 * DURATION never cleared it; staff review B1). Clearing them at every write means a
 * template saved once in this editor can always be applied.
 *
 * Days with nothing to clear are returned as the same object.
 */
export function withoutDurationReps(days: RoutineTrainingDay[]): RoutineTrainingDay[] {
  return days.map((day) =>
    day.exercises.some((exercise) => isDuration(exercise) && exercise.reps !== null)
      ? {
          ...day,
          exercises: day.exercises.map((exercise) =>
            isDuration(exercise) ? { ...exercise, reps: null } : exercise
          ),
        }
      : day
  );
}

/**
 * THE draft request, built in exactly one place (ADR-0018 D7).
 *
 * The output is the editor's document with six components changed and nothing else
 * (AC3.9 pins it deep-equal otherwise):
 *   · `constraints.equipment` and `constraints.injuries` are `[]`, ALWAYS. They are the
 *     trainee's own answers; a published document carries them since BUG-194, and
 *     echoing them back is `400 COACH_DRAFT_SUBJECT_FIELD` (AC3.10). The portal is
 *     structurally incapable of sending a claim about a trainee's body.
 *   · `daysPerWeek` and `constraints.daysPerWeek` are `trainingDays.length` — the api
 *     derives both anyway, and `@Min(2)/@Max(6)` runs on what is SENT, before that.
 *   · `goal` and `level` travel as they are (served, or the placeholders above) and the
 *     server overwrites them — "resolved", not "sent".
 *   · `reps` is `null` on every DURATION exercise (staff review of BUG-195b). The api
 *     refuses a timed exercise that carries reps (`COACH_DRAFT_REPS_ON_DURATION`),
 *     because the plan writer drops them and a coach would watch a prescription vanish.
 *     No coach can TYPE one here — the Reps field is not rendered for a timed exercise
 *     and switching to DURATION clears it — so the only reps this removes are ones an
 *     older document carried and the trainee's plan already dropped. Nothing a coach
 *     wrote, and nothing a trainee saw, is lost.
 *
 * `token` is the `updatedAt` this save may replace, echoed VERBATIM as the string the
 * api served — never round-tripped through `Date`, which truncates to milliseconds while
 * the api compares microseconds (a parsed token is a 409 on every save). Null means "only
 * if there is no draft". It is a required parameter so no call site can forget it.
 */
export function forDraftSave(document: Routine, token: string | null): CoachRoutineDraftRequest {
  const days = document.trainingDays.length;
  return {
    replacesDraftUpdatedAt: token,
    document: {
      ...document,
      trainingDays: withoutDurationReps(document.trainingDays),
      daysPerWeek: days,
      constraints: {
        ...document.constraints,
        equipment: [],
        injuries: [],
        daysPerWeek: days,
      },
    },
  };
}

/**
 * The server-owned fields of a saved document, laid over the editor's working copy.
 *
 * The 200 carries the STORED document, and the api's own instruction is to re-render
 * from it. But the coach may have typed during the round trip, so the working copy is
 * NOT replaced wholesale (a form that re-seeds from its own save deletes what was typed
 * meanwhile — measured on EV-202b). Only the six components the SERVER decides are
 * taken from the response; everything else the response carries is, by the contract,
 * exactly what was sent, and the working copy is that or newer.
 */
export function withServerFields(working: Routine, stored: Routine | null | undefined): Routine {
  if (!stored) return working;
  return {
    ...working,
    goal: stored.goal ?? working.goal,
    level: stored.level ?? working.level,
    daysPerWeek: working.trainingDays.length,
    constraints: {
      ...working.constraints,
      equipment: Array.isArray(stored.constraints?.equipment) ? stored.constraints.equipment : [],
      injuries: Array.isArray(stored.constraints?.injuries) ? stored.constraints.injuries : [],
      daysPerWeek: working.trainingDays.length,
    },
  };
}

/** Options that differ between the two editors' bounds. */
export interface DocumentRules {
  /** "A plan has…" or "A template has…" — the same bound in each editor's own words. */
  dayCountBound: string;
  /** Templates only (`CoachTemplateTooLargeException`); a trainee draft has no such cap. */
  maxExercisesPerDay?: number;
  /** Templates only (`CoachTemplateDocument.MAX_FREE_TEXT`). */
  maxFreeText?: number;
}

/**
 * Every reason the server would refuse this document, in the coach's words, naming the
 * day (and the exercise) at fault — "invalid" over a six-day plan is a coach hunting.
 *
 * Ported from the api's validation, not approximated: a portal that refuses at a
 * DIFFERENT number than the server either blocks a save the server would take or lets
 * through a 400 it promised would not happen. Empty is not a promise the save succeeds
 * (a 409 or a 403 is a fact only the server holds); it rules out the class of refusal
 * the editor can see coming.
 */
export function documentReasons(document: Routine, copy: Copy, rules: DocumentRules): string[] {
  const reasons: string[] = [];
  if (document.name.trim() === "") reasons.push(copy.templates.documentNameRequired);

  const days = document.trainingDays;
  if (days.length < MIN_TRAINING_DAYS || days.length > MAX_TRAINING_DAYS) {
    reasons.push(rules.dayCountBound);
  }
  days.forEach((day, index) => {
    const n = index + 1;
    if (day.exercises.length === 0) reasons.push(copy.templates.dayEmpty(n));
    if (rules.maxExercisesPerDay !== undefined && day.exercises.length > rules.maxExercisesPerDay) {
      reasons.push(copy.templates.tooLarge(n, day.exercises.length));
    }
    if (day.focus.trim() === "") reasons.push(copy.templates.dayFocusRequired(n));
    for (const exercise of day.exercises) {
      if (!Number.isInteger(exercise.sets) || exercise.sets < MIN_SETS || exercise.sets > MAX_SETS) {
        reasons.push(copy.routine.setsBound(n, exercise.name));
      }
      if ((exercise.rest ?? "").trim() === "") reasons.push(copy.routine.restRequired(n, exercise.name));
    }
  });

  if (new Set(days.map((day) => day.dayOfWeek)).size !== days.length) {
    reasons.push(copy.templates.duplicateWeekday);
  }
  if (!(document.constraints.minutesPerSession > 0)) reasons.push(copy.routine.minutesRequired);
  if (rules.maxFreeText !== undefined && longestFreeText(document) > rules.maxFreeText) {
    reasons.push(copy.templates.freeTextTooLong);
  }
  return reasons;
}

/**
 * `CoachTemplateDocument.longestFreeText`, ported field for field — summary, focus,
 * exercise name and exercise note.
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
