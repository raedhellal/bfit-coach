/**
 * EV-186b / EV-186n — the routine page's « Régénérer avec l'IA » panel, as PURE functions.
 *
 * Nothing here talks to the api, holds state or imports a server module, so a client island
 * may import it and `qa/routine-ai-unit.spec.ts` can test every branch with no server at all:
 *
 *   · `routineAiCapability` — EV-186b B1: the panel exists only when the routine read's
 *     `aiProposals.routine` is literally `true`. Absent, null, a string, a missing field: false.
 *   · `briefRequest` / `notesLength` — the brief's body, built in ONE place (B2), and the
 *     counter's arithmetic (the api counts « 500 characters after NFC »).
 *   · `routineAiSentence` — B4: every refusal CODE renders its sentence from the story's copy
 *     table; an unknown code renders the generic Failed sentence; the server's `message` is
 *     never read, so it can never be shown.
 *   · `pollDelayMs` — how often the running state asks again.
 */
import type { Copy } from "./copy";
import type {
  CoachRoutineAiProposalRequest,
  Routine,
  RoutineAiGoal,
} from "./coachApi";

// ── B1: the capability ───────────────────────────────────────────────────────

export interface RoutineAiCapability {
  /** « Régénérer avec l'IA » (EV-186b). */
  routine: boolean;
  /**
   * « Modifier avec l'IA » (EV-186f). Read so the rule « never true while routine is false »
   * holds here too, and so EV-186f has one place to look. NOTHING renders from it in this
   * slice: the vendored contract's `kind` is `REGENERATE` only.
   */
  instruction: boolean;
}

/**
 * ADR-0036 D36.9: « the portal treats an absent object, or an absent field, as false ».
 * Every field is read as `=== true` off an own property of a plain object, so `"true"`, `1`,
 * an array, a prototype-inherited key and `null` all fail closed.
 */
export function routineAiCapability(raw: unknown): RoutineAiCapability {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { routine: false, instruction: false };
  }
  const own = (key: string): boolean =>
    Object.prototype.hasOwnProperty.call(raw, key) && (raw as Record<string, unknown>)[key] === true;
  const routine = own("routine");
  return { routine, instruction: routine && own("instruction") };
}

// ── B2: the brief ────────────────────────────────────────────────────────────

/** `CoachRoutineAiBrief.goal`, in the order the intake asks it (EV-341r R4). */
export const ROUTINE_AI_GOALS: readonly RoutineAiGoal[] = [
  "BUILD_MUSCLE",
  "LOSE_WEIGHT",
  "GET_STRONGER",
  "MOBILITY",
  "ENDURANCE",
];
/** `CoachRoutineAiBrief.days` — 2 to 6, the publishable plan's own bound (`dayCountBound`). */
export const ROUTINE_AI_DAYS: readonly number[] = [2, 3, 4, 5, 6];
/** `CoachRoutineAiBrief.sessionLength` — the api's enum; anything else is a 400. */
export const ROUTINE_AI_SESSION_LENGTHS: readonly number[] = [20, 30, 45, 60, 75, 90];
export const ROUTINE_AI_NOTES_MAX = 500;
export const ROUTINE_AI_EMPHASIS_MAX = 5;

/** The form as the panel holds it. `""` is "not chosen yet". */
export interface RoutineAiBriefForm {
  goal: RoutineAiGoal | "";
  days: number | "";
  sessionLength: number | "";
  emphasis: string[];
  notes: string;
}

export function isRoutineAiGoal(value: unknown): value is RoutineAiGoal {
  return typeof value === "string" && (ROUTINE_AI_GOALS as readonly string[]).includes(value);
}

/**
 * The form's starting values, from the document the editor holds (the coach's draft, else the
 * published plan). Its `goal` is the TRAINEE's (the api resolves it on every draft write), so
 * it is AC1's « pre-filled from the trainee's stored profile goal ». A value outside the brief's
 * enum is left unchosen rather than snapped to a neighbour: a 7-day plan does not become 6.
 */
export function initialBriefForm(document: Routine | null): RoutineAiBriefForm {
  const days = document?.trainingDays.length ?? 0;
  const minutes = document?.constraints.minutesPerSession ?? 0;
  return {
    goal: isRoutineAiGoal(document?.goal) ? (document?.goal as RoutineAiGoal) : "",
    days: ROUTINE_AI_DAYS.includes(days) ? days : "",
    sessionLength: ROUTINE_AI_SESSION_LENGTHS.includes(minutes) ? minutes : "",
    emphasis: [],
    notes: "",
  };
}

/**
 * The counter's number, counted as the api counts it: b-fit-api @ 19b6696e
 * `CoachAiInstructionBounds.requireValid` normalises to NFC and compares
 * `text.codePointCount(...)` with 500 (its javadoc: "an astral emoji counts once"). So: NFC, then
 * CODE POINTS — `[...s]` iterates code points, where `.length` would count an emoji twice.
 * A decomposed « é » (two code points) counts once after NFC, as it does there.
 */
export function notesLength(notes: string): number {
  return [...notes.normalize("NFC")].length;
}

/** Why the brief cannot be sent yet, or null. The portal never truncates (EV-186f U2's rule). */
export function briefBlocked(form: RoutineAiBriefForm): "incomplete" | "notesTooLong" | "emphasisTooMany" | null {
  if (form.goal === "" || form.days === "" || form.sessionLength === "") return "incomplete";
  if (notesLength(form.notes) > ROUTINE_AI_NOTES_MAX) return "notesTooLong";
  if (form.emphasis.length > ROUTINE_AI_EMPHASIS_MAX) return "emphasisTooMany";
  return null;
}

/**
 * THE body of `POST …/routine/ai-proposal`, built in one place. It can carry the five brief
 * keys and `kind`, nothing else — no injury, no equipment, no id — because the type has no
 * other key and the literal below names each one. Empty emphasis and blank notes are OMITTED
 * (both optional on the wire). Notes travel exactly as typed: the api normalises and bounds.
 */
export function briefRequest(form: RoutineAiBriefForm): CoachRoutineAiProposalRequest | null {
  if (briefBlocked(form) !== null) return null;
  const brief: CoachRoutineAiProposalRequest["brief"] = {
    goal: form.goal as RoutineAiGoal,
    days: form.days as number,
    sessionLength: form.sessionLength as number,
  };
  if (form.emphasis.length > 0) brief.emphasis = [...form.emphasis];
  if (form.notes.trim() !== "") brief.notes = form.notes;
  return { kind: "REGENERATE", brief };
}

// ── B4: refusals → sentences ─────────────────────────────────────────────────

/**
 * What a server action hands the panel when the api said no. `code` is the api's own; the
 * message is deliberately absent from this type so that no caller can render it.
 */
export interface RoutineAiFailure {
  /** The api's code, `NOT_FOUND` for an unregistered route (flag off), `FAILED` for no answer. */
  code: string;
  /** 429 `COACH_AI_RATE_LIMIT` only: whose counter is spent. */
  scope?: "link" | "coach" | null;
  /** 429 only: `Retry-After` in seconds (the next midnight, server zone), or null. */
  retryAfterSeconds?: number | null;
}

/**
 * B4: the sentence for a refusal or a FAILED proposal's `errorCode`. Every code the story's copy
 * table names for the routine surface has its row; anything else — including COACH_AI_TIMEOUT,
 * COACH_AI_INVALID_OUTPUT, COACH_AI_FAILED, VALIDATION_ERROR and a lost connection — renders
 * the Failed sentence. `first` is the trainee's first name as `firstName` returns it.
 */
export function routineAiSentence(failure: RoutineAiFailure, first: string, copy: Copy): string {
  const t = copy.routineAi;
  switch (failure.code) {
    case "COACH_AI_RATE_LIMIT":
      return failure.scope === "coach" ? t.rateLimitCoach : t.rateLimitLinkRegen(first);
    case "COACH_AI_UNAVAILABLE":
    // The routes are unregistered while the flag is off: the server switched AI off since
    // this page was drawn. The same fact as 503 COACH_AI_UNAVAILABLE, so the same sentence.
    // falls through
    case "NOT_FOUND":
      return t.unavailable;
    case "COACH_AI_BUSY":
      return t.busy;
    case "COACH_AI_PROPOSAL_RUNNING":
      return t.alreadyRunning(first);
    case "COACH_PROPOSAL_STALE":
      return t.staleRoutine(first);
    case "COACH_DRAFT_EXISTS":
      return t.draftChanged(first);
    case "COACH_AI_INSTRUCTION_INVALID":
      return t.instructionInvalid;
    case "COACH_AI_NOTHING_APPLIED":
      return t.nothingApplied;
    case "CATALOG_UNAVAILABLE":
      return copy.routine.catalogUnavailable;
    default:
      return t.failed;
  }
}

/**
 * Whether « Générer » is held off after this refusal: a spent quota stays spent until the
 * api's `Retry-After` (the next midnight), so pressing again could only be refused again.
 * Everything else — BUSY above all, whose whole sentence is « try again in a minute » — leaves
 * the button live. Returns the instant (ms) until which it is held, or null.
 */
export function heldUntil(failure: RoutineAiFailure, now: number): number | null {
  if (failure.code !== "COACH_AI_RATE_LIMIT") return null;
  const seconds = failure.retryAfterSeconds;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? now + seconds * 1000 : null;
}

// ── polling ──────────────────────────────────────────────────────────────────

/**
 * The api fails a run at 120 s (COACH_AI_TIMEOUT), so a proposal still RUNNING past that is
 * either about to settle or a dead job (EV-186c C11(c): taken over after 10 min). Ask every
 * 2 s for the first 2 min 10 s, then every 10 s: the panel never decides on its own that a
 * run failed — only the api's FAILED says so.
 */
export const POLL_FAST_MS = 2_000;
export const POLL_SLOW_MS = 10_000;
export const POLL_FAST_WINDOW_MS = 130_000;

export function pollDelayMs(runningForMs: number): number {
  return runningForMs < POLL_FAST_WINDOW_MS ? POLL_FAST_MS : POLL_SLOW_MS;
}
