import type { Copy } from "./copy";
import type { CoachChallengeCreateRequest } from "./coachApi";
import { formatSteps } from "./format";
import { hasControl, nameLength, normaliseName } from "./recipeDocument";

/**
 * EV-321b — the create dialog's working copy, the checks it runs before it sends, the ONE
 * function that builds `POST /coach-portal/challenges`' body, and the ONE function that
 * turns the api's refusal into a sentence.
 *
 * Pure and client-safe: `coachApi.ts` is `server-only`, so this file imports TYPES from it
 * and nothing else, and `qa/challenge-rules.spec.ts` drives every branch without a server.
 *
 * Every local check PORTS an api rule with the api's own bound and counting unit
 * (b-fit-api `CoachChallengeCreateRequest` + `CoachChallengeUseCase.checkRules` at
 * `1749060`). A portal that refused at a different number than the server would be worse
 * than one that did not check. What the portal cannot know — a client whose link ended
 * after the page loaded, the coach's 20th unended challenge in another tab — it does not
 * guess: the server answers and `challengeFailureMessage` says so in words.
 */

/** `CoachChallengeCreateRequest.dailyTarget` — `@Min(1000) @Max(50000)`. */
export const DAILY_TARGET_MIN = 1_000;
export const DAILY_TARGET_MAX = 50_000;
/** The dialog's default goal (the demo's "10 000 pas par jour"). */
export const DEFAULT_DAILY_TARGET = 10_000;
/** `Challenge.MAX_SPAN_DAYS` — `endsOn - startsOn <= 92`, so at most 93 days. */
export const MAX_SPAN_DAYS = 92;
/** `CoachChallengeUseCase.MAX_DAYS_IN_PAST` / `MAX_DAYS_AHEAD`, on the server's UTC date. */
export const MAX_DAYS_IN_PAST = 14;
export const MAX_DAYS_AHEAD = 60;
/** `clientIds` — `@Size(min = 1, max = 50)`. */
export const MAX_CLIENTS = 50;
/** `CoachChallengeUseCase.MAX_UNENDED_CHALLENGES` (AC3). */
export const MAX_UNENDED_CHALLENGES = 20;
/** `CoachTemplateNames.MAX_LENGTH` via `@LibraryName`. */
export const TITLE_MAX = 80;
/** The default window: today and the six days after it — one week. */
export const DEFAULT_SPAN_DAYS = 6;

/** What the dialog holds: the target as TYPED, so "10 000" survives a re-render. */
export interface ChallengeForm {
  title: string;
  dailyTarget: string;
  startsOn: string;
  endsOn: string;
  clientIds: string[];
}

export type ChallengeField = "title" | "metric" | "dailyTarget" | "totalTarget" | "startsOn" | "endsOn" | "clientIds";

export type ProblemReason =
  | "titleRequired"
  | "titleTooLong"
  | "titleControl"
  | "targetInvalid"
  | "targetRange"
  | "dateInvalid"
  | "endBeforeStart"
  | "windowTooLong"
  | "startTooEarly"
  | "startTooLate"
  | "clientsRequired"
  | "clientsTooMany";

export interface ChallengeProblem {
  field: ChallengeField;
  reason: ProblemReason;
}

/* ── dates ─────────────────────────────────────────────────────────────────────── */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day as `YYYY-MM-DD`, or null ("2026-02-30" is not one). */
function parseDay(iso: string): number | null {
  const m = ISO_DAY.exec(iso.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const back = new Date(ms).toISOString().slice(0, 10);
  return back === iso.trim() ? ms : null;
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` + n days. */
export function addDays(iso: string, days: number): string {
  const ms = parseDay(iso);
  if (ms === null) return iso;
  return new Date(ms + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (both `YYYY-MM-DD`). */
export function daysBetween(a: string, b: string): number {
  const x = parseDay(a);
  const y = parseDay(b);
  if (x === null || y === null) return NaN;
  return Math.round((y - x) / DAY_MS);
}

/**
 * The api's clock for the window rule: `LocalDate.now(clock)` on a UTC server. The bounds
 * are checked against THIS day, not the coach's, so the portal refuses where the api does.
 */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The coach's own calendar day, for the DEFAULT start. A coach in Paris at 00:30 means
 * "today" by the clock on their wall; the ±14/60-day bounds are wide enough that the one
 * day between the two never decides a refusal.
 */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The dialog's starting state: 10 000 steps a day, today → today + 6, nobody selected. */
export function defaultChallengeForm(today: string, locale: Copy["locale"]): ChallengeForm {
  return {
    title: "",
    dailyTarget: formatSteps(DEFAULT_DAILY_TARGET, locale),
    startsOn: today,
    endsOn: addDays(today, DEFAULT_SPAN_DAYS),
    clientIds: [],
  };
}

/* ── the target ────────────────────────────────────────────────────────────────── */

/**
 * "10 000", "10 000" (U+202F, what French formatting prints), "10,000", "10.000" and
 * "10000" all read 10000: a coach types the grouping they see. A DECIMAL is not a step
 * count ("10,5" and "10.5" are refused, never rounded), and neither is anything else.
 */
export function parseDailyTarget(raw: string): number | null {
  const text = raw.trim();
  if (/^\d+$/.test(text)) return Number(text);
  if (/^\d{1,3}([ \u00a0\u202f.,]\d{3})+$/.test(text)) {
    const separators = new Set(text.replace(/\d/g, ""));
    // One separator kind throughout: "10.000,000" is not a number anyone meant.
    if (separators.size !== 1) return null;
    return Number(text.replace(/\D/g, ""));
  }
  return null;
}

/* ── the local checks, in the api's order ──────────────────────────────────────── */

/**
 * Every problem the api WOULD refuse, from the form alone. The order is the api's
 * (Bean Validation, then `checkRules`), so the first problem shown is the one the server
 * would name first.
 */
export function checkChallenge(form: ChallengeForm, serverToday: string): ChallengeProblem[] {
  const problems: ChallengeProblem[] = [];

  if (hasControl(form.title)) problems.push({ field: "title", reason: "titleControl" });
  else if (normaliseName(form.title) === null) problems.push({ field: "title", reason: "titleRequired" });
  else if (nameLength(form.title) > TITLE_MAX) problems.push({ field: "title", reason: "titleTooLong" });

  const target = parseDailyTarget(form.dailyTarget);
  if (target === null) problems.push({ field: "dailyTarget", reason: "targetInvalid" });
  else if (target < DAILY_TARGET_MIN || target > DAILY_TARGET_MAX) {
    problems.push({ field: "dailyTarget", reason: "targetRange" });
  }

  const start = parseDay(form.startsOn);
  const end = parseDay(form.endsOn);
  if (start === null) problems.push({ field: "startsOn", reason: "dateInvalid" });
  if (end === null) problems.push({ field: "endsOn", reason: "dateInvalid" });
  if (start !== null && end !== null) {
    const span = daysBetween(form.startsOn, form.endsOn);
    if (span < 0) problems.push({ field: "endsOn", reason: "endBeforeStart" });
    else if (span > MAX_SPAN_DAYS) problems.push({ field: "endsOn", reason: "windowTooLong" });
  }
  if (start !== null) {
    const offset = daysBetween(serverToday, form.startsOn);
    if (offset < -MAX_DAYS_IN_PAST) problems.push({ field: "startsOn", reason: "startTooEarly" });
    else if (offset > MAX_DAYS_AHEAD) problems.push({ field: "startsOn", reason: "startTooLate" });
  }

  const ids = new Set(form.clientIds);
  if (ids.size === 0) problems.push({ field: "clientIds", reason: "clientsRequired" });
  else if (ids.size > MAX_CLIENTS) problems.push({ field: "clientIds", reason: "clientsTooMany" });

  return problems;
}

export type BuiltRequest =
  | { ok: true; body: CoachChallengeCreateRequest }
  | { ok: false; problems: ChallengeProblem[] };

/**
 * THE request body. STEPS only (the portal does not create WORKOUTS — see coachApi.ts),
 * so `totalTarget` is not sent at all: the api refuses a STEPS body that carries one.
 * The title is sent as the api will store it (normalised), and a client ticked twice is
 * sent once.
 */
export function buildChallengeRequest(form: ChallengeForm, serverToday: string): BuiltRequest {
  const problems = checkChallenge(form, serverToday);
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    body: {
      title: normaliseName(form.title) as string,
      metric: "STEPS",
      dailyTarget: parseDailyTarget(form.dailyTarget) as number,
      startsOn: form.startsOn.trim(),
      endsOn: form.endsOn.trim(),
      clientIds: [...new Set(form.clientIds)],
    },
  };
}

export function problemMessage(problem: ChallengeProblem, copy: Copy): string {
  const p = copy.challenges.problems;
  const n = (value: number) => formatSteps(value, copy.locale);
  switch (problem.reason) {
    case "titleRequired":
      return p.titleRequired;
    case "titleTooLong":
      return p.titleTooLong(String(TITLE_MAX));
    case "titleControl":
      return p.titleControl;
    case "targetInvalid":
      return p.targetInvalid;
    case "targetRange":
      return p.targetRange(n(DAILY_TARGET_MIN), n(DAILY_TARGET_MAX));
    case "dateInvalid":
      return p.dateInvalid;
    case "endBeforeStart":
      return p.endBeforeStart;
    case "windowTooLong":
      return p.windowTooLong(String(MAX_SPAN_DAYS + 1));
    case "startTooEarly":
      return p.startTooEarly(String(MAX_DAYS_IN_PAST));
    case "startTooLate":
      return p.startTooLate(String(MAX_DAYS_AHEAD));
    case "clientsRequired":
      return p.clientsRequired;
    case "clientsTooMany":
      return p.clientsTooMany(String(MAX_CLIENTS));
  }
}

/* ── the api's refusals ────────────────────────────────────────────────────────── */

/** An `ApiError`'s fields, without the class (which lives in a `server-only` module). */
export interface ApiRefusal {
  status: number;
  code: string | null;
  details: Record<string, unknown> | null;
  message: string | null;
}

export type ChallengeFailure =
  | { code: "INVALID"; field: ChallengeField | null }
  | { code: "ACCESS_DENIED" }
  | { code: "LIMIT_REACHED" }
  | { code: "FAILED" };

/**
 * The field a `VALIDATION_ERROR` names, from EITHER of the api's two shapes:
 *   · `details.field` — `ChallengeFieldInvalidException`, the rules the type cannot state;
 *   · the FIRST token of `message` — Bean Validation's `"<field> <reason>"`, no details.
 * Only a token of this body's shape counts (`clientIds[3]` is `clientIds`), so no other
 * sentence can be mistaken for a field.
 */
const FIELD = /^(title|metric|dailyTarget|totalTarget|startsOn|endsOn|clientIds)(?:\[\d+\])?(?=\s|$)/;

export function challengeFieldOf(details: Record<string, unknown> | null, message: string | null): ChallengeField | null {
  const named = details?.field;
  if (typeof named === "string") {
    const m = FIELD.exec(named);
    if (m) return m[1] as ChallengeField;
  }
  const lead = message ? FIELD.exec(message) : null;
  return lead ? (lead[1] as ChallengeField) : null;
}

/**
 * The create's four outcomes. `403` is ONE body for a foreign, revoked or unknown client
 * — the api refuses to say which, so the portal says what is true of all three.
 */
export function classifyChallengeError(refusal: ApiRefusal): ChallengeFailure {
  if (refusal.code === "VALIDATION_ERROR") {
    return { code: "INVALID", field: challengeFieldOf(refusal.details, refusal.message) };
  }
  if (refusal.code === "COACH_CHALLENGE_LIMIT_REACHED") return { code: "LIMIT_REACHED" };
  if (refusal.status === 403) return { code: "ACCESS_DENIED" };
  return { code: "FAILED" };
}

/** The sentence for a server refusal, and the field it belongs beside (null = the form). */
export function challengeFailureMessage(
  failure: ChallengeFailure,
  copy: Copy
): { field: ChallengeField | null; message: string } {
  const f = copy.challenges.failures;
  const p = copy.challenges.problems;
  const n = (value: number) => formatSteps(value, copy.locale);
  switch (failure.code) {
    case "ACCESS_DENIED":
      return { field: "clientIds", message: f.accessDenied };
    case "LIMIT_REACHED":
      return { field: null, message: f.limitReached(String(MAX_UNENDED_CHALLENGES)) };
    case "FAILED":
      return { field: null, message: f.failed };
    case "INVALID":
      switch (failure.field) {
        case "title":
          return { field: "title", message: p.titleInvalid(String(TITLE_MAX)) };
        case "dailyTarget":
          return { field: "dailyTarget", message: p.targetRange(n(DAILY_TARGET_MIN), n(DAILY_TARGET_MAX)) };
        case "startsOn":
          return {
            field: "startsOn",
            message: p.startRange(String(MAX_DAYS_IN_PAST), String(MAX_DAYS_AHEAD)),
          };
        case "endsOn":
          return { field: "endsOn", message: p.endRange(String(MAX_SPAN_DAYS + 1)) };
        case "clientIds":
          return { field: "clientIds", message: p.clientsRange(String(MAX_CLIENTS)) };
        default:
          // `metric`, `totalTarget` or no field at all: nothing the coach typed.
          return { field: null, message: f.invalid };
      }
  }
}
