import type { Copy } from "./copy";
import type { Routine } from "./coachApi";
import { isoWeekdayLabel } from "./format";

/**
 * The routine write path's refusals, as values — and the sentence each one reads as.
 *
 * Pure and client-safe on purpose: the api's error is duck-typed rather than matched
 * with `instanceof ApiError` (which lives in a `server-only` module), so the whole
 * mapping runs in a unit test with no server, no browser and no fixture
 * (`qa/routine-draft-contract.spec.ts`). The server actions in `routineActions.ts` call
 * `routineFailure` on whatever `coachApi` threw; the editor calls `failureSentence` on
 * what came back.
 *
 * Each refusal keeps its own shape because each has its own sentence, and three of them
 * carry `details` the sentence needs (ADR-0013's `{code, message, details}` envelope).
 * A sentence NEVER quotes the api's `message`: it is English, written for a developer,
 * and for `COACH_DRAFT_SUBJECT_FIELD` the api deliberately keeps the value out of it —
 * the portal keeps the value out of its own words too.
 */
export type RoutineFailure =
  /** 403 — access ended (ADR-0015 D5: one body for every denial). */
  | { code: "ACCESS_DENIED" }
  /** 400 COACH_PLAN_EMPTY — EV-184 AC4. */
  | { code: "PLAN_EMPTY" }
  /** 503 CATALOG_UNAVAILABLE — publish and search refuse against an empty catalog. */
  | { code: "CATALOG_UNAVAILABLE" }
  /** 409 COACH_PUBLISH_REPAIRS_UNACKNOWLEDGED — the draft moved between preview and publish. */
  | { code: "REPAIRS_UNACKNOWLEDGED" }
  /**
   * 409 COACH_DRAFT_EXISTS — somebody (another tab, another device, a template apply)
   * saved this trainee's draft after this editor last read it (ADR-0018 D6). Nothing
   * was written. `existingUpdatedAt` is the token a CONFIRMED overwrite echoes; null
   * when the api sent none, and then the portal must not retry blind.
   */
  | { code: "DRAFT_EXISTS"; existingUpdatedAt: string | null }
  /** 400 COACH_DRAFT_SUBJECT_FIELD — the body carried the trainee's own equipment/injuries. */
  | { code: "SUBJECT_FIELD"; field: string | null }
  /** 400 COACH_DRAFT_REPS_ON_DURATION — a timed exercise carried reps (D9). */
  | { code: "REPS_ON_DURATION"; dayOfWeek: number | null; exerciseIndex: number | null }
  /** 400 VALIDATION_ERROR — `@Valid Routine` refused the document. */
  | { code: "INVALID" }
  /** Anything else, including a dropped connection. */
  | { code: "FAILED" };

export type RoutineFailureCode = RoutineFailure["code"];

/** The api error's shape as far as this module reads it. */
interface ErrorLike {
  status?: unknown;
  code?: unknown;
  details?: unknown;
}

function detail(err: ErrorLike, key: string): unknown {
  const details = err.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  return (details as Record<string, unknown>)[key];
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/** What `coachApi` threw → this surface's vocabulary. The api's codes are read here only. */
export function routineFailure(thrown: unknown): RoutineFailure {
  const err = (thrown && typeof thrown === "object" ? thrown : {}) as ErrorLike;
  switch (err.code) {
    case "COACH_DRAFT_EXISTS": {
      const at = detail(err, "existingUpdatedAt");
      return { code: "DRAFT_EXISTS", existingUpdatedAt: typeof at === "string" && at !== "" ? at : null };
    }
    case "COACH_DRAFT_SUBJECT_FIELD": {
      const field = detail(err, "field");
      return { code: "SUBJECT_FIELD", field: typeof field === "string" ? field : null };
    }
    case "COACH_DRAFT_REPS_ON_DURATION":
      return {
        code: "REPS_ON_DURATION",
        dayOfWeek: int(detail(err, "dayOfWeek")),
        exerciseIndex: int(detail(err, "exerciseIndex")),
      };
    case "COACH_PLAN_EMPTY":
      return { code: "PLAN_EMPTY" };
    case "CATALOG_UNAVAILABLE":
      return { code: "CATALOG_UNAVAILABLE" };
    case "COACH_PUBLISH_REPAIRS_UNACKNOWLEDGED":
      return { code: "REPAIRS_UNACKNOWLEDGED" };
    case "VALIDATION_ERROR":
      return { code: "INVALID" };
  }
  if (err.status === 403) return { code: "ACCESS_DENIED" };
  return { code: "FAILED" };
}

/** Which write the coach pressed — the generic failure says which one did not happen. */
export type RoutineWrite = "save" | "publish";

/**
 * The sentence a refusal reads as, EN or FR by `copy`.
 *
 * `document` is the working copy the refused body was built from, so a timed exercise
 * with reps is named by its NAME and weekday rather than by the api's 0-based index —
 * a coach reads "Monday's Plank", not "exercise 0 on day 1". The index is resolved
 * against the document that was SENT, which is the one the api counted in.
 *
 * `DRAFT_EXISTS` and `ACCESS_DENIED` are not sentences: the first opens the conflict
 * dialog and the second leaves the page. They still map to something readable, so a
 * caller that falls through never prints an empty line.
 */
export function failureSentence(
  failure: RoutineFailure,
  write: RoutineWrite,
  document: Routine | null,
  copy: Copy
): string {
  switch (failure.code) {
    case "PLAN_EMPTY":
      return copy.routine.planEmpty;
    case "CATALOG_UNAVAILABLE":
      return copy.routine.catalogUnavailable;
    case "DRAFT_EXISTS":
      return copy.routine.conflictUnreadable;
    case "ACCESS_DENIED":
      return copy.client.notFound;
    case "SUBJECT_FIELD":
      return copy.routine.subjectField(
        failure.field === "constraints.injuries" ? copy.routine.injuries : copy.routine.equipment
      );
    case "REPS_ON_DURATION": {
      const day =
        failure.dayOfWeek === null
          ? null
          : (document?.trainingDays.find((d) => d.dayOfWeek === failure.dayOfWeek) ?? null);
      const exercise =
        day && failure.exerciseIndex !== null ? (day.exercises[failure.exerciseIndex] ?? null) : null;
      if (failure.dayOfWeek === null || !exercise) return copy.routine.repsOnDurationUnlocated;
      return copy.routine.repsOnDuration(isoWeekdayLabel(failure.dayOfWeek, copy.locale), exercise.name);
    }
    case "INVALID":
      return copy.routine.invalid;
    case "REPAIRS_UNACKNOWLEDGED":
    case "FAILED":
      return write === "save" ? copy.routine.saveFailed : copy.routine.publishFailed;
  }
}
