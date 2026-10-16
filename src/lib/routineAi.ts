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
 *   · `routineDiff` — EV-186n N1: the per-day comparison of `baseDocument` and `proposal`,
 *     computed here and never taken from the model's prose.
 *   · `pollDelayMs` — how often the running state asks again.
 */
import type { Copy } from "./copy";
import type {
  CoachRoutineAiProposalRequest,
  CoachRoutineAiRepairMark,
  Routine,
  RoutineAiGoal,
  RoutineExercise,
} from "./coachApi";
import { injuryLabels } from "./guardrailLabels";

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

/** EV-186 P5: « Sera remplacé à la publication : {blessure} de {prénom} ». */
export function repairMarkSentence(mark: CoachRoutineAiRepairMark, first: string, copy: Copy): string {
  const raw = typeof mark.injury === "string" ? mark.injury.trim() : "";
  // A mark with no injury named still says it will be swapped, and names nothing it was not told.
  if (raw === "") return copy.routineAi.repairMarkNoInjury;
  const [label] = injuryLabels([raw], copy);
  return copy.routineAi.repairMark(first, label ?? raw);
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

// ── N1: the diff ─────────────────────────────────────────────────────────────

/** The prescription fields a row compares, in display order. `name` is identity, not a field. */
export const PRESCRIPTION_FIELDS = [
  "sets",
  "reps",
  "rest",
  "weight",
  "tempo",
  "trackingType",
  "durationSeconds",
  "notes",
] as const;
export type PrescriptionField = (typeof PRESCRIPTION_FIELDS)[number];

export type ExerciseChange =
  | { kind: "unchanged"; after: RoutineExercise; afterIndex: number }
  | { kind: "prescription"; before: RoutineExercise; after: RoutineExercise; afterIndex: number; fields: PrescriptionField[] }
  | { kind: "replaced"; before: RoutineExercise; after: RoutineExercise; afterIndex: number }
  | { kind: "added"; after: RoutineExercise; afterIndex: number }
  | { kind: "removed"; before: RoutineExercise };

export interface DayDiff {
  dayOfWeek: number;
  /** `added`: a session on a weekday the base rests; `removed`: the reverse. */
  kind: "added" | "removed" | "changed" | "unchanged";
  focusBefore: string | null;
  focusAfter: string | null;
  rows: ExerciseChange[];
}

/** A plan-level field that differs. Equipment and injuries are never rows (N5, below). */
export interface SettingChange {
  field: "name" | "minutesPerSession" | "goal" | "level";
  before: string | number;
  after: string | number;
}

export interface RoutineDiff {
  days: DayDiff[];
  settings: SettingChange[];
  /** True when nothing at all differs: the panel says so rather than drawing an empty list. */
  identical: boolean;
}

const nameKey = (exercise: RoutineExercise) => exercise.name.trim().toLowerCase();

const norm = (value: unknown) => (value === undefined || value === "" ? null : value);

function changedFields(before: RoutineExercise, after: RoutineExercise): PrescriptionField[] {
  return PRESCRIPTION_FIELDS.filter((field) => norm(before[field]) !== norm(after[field]));
}

/** Longest common subsequence of two name lists, as index pairs in order. */
function lcsPairs(a: string[], b: string[]): [number, number][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/**
 * One day's rows, in the PROPOSAL's order. Exercises are matched by name (trimmed, case
 * ignored) along their longest common subsequence: a match is `unchanged` or `prescription`.
 * Between two matches, the base's leftovers and the proposal's leftovers are paired in order
 * as `replaced`; what remains is `removed` / `added`. A removed row is placed where it stood,
 * before the proposal row that followed it.
 */
export function dayRows(before: RoutineExercise[], after: RoutineExercise[]): ExerciseChange[] {
  const pairs = lcsPairs(before.map(nameKey), after.map(nameKey));
  const rows: ExerciseChange[] = [];
  let bi = 0;
  let ai = 0;
  const flushGap = (bEnd: number, aEnd: number) => {
    const removed = before.slice(bi, bEnd);
    const added = after.slice(ai, aEnd);
    const paired = Math.min(removed.length, added.length);
    for (let k = 0; k < paired; k++) {
      rows.push({ kind: "replaced", before: removed[k], after: added[k], afterIndex: ai + k });
    }
    for (let k = paired; k < removed.length; k++) rows.push({ kind: "removed", before: removed[k] });
    for (let k = paired; k < added.length; k++) rows.push({ kind: "added", after: added[k], afterIndex: ai + k });
  };
  for (const [bm, am] of pairs) {
    flushGap(bm, am);
    const fields = changedFields(before[bm], after[am]);
    rows.push(
      fields.length === 0
        ? { kind: "unchanged", after: after[am], afterIndex: am }
        : { kind: "prescription", before: before[bm], after: after[am], afterIndex: am, fields }
    );
    bi = bm + 1;
    ai = am + 1;
  }
  flushGap(before.length, after.length);
  return rows;
}

/**
 * EV-186n N1 — `baseDocument` vs `proposal`, per weekday (1–7), Monday first.
 *
 * `base` is null when the trainee had neither a draft nor a published plan (`baseSource`
 * NONE): every proposal day is then `added`.
 *
 * N5: on a LIVE base the stored proposal carries the trainee's profile subject fields, while
 * `baseDocument` is coach-shaped (both constraint lists `[]`). So equipment and injuries are
 * NEVER compared — they are the trainee's, shown read-only on this page, and a difference there
 * is an artefact of the two shapes, not a change the coach would keep. Goal and level are rows
 * only when they actually differ.
 */
export function routineDiff(base: Routine | null, proposal: Routine): RoutineDiff {
  const beforeDays = new Map((base?.trainingDays ?? []).map((day) => [day.dayOfWeek, day]));
  const afterDays = new Map(proposal.trainingDays.map((day) => [day.dayOfWeek, day]));
  const weekdays = Array.from(new Set([...beforeDays.keys(), ...afterDays.keys()])).sort((a, b) => a - b);

  const days: DayDiff[] = weekdays.map((dayOfWeek) => {
    const b = beforeDays.get(dayOfWeek) ?? null;
    const a = afterDays.get(dayOfWeek) ?? null;
    if (!b && a) {
      return {
        dayOfWeek,
        kind: "added",
        focusBefore: null,
        focusAfter: a.focus,
        rows: a.exercises.map((after, afterIndex) => ({ kind: "added", after, afterIndex })),
      };
    }
    if (b && !a) {
      return {
        dayOfWeek,
        kind: "removed",
        focusBefore: b.focus,
        focusAfter: null,
        rows: b.exercises.map((before) => ({ kind: "removed", before })),
      };
    }
    const before = b as NonNullable<typeof b>;
    const after = a as NonNullable<typeof a>;
    const rows = dayRows(before.exercises, after.exercises);
    const same = before.focus.trim() === after.focus.trim() && rows.every((row) => row.kind === "unchanged");
    return {
      dayOfWeek,
      kind: same ? "unchanged" : "changed",
      focusBefore: before.focus,
      focusAfter: after.focus,
      rows,
    };
  });

  const settings: SettingChange[] = [];
  if (base) {
    if (base.name.trim() !== proposal.name.trim()) settings.push({ field: "name", before: base.name, after: proposal.name });
    if (base.constraints.minutesPerSession !== proposal.constraints.minutesPerSession) {
      settings.push({
        field: "minutesPerSession",
        before: base.constraints.minutesPerSession,
        after: proposal.constraints.minutesPerSession,
      });
    }
    if (base.goal !== proposal.goal) settings.push({ field: "goal", before: base.goal, after: proposal.goal });
    if (base.level !== proposal.level) settings.push({ field: "level", before: base.level, after: proposal.level });
  }

  return {
    days,
    settings,
    identical: settings.length === 0 && days.every((day) => day.kind === "unchanged"),
  };
}

/** N2: the api's mark for this proposal row, if any (weekday + index, as the api locates it). */
export function repairMarkFor(
  marks: readonly CoachRoutineAiRepairMark[],
  dayOfWeek: number,
  afterIndex: number
): CoachRoutineAiRepairMark | null {
  return marks.find((mark) => mark.dayOfWeek === dayOfWeek && mark.exerciseIndex === afterIndex) ?? null;
}
