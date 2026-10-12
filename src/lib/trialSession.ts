import type {
  CoachTrialSessionRequest,
  CoachTrialSessionResponse,
  ProgrammeStatus,
  RoutineExercise,
  TrialSessionStatus,
} from "./coachApi";
import { withoutDurationReps } from "./routineDocument";

/**
 * EV-341j — the trial session's pure parts: the request body, the card's state, the roster
 * pill and the refusals. Client-safe (type-only imports from `coachApi`), so the card, the
 * roster row and `qa/trial-session-unit.spec.ts` share one reading of the wire.
 */

/** EV-341i: `exercises` holds 1..30 rows. */
export const MAX_TRIAL_EXERCISES = 30;

const PROGRAMME_STATUSES: readonly ProgrammeStatus[] = ["AWAITING_PROGRAMME", "TRIAL_ASSIGNED", "TRIAL_DONE", "PUBLISHED"];
const TRIAL_STATUSES: readonly TrialSessionStatus[] = ["ASSIGNED", "WITHDRAWN", "DONE"];

/**
 * THE trial session request, built in exactly one place: the api refuses any undeclared key
 * (`400 COACH_FIELD_NOT_ACCEPTED`), and a timed exercise that carries reps
 * (`COACH_DRAFT_REPS_ON_DURATION`), as a draft save does. `title`, `plannedOn` and `note` are
 * never sent (J1 names no field for them: the api's defaults apply). `estimatedMinutes` only
 * when the coach gave one. The preview and the assign send the SAME body (the digest is of it).
 */
export function trialSessionBody(exercises: RoutineExercise[], estimatedMinutes: number | null): CoachTrialSessionRequest {
  const [day] = withoutDurationReps([{ dayOfWeek: 1, focus: "", estimatedMinutes: null, exercises }]);
  return estimatedMinutes === null ? { exercises: day.exercises } : { estimatedMinutes, exercises: day.exercises };
}

/** The read, as far as the portal uses it. */
export interface TrialRead {
  programmeStatus: ProgrammeStatus;
  trialSession: { status: TrialSessionStatus; assignedAt: string; completedOn: string | null } | null;
}

/**
 * A read's body, accepted only with every field the card dereferences, in the api's own
 * vocabularies. An unknown status (a newer api) or a missing field is a failed read: the card
 * says the block could not be loaded, never a guess about where the client stands.
 */
export function asTrialRead(body: unknown): TrialRead | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const read = body as Partial<CoachTrialSessionResponse>;
  if (!PROGRAMME_STATUSES.includes(read.programmeStatus as ProgrammeStatus)) return null;
  const t = read.trialSession;
  if (t === null) return { programmeStatus: read.programmeStatus as ProgrammeStatus, trialSession: null };
  if (!t || typeof t !== "object") return null;
  if (!TRIAL_STATUSES.includes(t.status) || typeof t.assignedAt !== "string") return null;
  if (t.completedOn !== null && t.completedOn !== undefined && typeof t.completedOn !== "string") return null;
  return {
    programmeStatus: read.programmeStatus as ProgrammeStatus,
    trialSession: { status: t.status, assignedAt: t.assignedAt, completedOn: t.completedOn ?? null },
  };
}

/** A preview the card may act on: every repair a sentence it can show, and the digest to echo. */
export interface TrialPreview {
  repairs: string[];
  digest: string;
}

/**
 * The preview's answer, accepted only WHOLE (staff r1 S1). The digest is of the repair set the
 * api computed, so the card may echo it only after showing every one of those repairs: a
 * repair that is not a sentence cannot be shown, and dropping it would have the coach
 * acknowledge, by assigning, a repair they never saw (and with nothing left, assign straight
 * on). So ANY non-string repair fails the preview, as does a `repairCount` that disagrees with
 * the list (when the api sends one; the spec requires it, an older api may not). A failed
 * preview shows the error line and assigns nothing.
 */
export function asTrialPreview(body: unknown): TrialPreview | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const preview = body as { repairs?: unknown; repairCount?: unknown; digest?: unknown };
  if (typeof preview.digest !== "string" || !Array.isArray(preview.repairs)) return null;
  const repairs: unknown[] = preview.repairs;
  if (!repairs.every((repair): repair is string => typeof repair === "string")) return null;
  if (preview.repairCount !== undefined && preview.repairCount !== repairs.length) return null;
  return { repairs: repairs as string[], digest: preview.digest };
}

/**
 * What the Programme tab's « Séance d'essai » card shows.
 *
 *   · `prepare`  — J1: AWAITING_PROGRAMME, nothing open: « Préparer une séance d'essai ».
 *   · `assigned` — J3: an ASSIGNED session, « Assignée le {date} » + « Retirer », whatever the
 *                  programme status (I5: a publish leaves it open, and the coach can still
 *                  withdraw it).
 *   · `done`     — J3: « Faite le {date} », linked to the history, and NO control: a done
 *                  session has no prepare path (J3c, which offered one, was withdrawn
 *                  2026-10-12 (d); a second trial session is out of the story's scope).
 *   · `none`     — PUBLISHED with nothing ASSIGNED: no card. A programme is on the Programme tab
 *                  already, and neither J1 nor J3 asks for a trial card then.
 * A DONE session that was withdrawn (a withdraw that lost the race to the completion: I3b)
 * still reads `done`: DONE wins.
 */
export type TrialCardView =
  | { kind: "prepare" }
  | { kind: "assigned"; assignedAt: string }
  | { kind: "done"; completedOn: string | null }
  | { kind: "none" };

export function trialCardView(read: TrialRead): TrialCardView {
  const t = read.trialSession;
  if (t?.status === "ASSIGNED") return { kind: "assigned", assignedAt: t.assignedAt };
  if (read.programmeStatus === "PUBLISHED") return { kind: "none" };
  if (t?.status === "DONE") {
    return { kind: "done", completedOn: t.completedOn };
  }
  return { kind: "prepare" };
}

/** J4 — the roster pill, or null (PUBLISHED, not shared, absent, or a value this portal does not know). */
export type ProgrammePill = Exclude<ProgrammeStatus, "PUBLISHED">;
export function programmePill(status: unknown): ProgrammePill | null {
  return status === "AWAITING_PROGRAMME" || status === "TRIAL_ASSIGNED" || status === "TRIAL_DONE" ? status : null;
}

/** The trial session's writes refused, in this surface's vocabulary. The api's codes are read here only. */
export type TrialFailure =
  /** 403: the link ended or no longer carries WORKOUTS (one body for every denial). */
  | "ACCESS_DENIED"
  /** 409 COACH_PUBLISH_REPAIRS_UNACKNOWLEDGED: the preview the coach saw is not this body's. Preview again. */
  | "REPAIRS_UNACKNOWLEDGED"
  /** 409 TRIAL_SESSION_ALREADY_OPEN: another tab assigned one. Re-read. */
  | "ALREADY_OPEN"
  /** 503 CATALOG_UNAVAILABLE. */
  | "CATALOG_UNAVAILABLE"
  /** Anything else, including a 400 and a lost answer. Nothing was written. */
  | "FAILED";

interface ErrorLike {
  status?: unknown;
  code?: unknown;
}

export function trialFailure(thrown: unknown): TrialFailure {
  const err = (thrown && typeof thrown === "object" ? thrown : {}) as ErrorLike;
  if (err.status === 403) return "ACCESS_DENIED";
  if (err.code === "COACH_PUBLISH_REPAIRS_UNACKNOWLEDGED") return "REPAIRS_UNACKNOWLEDGED";
  if (err.code === "TRIAL_SESSION_ALREADY_OPEN") return "ALREADY_OPEN";
  if (err.code === "CATALOG_UNAVAILABLE") return "CATALOG_UNAVAILABLE";
  return "FAILED";
}

/** Where « Faite le {date} » links: the overview's session list, which holds the completed session (I3, EV-187). */
export function trialHistoryHref(clientId: string): string {
  return `/clients/${encodeURIComponent(clientId)}#ov-activity`;
}
