import "server-only";
import type {
  AdherenceSeries,
  CatalogExercise,
  CoachAccessScope,
  FiredRedFlag,
  CatalogPage,
  ClientOverview,
  CoachApi,
  CoachMe,
  CoachNutritionResponse,
  CoachRoutineDraft,
  CoachRoutineDraftRequest,
  CoachRoutineDraftResponse,
  CoachRoutineGuardrails,
  CoachRoutineResponse,
  CoachTemplate,
  CoachTemplateApplyResult,
  CoachTemplateFromRoutineRequest,
  CoachTemplateList,
  CoachTemplateSaveRequest,
  CoachTargetsRequest,
  CoachTargetsResult,
  InviteResponse,
  MealSlot,
  MealWeekView,
  NutritionTargets,
  PlannedDayView,
  PlannedMealView,
  PublishPreview,
  PublishRepair,
  PublishResult,
  RosterClient,
  RosterPage,
  RosterSort,
  Routine,
  RoutineDayEntry,
  RoutineExerciseEntry,
  RoutinePlanView,
  SessionFeedback,
  SessionHistory,
  SessionHistoryItem,
  SwapOptions,
  TraineeDietProfile,
  TraineeProgress,
  WeekAdherence,
  WeightPoint,
  CoachProgressGoalRequest,
  TraineeProgressGoal,
  TraineeProgressReading,
} from "./coachApi";
// The fixture composes its repair sentences with the portal's own composer, so the
// demo's lines are identical to the ones the structured shape produced. See
// `repairsFor`.
import { copy } from "./copy";

/**
 * In-memory fixture for `COACH_API_MODE=fixture`.
 *
 * This exists so the four screens can be reviewed and demoed without a running api —
 * NOT so the product can pretend to have a backend. Two rules keep it honest:
 *   1. It is server-side and env-gated; `live` is the default and the demo runs live.
 *   2. Its shapes are the same TypeScript types the live client returns — the api's
 *      own field names — so a contract change breaks this file at compile time
 *      instead of letting the fixture drift into a nicer world than production.
 *
 * Dates are computed from `now` on every call, so the fixture never shows a stale
 * "last workout" three months in the past.
 *
 * `COACH_FIXTURE_SCENARIO=empty` serves the zero-trainee roster (AC1's empty state,
 * which is also what the Playwright smoke spec asserts); anything else serves the
 * populated roster.
 */

const SCENARIO = process.env.COACH_FIXTURE_SCENARIO === "empty" ? "empty" : "populated";
const CAPACITY = 2; // CoachProfile.CapacityTier.STARTER.capacity()
/** The signed-in coach's own id — `GET /coach-portal/me` only. It is never compared
 * against anything here: `setByYou` arrives already computed (amendment ruling (b)). */
const COACH_ID = "1a2b3c4d-0000-4000-8000-00000000c0ac";

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function isoInstant(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

const LINA_ID = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/**
 * Two more trainees that exist ONLY as overview reads, for the two other states of
 * AC5's block 4 (BUG-144): exactly one weigh-in, and none at all. They are not on any
 * scenario's roster on purpose — the roster and the per-trainee overview are separate
 * api reads and the fixture has always answered `getClient(LINA_ID)` in the `empty`
 * scenario too, so addressing a trainee the roster does not list is the fixture's
 * existing shape, not a new fiction. Nothing here is reachable in `live` mode.
 */
const NILS_ID = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
const SARA_ID = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003";
/**
 * ADR-0015 D5 — the three partial-consent links. Each one exists because the api can
 * now answer the overview for a link that shares only some of the data, and the portal
 * has to render that from `scopes` rather than from a 403 it will never receive.
 */
const PETRA_ID = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0006";
const YUSUF_ID = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
const MARA_ID = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0008";
/**
 * EV-187b. Two trainees the monitoring blocks need and that no existing fixture row
 * could become without breaking what it already demonstrates:
 *
 *   Tobias — ALL scopes, and the only trainee with a flag of EACH kind (AC2's "one has
 *            a flag of each kind", AC4's two evidence shapes on one page). He carries
 *            the 7/7 week (edge case 2) and a real "Last weigh-in <date> — <N> days
 *            ago", which is the sentence BUG-197's fix reserved for a trainee who HAS
 *            weighed in.
 *   Kaia   — edge case 1: an ACTIVE link, all four scopes, and literally no data. She
 *            is the only way to reach "No sessions in the last 8 weeks" and "No
 *            completed sessions yet", and the only way to prove the blocks render no
 *            `0 %`, no `NaN` and no axis full of zeroes for a brand-new trainee. She is
 *            overview-only (not on the roster), which is this fixture's existing shape.
 */
/**
 * The EV-184b / EV-185b scenario ids. They are declared HERE rather than beside the
 * routine block they belong to because `OVERVIEWS` and `PROGRESS` are initialised at
 * module load and key on them — a `const` declared further down is in its temporal dead
 * zone at that moment, which is a ReferenceError on the first request and not a
 * compile error. See the block above the routine fixtures for what each one is for.
 */
const DANA_ID = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";
const OMAR_ID = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0005";
const TOBIAS_ID = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0009";
const KAIA_ID = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0010";

/** Everything a fully-consented link shares — the shape every EV-183 fixture had. */
const ALL_SCOPES: CoachAccessScope[] = ["WORKOUTS", "PROGRESS", "NUTRITION", "WEIGH_INS"];

/** 71.2 kg → 70.4 kg over eight weekly weigh-ins. */
const WEIGHTS = [71.2, 71.0, 71.1, 70.8, 70.9, 70.6, 70.5, 70.4];

function weightSeries(): WeightPoint[] {
  return WEIGHTS.map((weightKg, i) => ({
    date: isoDate((WEIGHTS.length - 1 - i) * 7 + 1),
    weightKg,
  }));
}

function lina(): RosterClient {
  return {
    id: LINA_ID,
    traineeDisplayName: "Lina M.",
    scopes: ALL_SCOPES,
    currentPlanName: "Intermediate Muscle Building Routine",
    lastCompletedWorkoutDate: isoDate(1),
    currentStreakDays: 4,
    // EV-187 AC2. The count is the LENGTH of the same trainee's `redFlags` on the
    // overview, by construction — QA compares the badge to the flags on the page for
    // every seeded trainee, and a fixture that let the two drift would be testing
    // nothing.
    redFlagCount: OVERVIEWS[LINA_ID]().redFlags?.length ?? null,
    status: "ACTIVE",
    since: isoInstant(23),
  };
}

/**
 * ALL scopes, and the only row with TWO flags — AC2's "one has a flag of each kind",
 * and the singular/plural pair the badge is asserted on ("2 flags" beside "1 flag").
 */
function tobias(): RosterClient {
  return {
    id: TOBIAS_ID,
    traineeDisplayName: "Tobias R.",
    scopes: ALL_SCOPES,
    currentPlanName: "Push Pull Legs",
    lastCompletedWorkoutDate: isoDate(9),
    currentStreakDays: 0,
    redFlagCount: OVERVIEWS[TOBIAS_ID]().redFlags?.length ?? null,
    status: "ACTIVE",
    since: isoInstant(60),
  };
}

/**
 * An ACTIVE link that shares nothing at all. `redFlagCount` is NULL — no rule could be
 * evaluated — so the row reads "Not shared" and sorts LAST, never among the rows with
 * no flags. A `0` here would tell the coach this trainee is fine, from nothing.
 */
function mara(): RosterClient {
  return {
    id: MARA_ID,
    traineeDisplayName: "Mara D.",
    scopes: [],
    currentPlanName: null,
    lastCompletedWorkoutDate: null,
    currentStreakDays: null,
    redFlagCount: null,
    status: "ACTIVE",
    since: isoInstant(5),
  };
}

/**
 * The two partial-consent roster rows (ADR-0015 D5/S1). They exist so the roster's
 * own nulls are reachable — the fields are filtered PER ITEM on the link's scopes, and
 * a fixture that only ever served a fully-consented row would leave "Not shared" and
 * the null streak rendered by nothing.
 *
 * Petra shares NUTRITION only: no plan, no last workout, no streak.
 * Yusuf shares WORKOUTS only: a plan, and no progress fields at all — which is the
 * combination that proves the two nulls are independent.
 * Sara shares PROGRESS + WEIGH_INS and has never completed a workout: the row whose
 * null date means "never trained" rather than "not shared", so it must read
 * "No workouts yet" and sort FIRST while Petra's and Yusuf's sort last. Her `0` streak
 * is a real zero for the same reason. Without her, the two readings of one null are
 * indistinguishable in the suite and the sort tiers are untested.
 */
function petra(): RosterClient {
  return {
    id: PETRA_ID,
    traineeDisplayName: "Petra L.",
    scopes: ["NUTRITION"],
    currentPlanName: null,
    lastCompletedWorkoutDate: null,
    currentStreakDays: null,
    // Neither WORKOUTS nor WEIGH_INS: no rule could be evaluated → "Not shared", last.
    redFlagCount: null,
    status: "ACTIVE",
    since: isoInstant(12),
  };
}

function yusuf(): RosterClient {
  return {
    id: YUSUF_ID,
    traineeDisplayName: "Yusuf A.",
    scopes: ["WORKOUTS"],
    currentPlanName: "Two Day Full Body",
    // Progress data, so S1 filters it out of a WORKOUTS-only row.
    lastCompletedWorkoutDate: null,
    currentStreakDays: null,
    /**
     * WORKOUTS is held, so the missed-sessions rule COULD be evaluated and it did not
     * fire: a real `0`, which renders no badge at all and never "0 flags". This is the
     * row that keeps "not shared" and "no flags" from collapsing into one rendering.
     */
    redFlagCount: 0,
    status: "ACTIVE",
    since: isoInstant(21),
  };
}

function sara(): RosterClient {
  return {
    id: SARA_ID,
    traineeDisplayName: "Sara P.",
    // Matches her overview exactly: PROGRESS + WEIGH_INS, `lastSession: null`,
    // `currentStreakDays: 0`. The roster row and the overview must not disagree.
    scopes: ["PROGRESS", "WEIGH_INS"],
    // No WORKOUTS: the plan is withheld, which is a different cell from "No plan".
    currentPlanName: null,
    // PROGRESS *is* shared and there is genuinely no completed workout — the null the
    // roster is allowed to describe.
    lastCompletedWorkoutDate: null,
    currentStreakDays: 0,
    redFlagCount: OVERVIEWS[SARA_ID]().redFlags?.length ?? null,
    status: "ACTIVE",
    since: isoInstant(30),
  };
}

/**
 * The overviews the fixture can answer, by id. `NO_WEIGH_IN_14_DAYS` is attached to
 * the trainee who has never weighed in because that is the rule the api would actually
 * compute for them — the flags and block 4 have to agree here as they do in the api.
 */
/**
 * EV-202b note: these entries carry NO `progressGoal`. The block is derived and
 * attached by `OVERVIEWS` below, from this entry's own `scopes` and `since` plus
 * whatever the coach has saved — so a fixture row cannot accidentally serve a
 * progress block to a link that does not carry `WEIGH_INS`, and cannot serve a
 * baseline that disagrees with the weight series two lines above it.
 */
const BASE_OVERVIEWS: Record<string, () => ClientOverview> = {
  [LINA_ID]: () => ({
    clientId: LINA_ID,
    traineeDisplayName: "Lina M.",
    since: isoInstant(23),
    scopes: ALL_SCOPES,
    adherenceThisWeek: { done: 2, planned: 4 },
    currentStreakDays: 4,
    lastSession: { date: isoDate(1), name: "Upper Body A", difficulty: "HARD" },
    weightSeries: weightSeries(),
    // MISSED_TWO_OR_MORE_SESSIONS only: PAIN_REPORTED is never emitted by the api
    // (ADR-0012 D6), so a fixture that showed it would be fiction.
    redFlags: ["MISSED_TWO_OR_MORE_SESSIONS"],
  }),
  [NILS_ID]: () => ({
    clientId: NILS_ID,
    traineeDisplayName: "Nils K.",
    since: isoInstant(9),
    scopes: ALL_SCOPES,
    adherenceThisWeek: { done: 1, planned: 3 },
    currentStreakDays: 1,
    lastSession: { date: isoDate(2), name: "Full Body A", difficulty: "OK" },
    weightSeries: [{ date: isoDate(1), weightKg: 72.5 }],
    redFlags: [],
  }),
  [SARA_ID]: () => ({
    clientId: SARA_ID,
    traineeDisplayName: "Sara P.",
    since: isoInstant(30),
    // Sara shares her progress and her weigh-ins, and NEITHER her workouts nor her
    // nutrition: both tabs read the scope sentence while the overview stays full.
    scopes: ["PROGRESS", "WEIGH_INS"],
    adherenceThisWeek: { done: 0, planned: 3 },
    currentStreakDays: 0,
    lastSession: null,
    weightSeries: [],
    redFlags: ["NO_WEIGH_IN_14_DAYS"],
  }),
  // EV-184b/EV-185b scenarios — see the block below for what each one is for.
  ["6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004"]: () => ({
    clientId: "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004",
    traineeDisplayName: "Dana W.",
    since: isoInstant(15),
    scopes: ALL_SCOPES,
    adherenceThisWeek: { done: 2, planned: 2 },
    currentStreakDays: 6,
    lastSession: { date: isoDate(1), name: "Push", difficulty: "OK" },
    weightSeries: [
      { date: isoDate(15), weightKg: 64.8 },
      { date: isoDate(8), weightKg: 64.5 },
      { date: isoDate(1), weightKg: 64.2 },
    ],
    redFlags: [],
  }),
  ["6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0005"]: () => ({
    clientId: "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0005",
    traineeDisplayName: "Omar T.",
    since: isoInstant(40),
    scopes: ALL_SCOPES,
    adherenceThisWeek: { done: 1, planned: 3 },
    currentStreakDays: 0,
    lastSession: { date: isoDate(4), name: "Full Body A", difficulty: "EASY" },
    weightSeries: [{ date: isoDate(3), weightKg: 81.0 }],
    redFlags: [],
  }),
  /**
   * NUTRITION only (ADR-0015 D5 + F1). Every progress and weigh-in block is `null` —
   * "not shared" — and not a zero: `currentStreakDays: 0` would tell the coach this
   * trainee has no streak, which is a claim about a person whose sessions they have
   * never been allowed to see. `redFlags` is null because BOTH of its scopes are
   * missing; `weightSeries` null rather than `[]` for the same reason.
   */
  [PETRA_ID]: () => ({
    clientId: PETRA_ID,
    traineeDisplayName: "Petra L.",
    since: isoInstant(12),
    scopes: ["NUTRITION"],
    adherenceThisWeek: null,
    currentStreakDays: null,
    lastSession: null,
    weightSeries: null,
    redFlags: null,
  }),
  /** WORKOUTS only: the Routine tab works, the Nutrition tab reads the sentence. */
  [YUSUF_ID]: () => ({
    clientId: YUSUF_ID,
    traineeDisplayName: "Yusuf A.",
    since: isoInstant(21),
    scopes: ["WORKOUTS"],
    adherenceThisWeek: null,
    currentStreakDays: null,
    lastSession: null,
    weightSeries: null,
    redFlags: null,
  }),
  /**
   * An ACTIVE link that shares NOTHING. It is reachable — `requireManagedLink` needs
   * no data scope — and every block on it is absent. This is the row that proves the
   * overview is not a 403 for a consent-less link, which is what made EV-185
   * unreachable in round one of the ADR.
   */
  [MARA_ID]: () => ({
    clientId: MARA_ID,
    traineeDisplayName: "Mara D.",
    since: isoInstant(5),
    scopes: [],
    adherenceThisWeek: null,
    currentStreakDays: null,
    lastSession: null,
    weightSeries: null,
    redFlags: null,
  }),
  /**
   * EV-187b. Both live rules fired for one trainee — the page that has to render two
   * evidence shapes at once, and the roster row that reads "2 flags".
   *
   * His last weigh-in is 21 days old, so `NO_WEIGH_IN_14_DAYS` fires with a REAL date:
   * `weightSeries` is non-empty (the weigh-in is inside the 8-week window) and the
   * evidence reads "Last weigh-in <date> — 21 days ago". "Never weighed in" is
   * reserved for Sara, who has genuinely never logged one.
   */
  [TOBIAS_ID]: () => ({
    clientId: TOBIAS_ID,
    traineeDisplayName: "Tobias R.",
    since: isoInstant(60),
    scopes: ALL_SCOPES,
    adherenceThisWeek: { done: 0, planned: 3 },
    currentStreakDays: 0,
    lastSession: { date: isoDate(9), name: "Legs", difficulty: "HARD" },
    weightSeries: [
      { date: isoDate(35), weightKg: 88.4 },
      { date: isoDate(28), weightKg: 88.0 },
      { date: isoDate(21), weightKg: 87.6 },
    ],
    redFlags: ["MISSED_TWO_OR_MORE_SESSIONS", "NO_WEIGH_IN_14_DAYS"],
  }),
  /**
   * Edge case 1 — an ACTIVE link, all four scopes, and literally no data: accepted
   * today, never trained, never weighed in. Every block must render its own empty
   * state and nothing may render `NaN`, `0 / 0 = 0 %` or an axis full of zeroes.
   *
   * She carries `NO_WEIGH_IN_14_DAYS` **and nothing else**, which is the story's own
   * wording: she has never weighed in, so the rule fires and its evidence is the
   * "Never weighed in" branch.
   */
  [KAIA_ID]: () => ({
    clientId: KAIA_ID,
    traineeDisplayName: "Kaia B.",
    since: isoInstant(0),
    scopes: ALL_SCOPES,
    adherenceThisWeek: { done: 0, planned: 0 },
    currentStreakDays: 0,
    lastSession: null,
    weightSeries: [],
    redFlags: ["NO_WEIGH_IN_14_DAYS"],
  }),
};

/* ════════════════════════════════════════════════════════════════════════════
 * EV-202b — the progress block, `GET /coach-portal/clients/{id}` + `PUT …/progress-goal`.
 *
 * The api half (b-fit-api `9218a77`) is merged and deployed, so this is a twin of
 * something real. It is DERIVED rather than written out, and that is the whole design:
 * the block's four readings are computed from the same reading lists the weight series
 * is built from, so the block and the chart cannot disagree (EV-202 edge case 1), and
 * moving the start date really does move the baseline — which is the only way AC3 is
 * testable end to end without a database.
 *
 * It also makes the whole-representation trap REACHABLE in fixture mode: `PUT` stores
 * the body it is given, so a request that omits a field clears it, exactly as the api
 * does. A form that economised and sent only the edited value would show its damage
 * here, in the browser, rather than in production.
 *
 * ⚠ ONE SIMPLIFICATION, named rather than hidden: the api merges `weigh_ins` and
 * `body_measurements` per date inside `CoachPortalQueryService`; here the two lists are
 * already merged by construction. What the fixture demonstrates is the RENDERING of
 * the block and the arithmetic the coach can reproduce by hand; that the baseline uses
 * the same per-date helper as the series is asserted api-side, where the helper is.
 * ════════════════════════════════════════════════════════════════════════════ */

interface TraineeReadings {
  /** Oldest first, like every other series on this surface. */
  weights: TraineeProgressReading[];
  /**
   * Body fat lives ONLY on `body_measurements` — `weigh_ins` has no such column — so a
   * trainee who logs through the weigh-in screen has weights and an EMPTY list here.
   * That is AC4's "Not recorded", and it is a different fact from having no weigh-in.
   */
  bodyFats: TraineeProgressReading[];
}

/**
 * Who has recorded what.
 *
 *   Lina   — eight weekly weights (the SAME series her chart draws) and two body-fat
 *            readings on the FIRST and LAST of those days, so both columns resolve to
 *            the same dates and the body-fat cells print no date of their own (AC2).
 *   Nils   — one weigh-in and no body fat at all: start and current are the same
 *            reading, the weight delta is a REAL `0.0 kg`, and body fat reads "Not
 *            recorded" (AC4, both halves on one row).
 *   Tobias — weights and body fats on DIFFERENT days (edge case 2), which is the only
 *            trainee for whom the body-fat cells print their own dates.
 *   Sara   — nothing, ever. AC5's sentence, next to a milestone whose author has left.
 *   Kaia   — nothing, ever, and no milestone either: AC5 at its emptiest.
 */
const READINGS: Record<string, TraineeReadings> = {
  [LINA_ID]: {
    weights: weightSeries().map((p) => ({ date: p.date, value: p.weightKg })),
    bodyFats: [
      { date: isoDate(50), value: 24.0 },
      { date: isoDate(1), value: 22.5 },
    ],
  },
  [NILS_ID]: {
    weights: [{ date: isoDate(1), value: 72.5 }],
    bodyFats: [],
  },
  [SARA_ID]: { weights: [], bodyFats: [] },
  [DANA_ID]: {
    weights: [
      { date: isoDate(15), value: 64.8 },
      { date: isoDate(8), value: 64.5 },
      { date: isoDate(1), value: 64.2 },
    ],
    bodyFats: [{ date: isoDate(15), value: 21.0 }],
  },
  [OMAR_ID]: {
    weights: [{ date: isoDate(3), value: 81.0 }],
    bodyFats: [],
  },
  [TOBIAS_ID]: {
    weights: [
      { date: isoDate(35), value: 88.4 },
      { date: isoDate(28), value: 88.0 },
      { date: isoDate(21), value: 87.6 },
    ],
    bodyFats: [
      { date: isoDate(33), value: 26.0 },
      { date: isoDate(19), value: 25.2 },
    ],
  },
  [KAIA_ID]: { weights: [], bodyFats: [] },
};

/** What a coach has written. Stored WHOLE, because the PUT replaces the whole thing. */
interface ProgressGoalRecord {
  startedOn: string | null;
  milestoneWeightKg: number | null;
  /** Null WITH a milestone = the `ON DELETE SET NULL` case: the coach has left. */
  setByName: string | null;
  updatedAt: string | null;
}

/** The first reading on or after `from` — never the earliest reading of all time. */
function firstOnOrAfter(
  readings: TraineeProgressReading[],
  from: string
): TraineeProgressReading | null {
  return readings.find((r) => r.date >= from) ?? null;
}

function latest(readings: TraineeProgressReading[]): TraineeProgressReading | null {
  return readings.length === 0 ? null : readings[readings.length - 1];
}

/** `null` unless BOTH ends exist. `0` is a real delta and must not come from here. */
function delta(
  start: TraineeProgressReading | null,
  current: TraineeProgressReading | null
): number | null {
  if (start === null || current === null) return null;
  return Number((current.value - start.value).toFixed(2));
}

/**
 * The block, recomputed on every read — which is what makes a saved start date move
 * the baseline on the very next render rather than at the next restart.
 *
 * `since` is passed in rather than looked up, so this can be called from inside an
 * `OVERVIEWS` entry without the entry calling itself.
 */
function progressGoalFor(id: string, since: string): TraineeProgressGoal {
  const stored = state().progressGoals.get(id) ?? null;
  const readings = READINGS[id] ?? { weights: [], bodyFats: [] };

  // Never null on the wire: it falls back to the link date, and the SOURCE says so.
  const startedOn = stored?.startedOn ?? since.slice(0, 10);
  const startWeight = firstOnOrAfter(readings.weights, startedOn);
  const currentWeight = latest(readings.weights);
  const startBodyFat = firstOnOrAfter(readings.bodyFats, startedOn);
  const currentBodyFat = latest(readings.bodyFats);
  const milestoneWeightKg = stored?.milestoneWeightKg ?? null;

  return {
    startedOn,
    startedOnSource: stored?.startedOn ? "COACH" : "LINK_DEFAULT",
    milestoneWeightKg,
    milestoneSetByName: milestoneWeightKg === null ? null : (stored?.setByName ?? null),
    milestoneSource: milestoneWeightKg === null ? null : "COACH",
    milestoneUpdatedAt: milestoneWeightKg === null ? null : (stored?.updatedAt ?? null),
    startWeight,
    currentWeight,
    startBodyFat,
    currentBodyFat,
    weightDeltaKg: delta(startWeight, currentWeight),
    bodyFatDeltaPts: delta(startBodyFat, currentBodyFat),
    /**
     * 🔴 SIGNED — `milestone − current`. Positive is a bulk and negative a cut; the
     * fixture sends it exactly as the api does, so a portal that printed it raw would
     * render "−2.4 kg to go" here too rather than only against production.
     */
    weightToGoKg:
      milestoneWeightKg === null || currentWeight === null
        ? null
        : Number((milestoneWeightKg - currentWeight.value).toFixed(2)),
  };
}

/**
 * Every overview, with its progress block attached.
 *
 * The scope decides it, from the entry's OWN `scopes` list: `null` for a link without
 * `WEIGH_INS` (Petra, Yusuf, Mara), and a block for everyone else — INCLUDING the
 * trainees who have never recorded anything, whose block is non-null and full of
 * nulls. Those are two different facts and the portal renders two different sentences
 * for them, so the fixture must not collapse them either.
 */
const OVERVIEWS: Record<string, () => ClientOverview> = Object.fromEntries(
  Object.entries(BASE_OVERVIEWS).map(([id, build]) => [
    id,
    () => {
      const overview = build();
      return {
        ...overview,
        progressGoal: overview.scopes.includes("WEIGH_INS")
          ? progressGoalFor(id, overview.since)
          : null,
      };
    },
  ])
);

/** The link date, for the `LINK_DEFAULT` fallback on the write path. */
function sinceOf(id: string): string {
  return BASE_OVERVIEWS[id]().since;
}

/* ════════════════════════════════════════════════════════════════════════════
 * EV-187b — the monitoring read, `GET /coach-portal/clients/{id}/progress`.
 *
 * The api half (b-fit-api `b19c1f3`) is MERGED AND DEPLOYED, so unlike the routine and
 * nutrition fixtures this one is a twin of something real. It exists for the same two
 * reasons the rest of this file does: the Playwright suite runs without an api, and the
 * demo can show states a dev database does not happen to contain.
 *
 * TWO PLACES IT KNOWINGLY SIMPLIFIES, named rather than hidden:
 *
 *   1. **The missed-session evidence is not bucketed into the ISO week.** The api lists
 *      the days of THIS week that were scheduled, have passed, and have no completed
 *      session (ADR-0012 D6). The fixture serves two fixed recent dates instead, so the
 *      "2 flags" row does not become "1 flag" every Monday and Tuesday and take the
 *      suite with it. What the fixture demonstrates is the RENDERING of evidence; that
 *      the evidence is the same computation as the flag is asserted api-side, where the
 *      computation is.
 *   2. **The weeks are hand-written, not derived from sessions.** The api buckets one
 *      range read. Here the series and the session list are two literals that are kept
 *      consistent BY CONSTRUCTION where an AC compares them — the current week equals
 *      the overview's `adherenceThisWeek`, and `items[0]` equals the overview's
 *      `lastSession` — because those are exactly the two comparisons AC3 and AC5 ask QA
 *      to make on one screen.
 * ════════════════════════════════════════════════════════════════════════════ */

/** The Monday (UTC) of the ISO week `weeksAgo` weeks before the current one. */
function mondayOfWeeksAgo(weeksAgo: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const mondayIndex = (d.getUTCDay() + 6) % 7; // 0 = Monday … 6 = Sunday
  d.setUTCDate(d.getUTCDate() - mondayIndex - weeksAgo * 7);
  return d.toISOString().slice(0, 10);
}

/** `[done, planned]`, or `null` for a week in which no plan existed ("No plan"). */
type WeekSpec = [done: number, planned: number] | null;

/**
 * Eight `WeekSpec`s, oldest first, → the wire's `AdherenceSeries`.
 *
 * `plannedSoFar` is `planned` for a completed week and, for the current one, the number
 * of scheduled days that have already passed — which is the whole of ADR-0012 D6 as it
 * applies to the series: a Monday must not read as a 0 % week.
 */
function adherenceSeries(specs: WeekSpec[]): AdherenceSeries {
  const elapsedThisWeek = (new Date().getUTCDay() + 6) % 7; // Mon = 0 days elapsed
  const weeks: WeekAdherence[] = specs.map((spec, i) => {
    const weeksAgo = specs.length - 1 - i;
    const partial = weeksAgo === 0;
    const [done, planned] = spec ?? [0, 0];
    return {
      weekCommencing: mondayOfWeeksAgo(weeksAgo),
      done,
      planned,
      plannedSoFar: partial ? Math.min(planned, elapsedThisWeek) : planned,
      hasPlan: spec !== null,
      partial,
    };
  });
  // Summed here, as the api sums them, so the headline and the bars cannot disagree.
  return {
    done: weeks.reduce((sum, w) => sum + w.done, 0),
    planned: weeks.reduce((sum, w) => sum + w.planned, 0),
    weeks,
  };
}

/** `[daysAgo, name, difficulty]` → one history row. */
type SessionSpec = [daysAgo: number, name: string | null, difficulty: SessionFeedback | null];

/** Session rows, newest first, with the api's own summary counts derived from them. */
function sessionHistory(specs: SessionSpec[]): SessionHistory {
  const items: SessionHistoryItem[] = specs
    .slice(0, 10)
    .map(([daysAgo, name, difficulty]) => ({ date: isoDate(daysAgo), name, difficulty }));
  const count = (value: SessionFeedback) => items.filter((i) => i.difficulty === value).length;
  return {
    returned: items.length,
    easy: count("EASY"),
    ok: count("OK"),
    hard: count("HARD"),
    noFeedback: items.filter((i) => i.difficulty === null).length,
    items,
  };
}

/** The `MISSED_TWO_OR_MORE_SESSIONS` flag with its evidence. Never empty. */
function missedFlag(missed: [daysAgo: number, sessionName: string | null][]): FiredRedFlag {
  return {
    flag: "MISSED_TWO_OR_MORE_SESSIONS",
    missedSessions: missed.map(([daysAgo, sessionName]) => ({
      date: isoDate(daysAgo),
      sessionName,
    })),
    weighIn: null,
  };
}

/**
 * The `NO_WEIGH_IN_14_DAYS` flag. `daysAgo === null` is the ONLY case that renders
 * "Never weighed in" — a trainee who weighed in long ago carries a real date.
 */
function noWeighInFlag(daysAgo: number | null): FiredRedFlag {
  return {
    flag: "NO_WEIGH_IN_14_DAYS",
    missedSessions: null,
    weighIn: {
      lastWeighInDate: daysAgo === null ? null : isoDate(daysAgo),
      daysSince: daysAgo,
    },
  };
}

const PROGRESS_WEEKS = 8; // `TraineeProgressResponse.weeks` — a server constant.

/**
 * The progress read, by id. Every id here also has an overview, and the two agree
 * where an AC compares them.
 *
 * A trainee whose link lacks PROGRESS is NOT in this map and never reaches it: the api
 * names PROGRESS at the guard, so Petra, Yusuf and Mara are answered 403 — the same
 * undifferentiated 403 as a revoked link and an id that never existed. The portal
 * renders their "not shared" sentence from `scopes`, never from that status.
 */
const PROGRESS: Record<string, () => TraineeProgress> = {
  [LINA_ID]: () => ({
    clientId: LINA_ID,
    weeks: PROGRESS_WEEKS,
    // The last week is 2 / 4 — identical to her overview's "Adherence this week"
    // (AC3's last clause). The 0/0 week is the one before her plan existed.
    adherence: adherenceSeries([[3, 3], null, [3, 4], [0, 4], [4, 4], [2, 4], [3, 4], [2, 4]]),
    // 12 completed sessions, capped at 10 server-side. `items[0]` IS her overview's
    // "Last session": 1 day ago, Upper Body A, Hard.
    sessions: sessionHistory([
      [1, "Upper Body A", "HARD"],
      [4, "Lower Body A", "OK"],
      [6, "Upper Body B", "OK"],
      [8, "Lower Body B", null],
      [11, "Upper Body A", "EASY"],
      [13, "Lower Body A", "HARD"],
      [15, "Upper Body B", "OK"],
      [18, "Lower Body B", "OK"],
      [20, "Upper Body A", "EASY"],
      [22, "Lower Body A", "HARD"],
      [25, "Upper Body B", "OK"],
      [27, "Lower Body B", "OK"],
    ]),
    redFlags: [missedFlag([[3, "Lower Body B"], [5, "Upper Body B"]])],
    scopes: ALL_SCOPES,
  }),
  [TOBIAS_ID]: () => ({
    clientId: TOBIAS_ID,
    weeks: PROGRESS_WEEKS,
    // A 7 / 7 week (edge case 2: the label must not wrap and the bar must not
    // overflow), and a current week of 0 / 3 — his overview's figure.
    adherence: adherenceSeries([[7, 7], [4, 5], [3, 5], [2, 5], [0, 3], [1, 3], [0, 3], [0, 3]]),
    sessions: sessionHistory([
      [9, "Legs", "HARD"],
      [12, "Pull", "HARD"],
      [14, "Push", null],
      [17, "Legs", "HARD"],
      [19, "Pull", "OK"],
      [21, "Push", "HARD"],
      [24, "Legs", "OK"],
      [26, "Pull", null],
      [28, "Push", "EASY"],
      [31, "Legs", "HARD"],
    ]),
    // Both live rules, on one page, with their two different evidence shapes.
    redFlags: [missedFlag([[2, "Push"], [4, "Pull"]]), noWeighInFlag(21)],
    scopes: ALL_SCOPES,
  }),
  [NILS_ID]: () => ({
    clientId: NILS_ID,
    weeks: PROGRESS_WEEKS,
    adherence: adherenceSeries([null, null, [2, 3], [3, 3], [1, 3], [2, 3], [2, 3], [1, 3]]),
    // Six, not ten: AC5's "Of the last 6 sessions: …", which must never read
    // "of the last 10".
    sessions: sessionHistory([
      [2, "Full Body A", "OK"],
      [5, "Full Body B", "EASY"],
      [7, "Full Body A", "OK"],
      [9, "Full Body B", null],
      [12, "Full Body A", "HARD"],
      [14, "Full Body B", "OK"],
    ]),
    redFlags: [],
    scopes: ALL_SCOPES,
  }),
  [SARA_ID]: () => ({
    clientId: SARA_ID,
    weeks: PROGRESS_WEEKS,
    // PROGRESS is held (so this read is not a 403) but WORKOUTS is not, so both
    // workout blocks are ABSENT — not zero, not an empty list.
    adherence: null,
    sessions: null,
    // She has never logged a weight in either table: the one trainee for whom
    // "Never weighed in" is true.
    redFlags: [noWeighInFlag(null)],
    scopes: ["PROGRESS", "WEIGH_INS"],
  }),
  [KAIA_ID]: () => ({
    clientId: KAIA_ID,
    weeks: PROGRESS_WEEKS,
    // Edge case 1 — an eight-week series in which nothing was ever scheduled. This
    // must render "No sessions in the last 8 weeks", NOT eight 0 % bars.
    adherence: adherenceSeries([null, null, null, null, null, null, null, null]),
    sessions: sessionHistory([]),
    redFlags: [noWeighInFlag(null)],
    scopes: ALL_SCOPES,
  }),
  [DANA_ID]: () => ({
    clientId: DANA_ID,
    weeks: PROGRESS_WEEKS,
    adherence: adherenceSeries([[2, 2], [1, 2], [2, 2], [2, 2], [0, 2], [2, 2], [1, 2], [2, 2]]),
    sessions: sessionHistory([
      [1, "Push", "OK"],
      [3, "Pull", "EASY"],
      [6, "Push", "OK"],
      [8, "Pull", "OK"],
      [10, "Push", "HARD"],
    ]),
    redFlags: [],
    scopes: ALL_SCOPES,
  }),
  [OMAR_ID]: () => ({
    clientId: OMAR_ID,
    weeks: PROGRESS_WEEKS,
    adherence: adherenceSeries([[3, 3], [2, 3], [1, 3], [3, 3], [2, 3], [1, 3], [2, 3], [1, 3]]),
    sessions: sessionHistory([
      [4, "Full Body A", "EASY"],
      [7, "Full Body B", "OK"],
      [9, "Full Body A", "OK"],
    ]),
    redFlags: [],
    scopes: ALL_SCOPES,
  }),
};

/**
 * EV-187 AC2's order, as the api computes it — `CoachPortalQueryService`'s two
 * comparators, mirrored field for field.
 *
 * **The portal does not sort.** The key spans the whole roster and the portal holds one
 * page of it, so a client-side sort would order page 1 among itself and call it triage.
 * That is why this lives in the fixture (the api's twin) and not in a component.
 */
function sortRoster(items: RosterClient[], sort: RosterSort): RosterClient[] {
  const MIN = "0000-00-00";
  const MAX = "9999-99-99";
  const activityShared = (c: RosterClient) => c.scopes.includes("PROGRESS");
  /** Longest silence first; a WITHHELD date is unknown, not silent, so it goes last. */
  const silenceKey = (c: RosterClient) =>
    !activityShared(c) ? MAX : (c.lastCompletedWorkoutDate ?? MIN);
  /** Most recent first; unknown last, for the same reason in the other direction. */
  const activityKey = (c: RosterClient) =>
    !activityShared(c) || c.lastCompletedWorkoutDate === null ? MIN : c.lastCompletedWorkoutDate;
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

  return [...items].sort((a, b) => {
    if (sort === "recent_activity") {
      return (
        cmp(activityKey(b), activityKey(a)) ||
        a.traineeDisplayName.localeCompare(b.traineeDisplayName) ||
        cmp(a.id, b.id)
      );
    }
    // null = "not shared": ranked after every row whose flags COULD be evaluated,
    // including the rows that have none. A consent boundary is not good news.
    const rank = (c: RosterClient) => (c.redFlagCount === null ? 1 : 0);
    const flags = (c: RosterClient) => c.redFlagCount ?? 0;
    return (
      rank(a) - rank(b) ||
      flags(b) - flags(a) ||
      cmp(silenceKey(a), silenceKey(b)) ||
      a.traineeDisplayName.localeCompare(b.traineeDisplayName) ||
      cmp(a.id, b.id)
    );
  });
}

/* Revoke, drafts, published plans and nutrition all live in `state()` — see the
 * FIXTURE STATE block further down for why none of it may be a module-level `let`. */

/* ════════════════════════════════════════════════════════════════════════════
 * EV-184b / EV-185b fixture state.
 *
 * The api half is unbuilt (ADR-0015 in progress), so these two tabs run ONLY in
 * fixture mode today. That makes this file load-bearing in a way the roster's
 * fixture was not, and it is held to the same two rules: the shapes are the
 * exported contract types, so the day the api lands a mismatch is a compile
 * error; and nothing here is reachable in `live` mode.
 *
 * **The scenario selector is the trainee id.** The roster lists one trainee, but
 * `getClient`/`getRoutine`/`getNutrition` answer for five — which is exactly how
 * b-fit-api behaves (the roster and the per-trainee reads are separate calls) and
 * is what lets QA drive every state from one dev server without restarting it
 * with a different env var.
 *
 *   …0001 Lina M.  — populated routine AND nutrition; no injuries, so publish
 *                    previews with zero repairs ("No changes were needed").
 *   …0002 Nils K.  — no active plan ("No active plan") and no nutrition at all
 *                    ("No nutrition set up yet").
 *   …0003 Sara P.  — shares PROGRESS + WEIGH_INS only: the overview is complete,
 *                    both tabs read their scope sentence.
 *   …0004 Dana W.  — an injury that repairs two exercises on publish, and a
 *                    49-character exercise name for the truncation case.
 *   …0005 Omar T.  — the exercise catalog is unavailable (503), and his weekly
 *                    apply answers D6.6's 429 COACH_WEEK_APPLY_RATE_LIMIT.
 *   …0006 Petra L. — NUTRITION only: every overview block is absent, Routine reads
 *                    its scope sentence, Nutrition works.
 *   …0007 Yusuf A. — WORKOUTS only: the mirror of Petra.
 *   …0008 Mara D.  — an ACTIVE link that shares NOTHING. Reachable, and blank.
 *
 * The scope denials answer the ordinary 403 body, NOT a scope-specific code
 * (ADR-0015 D5): the portal must never be able to pass a test by reading a code the
 * api does not send. In practice the tab does not even call — it reads `scopes` off
 * the overview — so these branches exist to keep the fixture truthful, not to be the
 * thing under test.
 *
 * Omar is a note about honesty: catalog availability is a property of the
 * SERVER, not of a trainee. Keying the 503 on his id is a fixture affordance so
 * the state is reachable beside the others; it is not a claim that b-fit-api
 * would ever answer per-trainee. Do not carry that shape into the api.
 *
 * Mutations are module state, so a save/discard/publish survives the reload AC2
 * asks for within one dev-server process, and nothing survives a restart.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Fixture affordance only. See the block above. */
const CATALOG_DOWN_IDS = new Set([OMAR_ID]);
/** Likewise: the link whose weekly apply answers D6.6's 429. */
const WEEK_APPLY_CAPPED_IDS = new Set([OMAR_ID]);
/**
 * Likewise: the link whose publish preview answers EV-184 AC4's
 * `COACH_PLAN_EMPTY`.
 *
 * This one is a simulation rather than a state the fixture can reach, and it is here
 * deliberately. EV-190 AC1 put `TrainingDayBounds` on the add/remove controls, so the
 * editor can no longer be driven to zero training days and the portal cannot produce
 * this refusal by itself — but **the api still answers it**, and the portal still has
 * to render "A plan needs at least one training day." Without this switch that mapping
 * would have no assertion anywhere in the repo, which is coverage leaving quietly
 * rather than a case that stopped existing.
 */
const PLAN_EMPTY_ON_PUBLISH_IDS = new Set([NILS_ID]);

/**
 * `GET /coach-portal/catalog/exercises` carries no trainee id — it is a server-wide
 * read, and rightly so. The fixture therefore remembers which trainee's routine page
 * was opened last and answers 503 while that is the catalog-down scenario.
 *
 * This is the one place the fixture keeps state the api would not, and it is confined
 * to the fixture on purpose: adding a client id to the catalog path so the outage could
 * be addressed "properly" would be this file's convenience leaking into the contract.
 */
function catalogIsDown(): boolean {
  const last = state().lastRoutineClient;
  return last !== null && CATALOG_DOWN_IDS.has(last);
}

async function fail(status: number, code: string, message: string): Promise<never> {
  const { ApiError } = await import("./apiFetch");
  throw new ApiError(status, message, code);
}

/**
 * The same refusal, carrying ADR-0013's third envelope member.
 *
 * Only `409 COACH_DRAFT_EXISTS` needs one today, and it needs it badly: the portal's
 * retry echoes `details.existingUpdatedAt`, so a fixture that dropped `details` would
 * make the retry untestable and the confirm dialog a claim nobody had checked.
 */
async function failWithDetails(
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown>
): Promise<never> {
  const { ApiError } = await import("./apiFetch");
  throw new ApiError(status, message, code, details);
}

/**
 * Every read and write in both tabs goes through this first.
 *
 * One body for all four denials — revoked, unknown id, no link, scope missing — which
 * is ADR-0015 D5's "the denial body stays undifferentiated". A fixture that shouted
 * COACH_SCOPE_MISSING would let the portal be built against an oracle production
 * refuses to be.
 */
async function assertScope(id: string, required: CoachAccessScope): Promise<void> {
  const overview = OVERVIEWS[id];
  if (state().revoked || !overview || !overview().scopes.includes(required)) {
    await fail(403, "COACH_ACCESS_DENIED", "Forbidden");
  }
}

// ── the exercise catalog ────────────────────────────────────────────────────

/**
 * A small stand-in for the 1,235-row catalog. The four fields are
 * `ExerciseCatalogEntry`'s: slug, name, primaryMuscles, equipment.
 */
const CATALOG: CatalogExercise[] = [
  { slug: "barbell-back-squat", name: "Barbell Back Squat", primaryMuscles: "Quadriceps", equipment: "Barbell" },
  { slug: "goblet-squat", name: "Goblet Squat", primaryMuscles: "Quadriceps", equipment: "Dumbbell" },
  { slug: "leg-press", name: "Leg Press", primaryMuscles: "Quadriceps", equipment: "Machine" },
  { slug: "romanian-deadlift", name: "Romanian Deadlift", primaryMuscles: "Hamstrings", equipment: "Barbell" },
  { slug: "seated-leg-curl", name: "Seated Leg Curl", primaryMuscles: "Hamstrings", equipment: "Machine" },
  { slug: "hip-thrust", name: "Hip Thrust", primaryMuscles: "Glutes", equipment: "Barbell" },
  { slug: "walking-lunge", name: "Walking Lunge", primaryMuscles: "Glutes", equipment: "Dumbbell" },
  { slug: "standing-calf-raise", name: "Standing Calf Raise", primaryMuscles: "Calves", equipment: "Machine" },
  { slug: "barbell-bench-press", name: "Barbell Bench Press", primaryMuscles: "Chest", equipment: "Barbell" },
  { slug: "dumbbell-bench-press", name: "Dumbbell Bench Press", primaryMuscles: "Chest", equipment: "Dumbbell" },
  { slug: "machine-chest-press", name: "Machine Chest Press", primaryMuscles: "Chest", equipment: "Machine" },
  { slug: "push-up", name: "Push-Up", primaryMuscles: "Chest", equipment: null },
  { slug: "barbell-overhead-press", name: "Barbell Overhead Press", primaryMuscles: "Shoulders", equipment: "Barbell" },
  { slug: "landmine-press", name: "Landmine Press", primaryMuscles: "Shoulders", equipment: "Barbell" },
  { slug: "cable-lateral-raise", name: "Cable Lateral Raise", primaryMuscles: "Shoulders", equipment: "Cable" },
  {
    slug: "single-arm-standing-cable-lateral-raise-with-pause",
    // 49 characters — EV-184 edge case 6's long name, in the catalog so it is
    // reachable by picking rather than only by fixture seeding.
    name: "Single-Arm Standing Cable Lateral Raise With Pause",
    primaryMuscles: "Shoulders",
    equipment: "Cable",
  },
  { slug: "lat-pulldown", name: "Lat Pulldown", primaryMuscles: "Back", equipment: "Cable" },
  { slug: "seated-cable-row", name: "Seated Cable Row", primaryMuscles: "Back", equipment: "Cable" },
  { slug: "chest-supported-row", name: "Chest-Supported Row", primaryMuscles: "Back", equipment: "Dumbbell" },
  { slug: "pull-up", name: "Pull-Up", primaryMuscles: "Back", equipment: null },
  { slug: "barbell-curl", name: "Barbell Curl", primaryMuscles: "Biceps", equipment: "Barbell" },
  { slug: "incline-dumbbell-curl", name: "Incline Dumbbell Curl", primaryMuscles: "Biceps", equipment: "Dumbbell" },
  { slug: "cable-triceps-pushdown", name: "Cable Triceps Pushdown", primaryMuscles: "Triceps", equipment: "Cable" },
  { slug: "plank", name: "Plank", primaryMuscles: "Core", equipment: null },
  { slug: "hanging-knee-raise", name: "Hanging Knee Raise", primaryMuscles: "Core", equipment: null },
];

function catalogBySlug(slug: string): CatalogExercise | undefined {
  return CATALOG.find((e) => e.slug === slug);
}

function exercise(slug: string, sets: number, reps: string, rest: string): RoutineExerciseEntry {
  const entry = catalogBySlug(slug);
  if (!entry) throw new Error(`fixture: unknown catalog slug ${slug}`);
  return {
    catalogSlug: entry.slug,
    name: entry.name,
    primaryMuscles: entry.primaryMuscles,
    equipment: entry.equipment,
    sets,
    reps,
    rest,
  };
}

// ── routine state ───────────────────────────────────────────────────────────

/**
 * The fixture's stand-in for `RoutinePolicy.apply(routine, injuries)`.
 *
 * INJURIES ONLY, and deliberately so: the equipment-aware replacement is BUG-053,
 * approved at b-fit-api `eb75bc3` and NOT deployed (EV-184 AC3's warning). A fixture
 * that repaired for equipment would let the portal be built against a guarantee the
 * engine does not make.
 */
const REPAIR_RULES: { injury: string; exercise: string; replacement: string; rule: string }[] = [
  {
    injury: "SHOULDER",
    exercise: "Barbell Overhead Press",
    replacement: "landmine-press",
    rule: "Overhead pressing is contraindicated by a shoulder injury",
  },
  {
    injury: "SHOULDER",
    exercise: "Barbell Bench Press",
    replacement: "machine-chest-press",
    rule: "Flat barbell pressing is contraindicated by a shoulder injury",
  },
];

/**
 * `CoachRoutineResponse.guardrails` per trainee — **in the api's vocabularies**.
 *
 * This map used to hold catalog words ("Barbell", "Dumbbell", "Cable", "Machine") and
 * prose injuries ("Left shoulder impingement"). Neither is what b-fit-api sends:
 * `user_profiles.equipment` holds ADR-0005 D1a's eleven tokens and
 * `user_profiles.injuries` holds the onboarding chips' SCREAMING_SNAKE tokens plus the
 * trainee's free-text note, verbatim. A fixture speaking a prettier vocabulary than the
 * wire is the same defect as a client typing a field the wire does not carry: it makes
 * the rendering code that turns tokens into words unnecessary, so nobody writes it, and
 * the live screen SHOUTS at a coach.
 *
 * Dana's list carries both kinds on purpose — a chip token AND a free-text sentence —
 * because they are labelled by two different rules (`src/lib/guardrailLabels.ts`).
 *
 * `equipmentChecked` is DERIVED from the list being non-empty, exactly as
 * `RoutinePlanWriter.GuardrailInputs.equipmentChecked()` derives it. Sara's empty list
 * is therefore an UNANSWERED equipment question, which is the state the routine tab's
 * "Not answered yet." sentence exists for and the only place it is reachable.
 */
const GUARDRAILS: Record<string, CoachRoutineGuardrails> = {
  [LINA_ID]: guardrails([], ["BARBELL", "DUMBBELLS", "CABLE_MACHINE", "GYM"]),
  [NILS_ID]: guardrails([], ["DUMBBELLS"]),
  [SARA_ID]: guardrails([], []),
  [DANA_ID]: guardrails(
    ["SHOULDER", "Sharp pain in the left shoulder on anything overhead"],
    ["BARBELL", "DUMBBELLS", "CABLE_MACHINE", "GYM"]
  ),
  [OMAR_ID]: guardrails([], ["BARBELL", "DUMBBELLS"]),
  // Petra and Mara never reach the routine tab (no WORKOUTS scope); Yusuf does.
  [YUSUF_ID]: guardrails([], ["DUMBBELLS", "PULL_UP_BAR"]),
};

function guardrails(injuries: string[], equipment: string[]): CoachRoutineGuardrails {
  return { injuries, equipment, equipmentChecked: equipment.length > 0 };
}

function guardrailsFor(id: string): CoachRoutineGuardrails {
  return GUARDRAILS[id] ?? guardrails([], []);
}

function linaPlan(): RoutinePlanView {
  return {
    planId: "plan-lina-0001",
    name: "Intermediate Muscle Building Routine",
    trainingDays: [
      {
        dayOfWeek: 1,
        focus: "Upper Body A",
        exercises: [
          exercise("barbell-bench-press", 4, "6-8", "120s"),
          exercise("seated-cable-row", 4, "8-10", "90s"),
          exercise("barbell-overhead-press", 3, "8-10", "90s"),
          exercise("cable-triceps-pushdown", 3, "12-15", "60s"),
        ],
      },
      {
        dayOfWeek: 3,
        focus: "Lower Body",
        exercises: [
          exercise("barbell-back-squat", 4, "5-8", "150s"),
          exercise("romanian-deadlift", 3, "8-10", "120s"),
          exercise("standing-calf-raise", 3, "12-15", "60s"),
        ],
      },
      {
        dayOfWeek: 5,
        focus: "Upper Body B",
        exercises: [
          exercise("lat-pulldown", 4, "8-10", "90s"),
          exercise("dumbbell-bench-press", 3, "8-12", "90s"),
          exercise("incline-dumbbell-curl", 3, "10-12", "60s"),
        ],
      },
    ],
  };
}

function danaPlan(): RoutinePlanView {
  return {
    planId: "plan-dana-0004",
    name: "Shoulder-Friendly Push Pull",
    trainingDays: [
      {
        dayOfWeek: 2,
        focus: "Push",
        exercises: [
          exercise("barbell-overhead-press", 4, "6-8", "120s"),
          exercise("barbell-bench-press", 4, "6-8", "120s"),
          exercise("single-arm-standing-cable-lateral-raise-with-pause", 3, "12-15", "45s"),
        ],
      },
      {
        dayOfWeek: 5,
        focus: "Pull",
        exercises: [
          exercise("pull-up", 4, "6-10", "120s"),
          exercise("chest-supported-row", 3, "10-12", "90s"),
        ],
      },
    ],
  };
}

/** Yusuf shares his workouts and nothing else — a plain two-day plan is enough. */
function yusufPlan(): RoutinePlanView {
  return {
    planId: "plan-yusuf-0007",
    name: "Two Day Full Body",
    trainingDays: [
      {
        dayOfWeek: 2,
        focus: "Full Body A",
        exercises: [
          exercise("goblet-squat", 3, "10-12", "90s"),
          exercise("machine-chest-press", 3, "10-12", "90s"),
          exercise("lat-pulldown", 3, "10-12", "90s"),
        ],
      },
      {
        dayOfWeek: 4,
        focus: "Full Body B",
        exercises: [
          exercise("leg-press", 3, "12-15", "90s"),
          exercise("seated-cable-row", 3, "10-12", "90s"),
        ],
      },
    ],
  };
}

function omarPlan(): RoutinePlanView {
  return {
    planId: "plan-omar-0005",
    name: "Full Body Three Day",
    trainingDays: [
      {
        dayOfWeek: 1,
        focus: "Full Body A",
        exercises: [
          exercise("goblet-squat", 3, "10-12", "90s"),
          exercise("dumbbell-bench-press", 3, "8-12", "90s"),
        ],
      },
    ],
  };
}

/**
 * The fixture's store → the api's `Routine` document.
 *
 * The fixture keeps plans in the EDITOR's shape because that is what its repair engine
 * edits; the wire is a full `Routine`, so the conversion happens at the boundary —
 * `getRoutine` and `getRoutineDraft` — and nowhere else.
 *
 * The five fields no coach control touches (`goal`, `level`, `weeklyProgression`,
 * `constraints`, `summary`) are FIXTURE DATA, invented here on purpose and only here: a
 * real routine has them because the generator wrote them, and a fixture standing in for
 * a generated routine has to carry them or the portal would be built against a document
 * shape the api cannot produce. They are deliberately absent from the portal's own code
 * — see the ⛔ write-path block in `coachApi.ts` for why the portal must not invent
 * them, which is a different question from whether the fixture may.
 *
 * Note the exercise conversion DROPS `catalogSlug`, `primaryMuscles` and `equipment`.
 * That is not a shortcut: `com.bfit.application.dto.routine.RoutineExercise` has no
 * such fields, so an exercise the coach picks and saves comes back without them, and
 * the fixture must lose them at the same point the api does.
 */
function toRoutineDocument(id: string, plan: RoutinePlanView): Routine {
  const rails = guardrailsFor(id);
  return {
    name: plan.name,
    goal: "BUILD_MUSCLE",
    level: "INTERMEDIATE",
    // `RoutinePlanWriter.reconcileIdentity` derives this from the day count and
    // ignores any declared value, so the fixture derives it the same way.
    daysPerWeek: plan.trainingDays.length,
    trainingDays: plan.trainingDays.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      focus: day.focus,
      estimatedMinutes: null,
      exercises: day.exercises.map((ex) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        rest: ex.rest,
        tempo: null,
        notes: null,
        trackingType: "WEIGHT_REPS" as const,
        durationSeconds: null,
        weight: null,
      })),
    })),
    weeklyProgression: [
      { week: 2, adjustment: "Add one set to the main compound lifts", rationale: null },
    ],
    constraints: {
      // The trainee's OWN stored answers, the same two lists the guardrail panel shows
      // — `Constraints` is the routine echoing back what it was built to respect.
      equipment: rails.equipment,
      injuries: rails.injuries,
      minutesPerSession: 45,
      daysPerWeek: plan.trainingDays.length,
    },
    summary: null,
  };
}


// ── EV-188b the coach's routine library ─────────────────────────────────────

/**
 * The fixture's half of EV-188.
 *
 * It reproduces the api's REFUSALS, not just its happy paths, because every one of
 * them has a sentence on screen that would otherwise be untestable: the folded name
 * collision, the bounded `(copy N)` probe, the 50 cap, the 12-per-day bound, the
 * legacy trainee with no routine, and — the one that matters most — apply's
 * **default-refusing** 409 carrying `details.existingUpdatedAt`.
 *
 * ⚠ It does NOT reproduce the api's `@Valid` refusal of a sub-publishable document,
 * and that is deliberate: `src/lib/templateDocument.ts` stops such a document from
 * being sent at all, so a fixture 400 would test a path the portal cannot reach. What
 * IS tested is that the editor refuses first — which is the behaviour ADR-0016
 * §Amendment V1b obliges this surface to have.
 */
const TEMPLATE_LIMIT = 50; // CoachTemplateUseCase.MAX_TEMPLATES_PER_COACH
const COPY_SUFFIX_MAX = 20; // the probe is BOUNDED, never a loop

/** The api folds case and surrounding whitespace for the uniqueness key. */
function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

function templateDocument(name: string, days: RoutineDayEntry[]): Routine {
  return {
    name,
    goal: "BUILD_MUSCLE",
    level: "INTERMEDIATE",
    daysPerWeek: days.length,
    trainingDays: days.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      focus: day.focus,
      estimatedMinutes: null,
      exercises: day.exercises.map((ex) => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        rest: ex.rest,
        tempo: null,
        notes: null,
        trackingType: "WEIGHT_REPS" as const,
        durationSeconds: null,
        weight: null,
      })),
    })),
    weeklyProgression: [],
    // AC4: ALWAYS empty. The api strips on write and refuses on read; the fixture
    // must not be the one place a trainee's answers survive in a template.
    constraints: { equipment: [], injuries: [], minutesPerSession: 45, daysPerWeek: days.length },
    summary: null,
  };
}

/**
 * A raw exercise name that is NOT in the fixture catalog, so AC5's unbindable mark is
 * reachable. The api's version of this is a fuzzy matcher over a catalogue that moves;
 * here it is simply a name with no row, which produces the same observable.
 */
function rawEntry(name: string, sets: number, reps: string, rest: string): RoutineExerciseEntry {
  return { catalogSlug: null, name, primaryMuscles: null, equipment: null, sets, reps, rest };
}

/**
 * Two seeded templates, because an empty library and a populated one are different
 * screens and both are ACs. "Legacy strength" carries two exercise names the catalog
 * has never held — that is AC5's scenario, and it is seeded rather than constructed
 * through the editor because the editor cannot produce one (an exercise can only arrive
 * through `CatalogPicker`).
 */
function seedTemplates(): CoachTemplate[] {
  const now = Date.now();
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  return [
    {
      id: "7c2d0a11-0000-4000-8000-0000000000b1",
      name: "Upper / Lower split",
      schemaVersion: 1,
      document: templateDocument("Upper / Lower split", [
        {
          dayOfWeek: 1,
          focus: "Upper body",
          exercises: [
            exercise("barbell-bench-press", 4, "6-8", "120s"),
            exercise("chest-supported-row", 4, "8-10", "90s"),
            exercise("barbell-overhead-press", 3, "8-10", "90s"),
          ],
        },
        {
          dayOfWeek: 4,
          focus: "Lower body",
          exercises: [
            exercise("barbell-back-squat", 4, "5-6", "150s"),
            exercise("romanian-deadlift", 3, "8-10", "120s"),
            exercise("standing-calf-raise", 3, "12-15", "60s"),
          ],
        },
      ]),
      createdAt: at(60 * 24 * 9),
      updatedAt: at(60 * 24 * 2),
    },
    {
      id: "7c2d0a11-0000-4000-8000-0000000000b2",
      name: "Legacy strength",
      schemaVersion: 1,
      document: templateDocument("Legacy strength", [
        {
          dayOfWeek: 2,
          focus: "Push",
          exercises: [
            exercise("dumbbell-bench-press", 3, "8-10", "90s"),
            // AC5 — two names the catalogue would not match today.
            rawEntry("Svend Press", 3, "12-15", "60s"),
            rawEntry("Zercher Carry", 3, "30m", "90s"),
          ],
        },
        {
          dayOfWeek: 5,
          focus: "Pull",
          exercises: [
            exercise("lat-pulldown", 3, "10-12", "75s"),
            exercise("seated-cable-row", 3, "10-12", "75s"),
          ],
        },
      ]),
      createdAt: at(60 * 24 * 30),
      updatedAt: at(60 * 24 * 11),
    },
  ];
}

/** `GET /coach-portal/templates` order: newest-updated first. */
function templatesNewestFirst(): CoachTemplate[] {
  return [...state().templates.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

async function ownedTemplate(id: string): Promise<CoachTemplate> {
  const found = state().templates.get(id);
  // AC1/AC2 — ONE body for foreign, unknown and deleted. Not an existence oracle.
  if (!found) await fail(403, "COACH_ACCESS_DENIED", "Forbidden");
  return found as CoachTemplate;
}

async function assertNameFree(name: string, exceptId: string | null): Promise<void> {
  const key = nameKey(name);
  for (const template of state().templates.values()) {
    if (template.id !== exceptId && nameKey(template.name) === key) {
      await fail(409, "COACH_TEMPLATE_NAME_TAKEN", "You already have a template called that.");
    }
  }
}

async function assertRoom(): Promise<void> {
  if (state().templates.size >= TEMPLATE_LIMIT) {
    await fail(409, "COACH_TEMPLATE_LIMIT_REACHED", "Template limit reached.");
  }
}

/** AC2 — the day-size bound, refused with the day NAMED and nothing truncated. */
async function assertDaySizes(document: Routine): Promise<void> {
  for (let i = 0; i < document.trainingDays.length; i += 1) {
    const count = document.trainingDays[i].exercises.length;
    if (count > 12) {
      await fail(
        400,
        "COACH_TEMPLATE_TOO_LARGE",
        `A training day can hold up to 12 exercises. Day ${i + 1} has ${count}.`
      );
    }
  }
}

/** Edge case 7 — `(copy)`, then `(copy 2)`. The probe is bounded, never a loop. */
function copyName(original: string): string {
  const base = `${original} (copy)`;
  const taken = new Set([...state().templates.values()].map((t) => nameKey(t.name)));
  if (!taken.has(nameKey(base))) return base;
  for (let suffix = 2; suffix <= COPY_SUFFIX_MAX; suffix += 1) {
    const candidate = `${original} (copy ${suffix})`;
    if (!taken.has(nameKey(candidate))) return candidate;
  }
  return `${original} (copy ${Date.now()})`;
}

/**
 * AC5 — the names the catalogue would not match, RE-DERIVED on every read.
 *
 * Never stored, which is what makes the marks disappear after a re-sync with no edit
 * having been made, and what makes two opens of an unedited draft legitimately differ.
 */
function unbindableNames(days: RoutineDayEntry[]): string[] {
  const known = new Set(CATALOG.map((e) => e.name.toLowerCase()));
  const out: string[] = [];
  for (const day of days) {
    for (const ex of day.exercises) {
      if (!known.has(ex.name.toLowerCase()) && !out.includes(ex.name)) out.push(ex.name);
    }
  }
  return out;
}

function toDayEntries(document: Routine): RoutineDayEntry[] {
  return document.trainingDays.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    focus: day.focus,
    exercises: day.exercises.map((ex) => {
      const known = CATALOG.find((c) => c.name.toLowerCase() === ex.name.toLowerCase());
      return {
        catalogSlug: known?.slug ?? null,
        name: ex.name,
        primaryMuscles: known?.primaryMuscles ?? null,
        equipment: known?.equipment ?? null,
        sets: ex.sets,
        reps: ex.reps ?? "",
        rest: ex.rest,
      };
    }),
  }));
}

/** djb2. Not a security primitive — it stands in for whatever the api will hash. */
function digestOf(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/**
 * One repair per line, as a WHOLE SENTENCE — EV-184a serves `repairs: List<String>`
 * and the fixture has to be the same shape or it is not a twin.
 *
 * The sentence is composed with `copy.routine.repairLine`, which is the composer the
 * modal used when this was a triple: the demo's lines stay byte-identical, and the day
 * the api's own wording lands it replaces this and nothing else moves.
 */
function repairsFor(id: string, plan: RoutinePlanView): PublishRepair[] {
  const injuries = guardrailsFor(id).injuries;
  const out: PublishRepair[] = [];
  for (const day of plan.trainingDays) {
    for (const ex of day.exercises) {
      const rule = REPAIR_RULES.find(
        (r) => r.exercise === ex.name && injuries.includes(r.injury)
      );
      if (!rule) continue;
      const replacement = catalogBySlug(rule.replacement);
      if (!replacement) continue;
      out.push(copy.routine.repairLine(ex.name, replacement.name, rule.rule));
    }
  }
  return out;
}

function applyRepairs(id: string, plan: RoutinePlanView): RoutinePlanView {
  const injuries = guardrailsFor(id).injuries;
  return {
    ...plan,
    trainingDays: plan.trainingDays.map((day) => ({
      ...day,
      exercises: day.exercises.map((ex) => {
        const rule = REPAIR_RULES.find(
          (r) => r.exercise === ex.name && injuries.includes(r.injury)
        );
        if (!rule) return ex;
        return { ...exercise(rule.replacement, ex.sets, ex.reps, ex.rest) };
      }),
    })),
  };
}

// ── nutrition state ─────────────────────────────────────────────────────────

/** Monday of the current UTC week, `YYYY-MM-DD`. */
function currentWeekStart(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // getUTCDay(): 0=Sunday. ISO Monday is the start.
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * A pool that already honours Lina's stored rules (HALAL, peanut allergy): no pork,
 * no alcohol, no peanuts anywhere in it. The exclusion is in the DATA, not in a
 * filter the portal applies — the coach portal never sees an ingredient list and must
 * never be the thing that enforces a dietary rule.
 */
const MEAL_POOL: { slot: MealSlot; name: string; kcal: number; p: number; c: number; f: number }[] = [
  { slot: "BREAKFAST", name: "Greek yogurt with berries and oats", kcal: 420, p: 32, c: 52, f: 9 },
  { slot: "BREAKFAST", name: "Scrambled eggs with spinach and rye toast", kcal: 450, p: 30, c: 38, f: 18 },
  { slot: "BREAKFAST", name: "Banana and whey porridge", kcal: 410, p: 29, c: 60, f: 7 },
  { slot: "LUNCH", name: "Grilled chicken, quinoa and roasted vegetables", kcal: 620, p: 48, c: 62, f: 18 },
  { slot: "LUNCH", name: "Tuna and white bean salad", kcal: 560, p: 45, c: 44, f: 20 },
  { slot: "LUNCH", name: "Beef and brown rice bowl", kcal: 640, p: 47, c: 68, f: 19 },
  { slot: "DINNER", name: "Baked salmon with sweet potato", kcal: 610, p: 42, c: 55, f: 22 },
  { slot: "DINNER", name: "Turkey meatballs with wholewheat pasta", kcal: 650, p: 46, c: 72, f: 17 },
  { slot: "DINNER", name: "Lentil and vegetable stew with flatbread", kcal: 580, p: 30, c: 82, f: 13 },
  { slot: "SNACK", name: "Cottage cheese with pineapple", kcal: 210, p: 22, c: 20, f: 4 },
  { slot: "SNACK", name: "Apple and pumpkin seeds", kcal: 190, p: 6, c: 26, f: 8 },
  { slot: "SNACK", name: "Chocolate whey shake", kcal: 220, p: 26, c: 18, f: 4 },
];

const SLOT_ORDER: MealSlot[] = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];

/**
 * Deterministic from (weekStart, dayIndex, seed): the same week renders the same meals
 * on every request, and "Regenerate day" moves the seed so the day visibly changes.
 */
function buildDay(weekStart: string, index: number, seed: number): PlannedDayView {
  const meals: PlannedMealView[] = SLOT_ORDER.map((slot, slotIndex) => {
    const options = MEAL_POOL.filter((m) => m.slot === slot);
    // `index * 2`, not `index * 3`: there are exactly three options per slot, so a
    // multiple of three made every day of the week identical — a seven-day plan that
    // repeats one day is not a week, and it made "Regenerate day" impossible to see.
    const pick = options[(index * 2 + slotIndex + seed) % options.length];
    return {
      mealId: `${weekStart}-${index}-${slot.toLowerCase()}-${seed}`,
      slot,
      name: pick.name,
      kcal: pick.kcal,
      proteinG: pick.p,
      carbsG: pick.c,
      fatG: pick.f,
      // Locking is the TRAINEE's act, in their own app: a generated meal is never
      // born locked, and nothing in this portal can set the flag.
      locked: false,
    };
  });
  return {
    index,
    date: addDays(weekStart, index),
    // Mon/Wed/Fri, matching Lina's plan.
    trainingDay: index === 0 || index === 2 || index === 4,
    meals,
  };
}

function buildWeek(weekStart: string, seeds: number[]): MealWeekView {
  return { weekStart, days: seeds.map((seed, i) => buildDay(weekStart, i, seed)) };
}

/** Mark one slot on one day as locked by the trainee. Fixture seeding only. */
function lock(week: MealWeekView, dayIndex: number, slot: MealSlot): MealWeekView {
  return {
    ...week,
    days: week.days.map((day) =>
      day.index === dayIndex
        ? { ...day, meals: day.meals.map((m) => (m.slot === slot ? { ...m, locked: true } : m)) }
        : day
    ),
  };
}

/**
 * D6.7 made real rather than promised: a generated week REUSES the plan row and keeps
 * the meals the trainee locked, matched on (day index, slot). The confirm dialog tells
 * the coach this happens; if the fixture threw locked meals away, the sentence would be
 * unfalsifiable on the one surface that can show it.
 *
 * The carried meal keeps its own `mealId`, because it is the same row — swapping or
 * regenerating around it must address the meal that survived, not a new id for it.
 *
 * Applied to "Apply" (which is what the ADR states) AND to "Regenerate day", where the
 * ADR is silent: a regenerate that silently dropped a lock would be the same data loss
 * in a smaller window. Flagged in the contract as an api question rather than assumed
 * to be free.
 */
function carryLockedForward(previous: MealWeekView, next: MealWeekView): MealWeekView {
  return {
    ...next,
    days: next.days.map((day) => {
      const before = previous.days.find((d) => d.index === day.index);
      if (!before) return day;
      return {
        ...day,
        meals: day.meals.map((meal) => {
          const kept = before.meals.find((m) => m.slot === meal.slot && m.locked);
          return kept ?? meal;
        }),
      };
    }),
  };
}

interface NutritionState {
  targets: NutritionTargets | null;
  week: MealWeekView | null;
  /** Per-day regenerate seeds. */
  seeds: number[];
  /** `NutritionService`'s floor for this trainee's profile sex: 1500 male / 1200 female. */
  floorCalories: number;
  dietProfile: TraineeDietProfile;
}

function initialNutrition(id: string): NutritionState {
  const week = currentWeekStart();
  if (id === LINA_ID) {
    return {
      targets: {
        calories: 2150,
        proteinG: 150,
        carbsG: 215,
        fatG: 68,
        source: "AUTO",
        // AUTO and MANUAL rows are never attributed to a coach (D6.2: the trainee's
        // own write is a full-row replace that must name the component).
        setByYou: false,
        activity: "MODERATE",
        updatedAt: new Date().toISOString(),
      },
      // Lina locked Monday's lunch in her own app — the one meal an "Apply" must
      // carry forward, and the only way the coach can see which parts of the week are
      // hers.
      week: lock(buildWeek(week, [0, 0, 0, 0, 0, 0, 0]), 0, "LUNCH"),
      seeds: [0, 0, 0, 0, 0, 0, 0],
      floorCalories: 1200,
      dietProfile: {
        allergies: ["Peanuts"],
        rules: ["HALAL"],
        dislikes: ["Olives"],
      },
    };
  }
  if (id === DANA_ID) {
    return {
      targets: {
        calories: 1980,
        proteinG: 140,
        carbsG: 190,
        fatG: 64,
        source: "COACH",
        // Written by the signed-in coach: this is the row "Set by you on {date}" is for.
        // The api computes this comparison; the portal is served the answer only.
        setByYou: true,
        activity: "ACTIVE",
        updatedAt: new Date().toISOString(),
      },
      week: buildWeek(week, [1, 1, 1, 1, 1, 1, 1]),
      seeds: [1, 1, 1, 1, 1, 1, 1],
      floorCalories: 1200,
      // Edge case 1: no `nutrition_preferences` row at all.
      dietProfile: { allergies: [], rules: [], dislikes: [] },
    };
  }
  if (id === OMAR_ID) {
    return {
      targets: {
        calories: 2600,
        proteinG: 170,
        carbsG: 280,
        fatG: 80,
        source: "MANUAL",
        setByYou: false,
        activity: "VERY_ACTIVE",
        updatedAt: new Date().toISOString(),
      },
      week: buildWeek(week, [2, 2, 2, 2, 2, 2, 2]),
      seeds: [2, 2, 2, 2, 2, 2, 2],
      floorCalories: 1500,
      dietProfile: { allergies: [], rules: ["HALAL"], dislikes: [] },
    };
  }
  if (id === PETRA_ID) {
    // NUTRITION-only link: the one tab she shares is fully populated, which is what
    // makes "the overview is blank but Nutrition works" demoable at all.
    return {
      targets: {
        calories: 1850,
        proteinG: 130,
        carbsG: 180,
        fatG: 60,
        // A COACH target this coach did NOT write. Petra was coached by someone else
        // before, and `nutrition_targets` survives a revoke-and-re-link — so the line
        // must say "another coach", never "you". Note what the fixture CANNOT express
        // here, by design: there is no id to put in, because the api computes the
        // comparison and serves the boolean (amendment ruling (b), Q2).
        source: "COACH",
        setByYou: false,
        activity: "LIGHT",
        updatedAt: new Date().toISOString(),
      },
      week: buildWeek(week, [0, 0, 0, 0, 0, 0, 0]),
      seeds: [0, 0, 0, 0, 0, 0, 0],
      floorCalories: 1200,
      dietProfile: { allergies: [], rules: [], dislikes: [] },
    };
  }
  // Nils and Sara: AC1's "No nutrition set up yet". Yusuf and Mara never get here —
  // their links carry no NUTRITION scope, so the read is refused before this.
  return {
    targets: null,
    week: null,
    seeds: [0, 0, 0, 0, 0, 0, 0],
    floorCalories: 1500,
    dietProfile: { allergies: [], rules: [], dislikes: [] },
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * FIXTURE STATE — process-wide, deliberately.
 *
 * Every mutable thing the fixture owns lives in ONE object hung off `globalThis`,
 * and not in module-level `let`/`Map` bindings. That is not a style choice.
 *
 * Next compiles a module that is reached from BOTH a server component and a
 * `"use server"` action into two webpack layers, and each layer gets its own
 * instance of the module. With plain module state the coach portal would have two
 * fixtures: `saveDraftAction` would write to one and the routine page's render would
 * read the other, so a saved draft would vanish on reload, a published plan would
 * never appear, and the catalog outage would be invisible to the picker — all of
 * which look exactly like product bugs in the screens under test. The symbol key is
 * `Symbol.for`, so a dev-server hot reload that re-evaluates this module rebinds to
 * the state that is already there instead of resetting a coach's draft mid-edit.
 *
 * A process restart still clears everything, which is the intended lifetime: this is
 * a demo fixture, not a database.
 * ════════════════════════════════════════════════════════════════════════════ */

interface FixtureState {
  /** AC6: revoking takes the whole roster away for the rest of the process. */
  revoked: boolean;
  /**
   * The trainee whose routine page was rendered last, so the catalog outage is
   * reachable. `GET /coach-portal/catalog/exercises` carries no trainee id — rightly,
   * it is a server-wide read — so this is the one piece of state the api would not
   * keep, and it stays confined to the fixture rather than being "fixed" by adding a
   * client id to the catalog path.
   */
  lastRoutineClient: string | null;
  /** The live plan per trainee. `publishRoutine` replaces an entry. */
  plans: Map<string, RoutinePlanView | null>;
  drafts: Map<string, CoachRoutineDraft>;
  /** The digest handed out by the last preview, per trainee (EV-184 ruling 2). */
  pendingDigest: Map<string, string>;
  /** EV-188b — the coach's library, keyed by template id. */
  templates: Map<string, CoachTemplate>;
  /**
   * Which template each trainee's CURRENT draft was started from
   * (`coach_plan_drafts.source_template_id`). Cleared when the draft is discarded or
   * published, and — AC2's delete rule — when the template itself is deleted, which is
   * `ON DELETE SET NULL` in the api. A hand-built draft has no entry.
   */
  draftTemplate: Map<string, string>;
  nutrition: Map<string, NutritionState>;
  /**
   * EV-202b. Keyed by the `coach_clients` row id here, where the api keys the row by
   * USER id (edge case 10 — the goal survives a revoke and a re-link). The fixture has
   * one coach and one link per trainee, so the two are the same thing in this process;
   * the difference is noted rather than modelled, because modelling it would mean
   * inventing a user id this surface is never given.
   */
  progressGoals: Map<string, ProgressGoalRecord>;
}

const FIXTURE_STATE_KEY = Symbol.for("evoli.coach.fixture.state");
type GlobalWithFixture = typeof globalThis & Record<symbol, FixtureState | undefined>;

function freshState(): FixtureState {
  return {
    revoked: false,
    lastRoutineClient: null,
    plans: new Map<string, RoutinePlanView | null>([
      [LINA_ID, linaPlan()],
      [NILS_ID, null], // AC1's "No active plan"
      [SARA_ID, null],
      [DANA_ID, danaPlan()],
      [OMAR_ID, omarPlan()],
      [YUSUF_ID, yusufPlan()],
      // Petra and Mara have no WORKOUTS scope, so no routine read reaches a plan.
      [PETRA_ID, null],
      [MARA_ID, null],
    ]),
    drafts: new Map(),
    pendingDigest: new Map(),
    templates: new Map(seedTemplates().map((t) => [t.id, t])),
    draftTemplate: new Map(),
    nutrition: new Map(),
    /**
     * Four seeded goals, each reaching a state the others cannot:
     *   Lina   — a coach-set start date and a milestone BELOW her current weight: the
     *            ordinary cut, and the "to go" figure whose signed source is negative.
     *   Tobias — a milestone ABOVE his current weight (edge case 4, a bulk): "+2.4 kg
     *            to go", no warning, no assumed direction.
     *   Omar   — a milestone EQUAL to his current weight (edge case 5): "0.0 kg to go",
     *            no celebration and no event.
     *   Sara   — a milestone whose author has LEFT (`set_by` → NULL): the number is
     *            unchanged and the attribution says so. She has no readings at all, so
     *            this is also AC5's empty state with a milestone beside it.
     */
    progressGoals: new Map<string, ProgressGoalRecord>([
      [
        LINA_ID,
        {
          startedOn: isoDate(50),
          milestoneWeightKg: 68.0,
          setByName: "Alex R.",
          updatedAt: isoInstant(6),
        },
      ],
      [
        TOBIAS_ID,
        {
          startedOn: isoDate(40),
          milestoneWeightKg: 90.0,
          setByName: "Alex R.",
          updatedAt: isoInstant(12),
        },
      ],
      [
        OMAR_ID,
        {
          startedOn: null,
          milestoneWeightKg: 81.0,
          setByName: "Alex R.",
          updatedAt: isoInstant(2),
        },
      ],
      [
        SARA_ID,
        {
          startedOn: null,
          milestoneWeightKg: 62.0,
          setByName: null,
          updatedAt: isoInstant(45),
        },
      ],
    ]),
  };
}

function state(): FixtureState {
  const g = globalThis as GlobalWithFixture;
  if (!g[FIXTURE_STATE_KEY]) g[FIXTURE_STATE_KEY] = freshState();
  return g[FIXTURE_STATE_KEY] as FixtureState;
}

function nutritionState(id: string): NutritionState {
  const all = state().nutrition;
  let current = all.get(id);
  if (!current) {
    current = initialNutrition(id);
    all.set(id, current);
  }
  return current;
}

export const fixtureCoachApi: CoachApi = {
  async getMe(): Promise<CoachMe> {
    return {
      coachId: COACH_ID,
      displayName: "Alex R.",
      tier: "STARTER",
      /**
       * The real count, not a flattering one. The populated roster is four links
       * against a STARTER capacity of two, which is a state b-fit-api can reach (the
       * limit is enforced when an invite is CREATED, so a tier change leaves existing
       * links active) and which the populated scenario now demonstrates: the meter
       * reads over capacity and the invite control refuses with edge case 5's
       * sentence. The invite happy path is the `empty` scenario, which is what the
       * Playwright suite drives.
       */
      active: SCENARIO === "empty" || state().revoked ? 0 : 4,
      capacity: CAPACITY,
    };
  },

  async listClients(sort = "needs_attention" as RosterSort, page = 0, size = 100): Promise<RosterPage> {
    /**
     * Six ACTIVE links — AC2's seeded roster, and every rendering of the flag column
     * on one screen: two flags (Tobias), one flag (Lina, Sara), a real zero and no
     * badge at all (Yusuf), and "Not shared" (Petra, Mara).
     *
     * ⚠️ AC2 seeds *exactly two* flagged trainees; this fixture has three, because
     * Sara's `NO_WEIGH_IN_14_DAYS` is a consequence of her having genuinely never
     * weighed in (which is what she is for — BUG-144) and silencing it would make the
     * fixture disagree with its own overview. The seeding count is QA's to satisfy
     * against the api; what the fixture owes is every rendering, and it has them.
     */
    const items =
      SCENARIO === "empty" || state().revoked
        ? []
        : sortRoster([lina(), petra(), yusuf(), sara(), tobias(), mara()], sort);
    return {
      items: page === 0 ? items : [],
      page,
      size,
      totalElements: items.length,
      totalPages: items.length === 0 ? 0 : 1,
    };
  },

  async createInvite(): Promise<InviteResponse> {
    // 32 bytes of randomness → base64url, the same shape the api's token has, so the
    // URL and the QR code are the length they will really be.
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    return { inviteId: crypto.randomUUID(), token, expiresAt };
  },

  async getClient(id: string): Promise<ClientOverview> {
    const known = OVERVIEWS[id];
    if (!known || state().revoked) {
      const { ApiError } = await import("./apiFetch");
      throw new ApiError(403, "Forbidden", "COACH_ACCESS_DENIED");
    }
    return known();
  },

  /**
   * EV-187b. The api names PROGRESS **at the guard**, so a link without it is answered
   * the same undifferentiated 403 as a revoked link, another coach's client and an id
   * that never existed (ADR-0012 D4). `assertScope` is exactly that shape already.
   */
  async getClientProgress(id: string): Promise<TraineeProgress> {
    await assertScope(id, "PROGRESS");
    const known = PROGRESS[id];
    if (!known) await fail(403, "COACH_ACCESS_DENIED", "Forbidden");
    return known();
  },

  async revokeClient(): Promise<void> {
    state().revoked = true;
  },

  /**
   * EV-202b — `PUT /coach-portal/clients/{id}/progress-goal`.
   *
   * 🔴 **A WHOLE REPRESENTATION, and the fixture is faithful to that rather than
   * forgiving about it.** The body replaces the record: a field that arrives `null` —
   * or does not arrive at all — CLEARS the stored value, `set_by` is updated, and the
   * answer is a 200. There is no merge, no "only if present" and no previous value to
   * recover, because the api has none either. A portal that sent only the field the
   * coach edited would silently destroy the other one here, in a browser, which is the
   * only place a test can see it before a coach does.
   *
   * The 403 is `assertScope(WEIGH_INS)`'s, undifferentiated across every denial
   * (ADR-0015 D5), and it is asserted BEFORE the range check so a link that may not
   * write cannot learn the api's bounds by probing them.
   */
  async setProgressGoal(
    id: string,
    body: CoachProgressGoalRequest
  ): Promise<TraineeProgressGoal> {
    await assertScope(id, "WEIGH_INS");
    /**
     * Edge case 6 — `< 25` or `> 300` kg is a 400 and **NOTHING is written**,
     * including the start date that arrived in the same body. Never a silent clamp:
     * a clamp would store a number the coach did not type and report success.
     */
    if (
      body.milestoneWeightKg !== null &&
      (body.milestoneWeightKg < 25 || body.milestoneWeightKg > 300)
    ) {
      await fail(400, "COACH_MILESTONE_OUT_OF_RANGE", "Milestone out of range");
    }
    state().progressGoals.set(id, {
      startedOn: body.startedOn,
      milestoneWeightKg: body.milestoneWeightKg,
      // The caller IS the signed-in coach, so the attribution is true by construction.
      setByName: body.milestoneWeightKg === null ? null : "Alex R.",
      updatedAt: new Date().toISOString(),
    });
    // The SAME block the GET embeds, recomputed — so the portal needs no refetch.
    return progressGoalFor(id, sinceOf(id));
  },

  // ── EV-184b routine ───────────────────────────────────────────────────────

  /**
   * **The api's ENVELOPE, not the editor's model.**
   *
   * This method used to answer `{ traineeDisplayName, activePlan, draft,
   * trainingProfile }` — four fields, of which b-fit-api sends exactly none. Because
   * the fixture is typed by the same module as the client, the two agreed perfectly and
   * the whole Playwright suite stayed green while the live page threw. So the fixture
   * now serves what the wire serves: the plan as three siblings, the draft as a
   * PRESENCE, and `guardrails`. The mapping back to the editor's model happens in
   * `src/lib/routineDocument.ts`, in both modes, which is what puts it under test.
   */
  async getRoutine(id: string): Promise<CoachRoutineResponse> {
    await assertScope(id, "WORKOUTS");
    state().lastRoutineClient = id;
    const plan = state().plans.get(id) ?? null;
    const draft = state().drafts.get(id) ?? null;
    return {
      clientId: id,
      planId: plan?.planId ?? null,
      planName: plan?.name ?? null,
      routine: plan ? toRoutineDocument(id, plan) : null,
      guardrails: guardrailsFor(id),
      hasDraft: draft !== null,
      draftUpdatedAt: draft?.updatedAt ?? null,
    };
  },

  /** A 200 with nulls when there is no draft — never a 404, exactly as the api answers. */
  async getRoutineDraft(id: string): Promise<CoachRoutineDraftResponse> {
    await assertScope(id, "WORKOUTS");
    const draft = state().drafts.get(id) ?? null;
    if (!draft) {
      return {
        document: null,
        schemaVersion: null,
        updatedAt: null,
        sourceTemplateId: null,
        unbindableExercises: [],
        // No draft, so nothing was checked. `false` with an empty list is "not
        // checked", which the portal must not render as "checked and clean".
        catalogChecked: false,
      };
    }
    /**
     * AC5 — re-derived on EVERY read and never stored, which is what makes the marks
     * survive a reload and then disappear after a catalogue re-sync with no edit
     * having been made. The catalog outage is the "not checked" case, and it answers
     * an empty list with `catalogChecked: false` rather than marking everything.
     */
    const down = catalogIsDown();
    return {
      document: toRoutineDocument(id, draft),
      schemaVersion: 1,
      updatedAt: draft.updatedAt,
      sourceTemplateId: state().draftTemplate.get(id) ?? null,
      unbindableExercises: down ? [] : unbindableNames(draft.trainingDays),
      catalogChecked: !down,
    };
  },

  async saveRoutineDraft(
    id: string,
    draft: CoachRoutineDraftRequest
  ): Promise<CoachRoutineDraft> {
    await assertScope(id, "WORKOUTS");
    const saved: CoachRoutineDraft = {
      planId: state().plans.get(id)?.planId ?? null,
      name: draft.name,
      trainingDays: draft.trainingDays,
      updatedAt: new Date().toISOString(),
    };
    state().drafts.set(id, saved);
    // Any edit invalidates an acknowledgement taken against the previous draft.
    state().pendingDigest.delete(id);
    return saved;
  },

  async discardRoutineDraft(id: string): Promise<void> {
    await assertScope(id, "WORKOUTS");
    state().drafts.delete(id);
    state().pendingDigest.delete(id);
    // The draft row is gone, so its `source_template_id` goes with it. A later
    // hand-built draft must not inherit "Started from …" from a discarded one.
    state().draftTemplate.delete(id);
  },

  async previewPublish(id: string): Promise<PublishPreview> {
    await assertScope(id, "WORKOUTS");
    if (CATALOG_DOWN_IDS.has(id)) {
      await fail(503, "CATALOG_UNAVAILABLE", "Catalog unavailable");
    }
    if (PLAN_EMPTY_ON_PUBLISH_IDS.has(id)) {
      await fail(400, "COACH_PLAN_EMPTY", "Plan empty");
    }
    const draft = state().drafts.get(id);
    if (!draft || draft.trainingDays.length === 0) {
      // AC4: a draft with zero training days is refused, and nothing is written.
      await fail(400, "COACH_PLAN_EMPTY", "Plan empty");
    }
    const plan = draft as CoachRoutineDraft;
    const repairs = repairsFor(id, plan);
    const digest = digestOf(JSON.stringify({ plan, repairs }));
    state().pendingDigest.set(id, digest);
    return {
      repairs,
      // Served by the api and equal to `repairs.length` by construction — the fixture
      // derives it from the same array for exactly that reason.
      repairCount: repairs.length,
      digest,
      // D4/A12: DERIVED, never hardcoded — it reports whether a non-empty equipment
      // list reached the policy. `repairsFor` passes injuries only (BUG-053 is not
      // deployed), so it is false here for every trainee, including the ones with a
      // full equipment list. That false is the current truth and the fixture says it
      // rather than flattering the engine.
      equipmentChecked: false,
    };
  },

  async publishRoutine(id: string, digest: string): Promise<PublishResult> {
    await assertScope(id, "WORKOUTS");
    if (CATALOG_DOWN_IDS.has(id)) {
      await fail(503, "CATALOG_UNAVAILABLE", "Catalog unavailable");
    }
    const draft = state().drafts.get(id);
    if (!draft || draft.trainingDays.length === 0) {
      await fail(400, "COACH_PLAN_EMPTY", "Plan empty");
    }
    if (state().pendingDigest.get(id) !== digest) {
      // AC3: publish is refused until the coach has acknowledged what they were shown.
      await fail(
        409,
        "COACH_PUBLISH_REPAIRS_UNACKNOWLEDGED",
        "Repairs not acknowledged"
      );
    }
    const plan = draft as CoachRoutineDraft;
    const repairs = repairsFor(id, plan);
    const repaired = applyRepairs(id, plan);
    const planId = `plan-${id.slice(-4)}-${Date.now().toString(36)}`;
    // AC3: the trainee receives the REPAIRED plan, not the submitted one.
    state().plans.set(id, { planId, name: repaired.name, trainingDays: repaired.trainingDays });
    state().drafts.delete(id);
    state().pendingDigest.delete(id);
    // The applied repairs are identical to the acknowledged preview's — the digest
    // check above is what guarantees it, and the fixture computes both from one call.
    return {
      planId,
      publishedAt: new Date().toISOString(),
      repairs,
      repairCount: repairs.length,
    };
  },

  async searchCatalog(q: string, muscle: string, equipment: string): Promise<CatalogPage> {
    if (catalogIsDown()) {
      await fail(503, "CATALOG_UNAVAILABLE", "Catalog unavailable");
    }
    const needle = q.trim().toLowerCase();
    const items = CATALOG.filter(
      (e) =>
        (!needle || e.name.toLowerCase().includes(needle)) &&
        (!muscle || e.primaryMuscles === muscle) &&
        (!equipment || (e.equipment ?? "") === equipment)
    );
    // The api's default page size, and the api's ordinary paged envelope — there is no
    // `truncated` boolean on the wire, so the fixture must not offer one either. "More
    // matched than were returned" is `totalElements > items.length` (`isTruncated`).
    const LIMIT = 20;
    return {
      items: items.slice(0, LIMIT),
      page: 0,
      size: LIMIT,
      totalElements: items.length,
      totalPages: items.length === 0 ? 0 : Math.ceil(items.length / LIMIT),
      muscles: Array.from(
        new Set(CATALOG.map((e) => e.primaryMuscles).filter((m): m is string => !!m))
      ).sort(),
      equipment: Array.from(
        new Set(CATALOG.map((e) => e.equipment).filter((m): m is string => !!m))
      ).sort(),
    };
  },

  // ── EV-188b the coach's routine library ───────────────────────────────────

  async listTemplates(): Promise<CoachTemplateList> {
    const templates = templatesNewestFirst();
    return {
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        dayCount: t.document.trainingDays.length,
        exerciseCount: t.document.trainingDays.reduce((n, d) => n + d.exercises.length, 0),
        updatedAt: t.updatedAt,
      })),
      limit: TEMPLATE_LIMIT,
      remaining: Math.max(0, TEMPLATE_LIMIT - templates.length),
    };
  },

  async getTemplate(id: string): Promise<CoachTemplate> {
    return ownedTemplate(id);
  },

  async createTemplate(body: CoachTemplateSaveRequest): Promise<CoachTemplate> {
    await assertRoom();
    await assertNameFree(body.name, null);
    await assertDaySizes(body.document);
    const now = new Date().toISOString();
    const created: CoachTemplate = {
      id: crypto.randomUUID(),
      name: body.name.trim(),
      schemaVersion: 1,
      // The api strips the two trainee-answer lists at the write boundary whatever the
      // body carries. The fixture does the same, so a portal bug that started sending
      // them could never look like it worked here.
      document: {
        ...body.document,
        constraints: { ...body.document.constraints, equipment: [], injuries: [] },
      },
      createdAt: now,
      updatedAt: now,
    };
    state().templates.set(created.id, created);
    return created;
  },

  async updateTemplate(id: string, body: CoachTemplateSaveRequest): Promise<CoachTemplate> {
    const existing = await ownedTemplate(id);
    await assertNameFree(body.name, id);
    await assertDaySizes(body.document);
    const saved: CoachTemplate = {
      ...existing,
      name: body.name.trim(),
      document: {
        ...body.document,
        constraints: { ...body.document.constraints, equipment: [], injuries: [] },
      },
      updatedAt: new Date().toISOString(),
    };
    state().templates.set(id, saved);
    return saved;
  },

  async renameTemplate(id: string, name: string): Promise<CoachTemplate> {
    const existing = await ownedTemplate(id);
    // AC2: a collision leaves BOTH templates unchanged — the throw happens before the
    // map is touched, which is the whole of that guarantee here.
    await assertNameFree(name, id);
    const saved: CoachTemplate = {
      ...existing,
      name: name.trim(),
      updatedAt: new Date().toISOString(),
    };
    state().templates.set(id, saved);
    return saved;
  },

  async duplicateTemplate(id: string): Promise<CoachTemplate> {
    const original = await ownedTemplate(id);
    await assertRoom();
    const now = new Date().toISOString();
    /**
     * AC2 as amended by Ruling 6a: **semantically** identical, not byte-identical. The
     * copy is rebuilt through the same write path rather than aliased — sharing the
     * object would make an edit to one show up in the other, and copying raw storage is
     * what ADR-0016 D9.3 forbids on the api side because it bypasses the write boundary
     * the stripping guarantee stands on.
     */
    const duplicated: CoachTemplate = {
      id: crypto.randomUUID(),
      name: copyName(original.name),
      schemaVersion: original.schemaVersion,
      document: JSON.parse(JSON.stringify(original.document)) as Routine,
      createdAt: now,
      updatedAt: now,
    };
    state().templates.set(duplicated.id, duplicated);
    return duplicated;
  },

  async deleteTemplate(id: string): Promise<void> {
    await ownedTemplate(id);
    state().templates.delete(id);
    /**
     * Ruling 2, and AC2's most important assertion: deleting a template changes NOTHING
     * about any draft or plan made from it. `source_template_id` is `ON DELETE SET
     * NULL`, so the "Started from …" line disappears and the draft's content is
     * untouched — which is exactly what this loop does and all it does.
     */
    for (const [clientId, templateId] of state().draftTemplate.entries()) {
      if (templateId === id) state().draftTemplate.delete(clientId);
    }
  },

  async applyTemplate(
    id: string,
    clientId: string,
    replacesDraftUpdatedAt?: string
  ): Promise<CoachTemplateApplyResult> {
    const template = await ownedTemplate(id);
    /**
     * AC5 — the 403 is answered EVEN WHILE the catalogue is unavailable, so a stranger
     * never learns the catalogue's state from a 503 where they should have had a 403.
     * Scope first, then the outage.
     */
    await assertScope(clientId, "WORKOUTS");
    if (catalogIsDown()) {
      await fail(503, "CATALOG_UNAVAILABLE", "The exercise catalogue is unavailable.");
    }

    /**
     * AC3 / ADR-0016 D9.1 — **default-refusing**, and the comparison is here, at the
     * write, not at a read the client did earlier. Without the assertion an existing
     * draft is a 409 carrying its `updatedAt`; WITH an assertion that no longer matches
     * — a second tab saved in between — it is refused AGAIN. That is the only thing
     * that makes the portal's "this replaces your unpublished draft" sentence true.
     */
    const existing = state().drafts.get(clientId) ?? null;
    if (existing && existing.updatedAt !== replacesDraftUpdatedAt) {
      await failWithDetails(409, "COACH_DRAFT_EXISTS", "This trainee already has a draft.", {
        existingUpdatedAt: existing.updatedAt,
      });
    }

    const updatedAt = new Date().toISOString();
    const days = toDayEntries(template.document);
    state().drafts.set(clientId, {
      // A draft has never been published, so it carries no plan id.
      planId: null,
      name: template.document.name,
      trainingDays: days,
      updatedAt,
    });
    state().draftTemplate.set(clientId, template.id);
    // Any new draft invalidates a publish acknowledgement taken against the old one.
    state().pendingDigest.delete(clientId);

    return {
      clientId,
      sourceTemplateId: template.id,
      sourceTemplateName: template.name,
      document: template.document,
      updatedAt,
      replacedExistingDraft: existing !== null,
      // Advisory and never persisted. Nothing is removed on it.
      unbindableExercises: unbindableNames(days),
      catalogChecked: true,
    };
  },

  async saveRoutineAsTemplate(
    id: string,
    body: CoachTemplateFromRoutineRequest
  ): Promise<CoachTemplate> {
    await assertScope(id, "WORKOUTS");
    const source =
      body.source === "DRAFT"
        ? (state().drafts.get(id) ?? null)
        : (state().plans.get(id) ?? null);
    /**
     * Edge case 12 — an active plan with no routine document (the legacy population).
     * Refused with a code and a sentence naming the reason; never an empty template
     * silently created. The portal hides the control for this trainee as well, so this
     * is the belt to that brace.
     */
    if (!source) {
      await fail(400, "COACH_TEMPLATE_SOURCE_EMPTY", "This trainee has no routine to copy.");
    }
    const plan = source as RoutinePlanView;
    await assertRoom();
    await assertNameFree(body.name, null);
    const document = templateDocument(plan.name, plan.trainingDays);
    await assertDaySizes(document);
    const now = new Date().toISOString();
    const created: CoachTemplate = {
      id: crypto.randomUUID(),
      name: body.name.trim(),
      schemaVersion: 1,
      // AC4 — the prescription, and nothing the trainee told us about themselves.
      // `templateDocument` writes both lists empty; the trainee's guardrails are never
      // read on this path at all.
      document,
      createdAt: now,
      updatedAt: now,
    };
    state().templates.set(created.id, created);
    return created;
  },

  // ── EV-185b nutrition ─────────────────────────────────────────────────────

  async getNutrition(id: string): Promise<CoachNutritionResponse> {
    await assertScope(id, "NUTRITION");
    const state = nutritionState(id);
    return {
      clientId: id,
      traineeDisplayName: OVERVIEWS[id]().traineeDisplayName,
      targets: state.targets,
      week: state.week,
      currentWeekStart: currentWeekStart(),
      dietProfile: state.dietProfile,
    };
  },

  async saveNutritionTargets(
    id: string,
    body: CoachTargetsRequest
  ): Promise<CoachTargetsResult> {
    await assertScope(id, "NUTRITION");
    const state = nutritionState(id);
    // `NutritionService.setManual` clamps CALORIES ONLY — protein and fat are
    // untouched, which is exactly what the standing sentence on the page says.
    const floored = body.calories < state.floorCalories;
    const targets: NutritionTargets = {
      calories: floored ? state.floorCalories : body.calories,
      proteinG: body.proteinG,
      carbsG: body.carbsG,
      fatG: body.fatG,
      source: "COACH",
      // The caller IS the signed-in coach, so the attribution the page renders next is
      // true by construction.
      setByYou: true,
      activity: state.targets?.activity ?? "MODERATE",
      updatedAt: new Date().toISOString(),
    };
    state.targets = targets;
    return { targets, floorCalories: floored ? state.floorCalories : null };
  },

  async applyMealWeek(id: string, weekStart: string): Promise<MealWeekView> {
    await assertScope(id, "NUTRITION");
    const state = nutritionState(id);
    if (weekStart !== currentWeekStart()) {
      // Edge case 3: slice 1 applies the current week only.
      await fail(400, "COACH_WEEK_OUT_OF_RANGE", "Week out of range");
    }
    if (WEEK_APPLY_CAPPED_IDS.has(id)) {
      // D6.6's cap is ONE apply per link per day and it is enforced server-side
      // against a clock this fixture has no business simulating — a real day counter
      // here would make the demo unusable after the first click. Keying it to one
      // trainee is the same affordance as the catalog outage above: the state is
      // reachable beside the others and is NOT a claim that b-fit-api caps per person.
      await fail(429, "COACH_WEEK_APPLY_RATE_LIMIT", "Rate limited");
    }
    // AC3: applying twice REPLACES the week; it never accumulates.
    const previous = state.week;
    state.seeds = state.seeds.map(() => state.seeds[0] + 1);
    const fresh = buildWeek(weekStart, state.seeds);
    // D6.7: "idempotent replace" is true of the row and false of the locked meals.
    state.week = previous ? carryLockedForward(previous, fresh) : fresh;
    return state.week;
  },

  async regenerateDay(id: string, index: number): Promise<MealWeekView> {
    await assertScope(id, "NUTRITION");
    const state = nutritionState(id);
    if (!state.week) await fail(400, "COACH_WEEK_OUT_OF_RANGE", "No week");
    const week = state.week as MealWeekView;
    state.seeds = state.seeds.map((s, i) => (i === index ? s + 1 : s));
    state.week = carryLockedForward(week, buildWeek(week.weekStart, state.seeds));
    return state.week;
  },

  async getSwapOptions(id: string, mealId: string): Promise<SwapOptions> {
    await assertScope(id, "NUTRITION");
    const state = nutritionState(id);
    const meal = state.week?.days.flatMap((d) => d.meals).find((m) => m.mealId === mealId);
    if (!meal) return { mealId, candidates: [] };
    const candidates = MEAL_POOL.filter((m) => m.slot === meal.slot && m.name !== meal.name).map(
      (m, index) => ({
        index,
        name: m.name,
        kcal: m.kcal,
        proteinG: m.p,
        carbsG: m.c,
        fatG: m.f,
      })
    );
    return { mealId, candidates };
  },

  async applySwap(id: string, mealId: string, candidateIndex: number): Promise<MealWeekView> {
    await assertScope(id, "NUTRITION");
    const state = nutritionState(id);
    const week = state.week;
    if (!week) await fail(400, "COACH_WEEK_OUT_OF_RANGE", "No week");
    const current = week as MealWeekView;
    const meal = current.days.flatMap((d) => d.meals).find((m) => m.mealId === mealId);
    if (!meal) return current;
    const options = MEAL_POOL.filter((m) => m.slot === meal.slot && m.name !== meal.name);
    const chosen = options[candidateIndex];
    if (!chosen) return current;
    state.week = {
      ...current,
      days: current.days.map((day) => ({
        ...day,
        meals: day.meals.map((m) =>
          m.mealId === mealId
            ? {
                ...m,
                name: chosen.name,
                kcal: chosen.kcal,
                proteinG: chosen.p,
                carbsG: chosen.c,
                fatG: chosen.f,
              }
            : m
        ),
      })),
    };
    return state.week;
  },
};
