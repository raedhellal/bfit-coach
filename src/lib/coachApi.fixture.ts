import "server-only";
import type {
  CatalogExercise,
  CoachAccessScope,
  CatalogPage,
  ClientOverview,
  CoachApi,
  CoachMe,
  CoachNutritionResponse,
  CoachRoutineDraft,
  CoachRoutineDraftRequest,
  CoachRoutineResponse,
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
  RoutineExerciseEntry,
  RoutinePlanView,
  SwapOptions,
  TraineeDietProfile,
  TraineeTrainingProfile,
  WeightPoint,
} from "./coachApi";

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
    currentPlanName: "Intermediate Muscle Building Routine",
    lastCompletedWorkoutDate: isoDate(1),
    currentStreakDays: 4,
    status: "ACTIVE",
    since: isoInstant(23),
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
 */
function petra(): RosterClient {
  return {
    id: PETRA_ID,
    traineeDisplayName: "Petra L.",
    currentPlanName: null,
    lastCompletedWorkoutDate: null,
    currentStreakDays: null,
    status: "ACTIVE",
    since: isoInstant(12),
  };
}

function yusuf(): RosterClient {
  return {
    id: YUSUF_ID,
    traineeDisplayName: "Yusuf A.",
    currentPlanName: "Two Day Full Body",
    // Progress data, so S1 filters it out of a WORKOUTS-only row.
    lastCompletedWorkoutDate: null,
    currentStreakDays: null,
    status: "ACTIVE",
    since: isoInstant(21),
  };
}

/**
 * The overviews the fixture can answer, by id. `NO_WEIGH_IN_14_DAYS` is attached to
 * the trainee who has never weighed in because that is the rule the api would actually
 * compute for them — the flags and block 4 have to agree here as they do in the api.
 */
const OVERVIEWS: Record<string, () => ClientOverview> = {
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
};

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

const DANA_ID = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";
const OMAR_ID = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0005";
/** Fixture affordance only. See the block above. */
const CATALOG_DOWN_IDS = new Set([OMAR_ID]);
/** Likewise: the link whose weekly apply answers D6.6's 429. */
const WEEK_APPLY_CAPPED_IDS = new Set([OMAR_ID]);

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
const REPAIR_RULES: { injury: string; slug: string; replacement: string; rule: string }[] = [
  {
    injury: "Left shoulder impingement",
    slug: "barbell-overhead-press",
    replacement: "landmine-press",
    rule: "Overhead pressing is contraindicated by a shoulder injury",
  },
  {
    injury: "Left shoulder impingement",
    slug: "barbell-bench-press",
    replacement: "machine-chest-press",
    rule: "Flat barbell pressing is contraindicated by a shoulder injury",
  },
];

const PROFILES: Record<string, TraineeTrainingProfile> = {
  [LINA_ID]: { injuries: [], equipment: ["Barbell", "Dumbbell", "Cable", "Machine"] },
  [NILS_ID]: { injuries: [], equipment: ["Dumbbell"] },
  [SARA_ID]: { injuries: [], equipment: [] },
  [DANA_ID]: {
    injuries: ["Left shoulder impingement"],
    equipment: ["Barbell", "Dumbbell", "Cable", "Machine"],
  },
  [OMAR_ID]: { injuries: [], equipment: ["Barbell", "Dumbbell"] },
  // Petra and Mara never reach the routine tab (no WORKOUTS scope); Yusuf does.
  [YUSUF_ID]: { injuries: [], equipment: ["Dumbbell", "Machine"] },
};

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

/** djb2. Not a security primitive — it stands in for whatever the api will hash. */
function digestOf(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

function repairsFor(id: string, plan: RoutinePlanView): PublishRepair[] {
  const injuries = PROFILES[id]?.injuries ?? [];
  const out: PublishRepair[] = [];
  for (const day of plan.trainingDays) {
    for (const ex of day.exercises) {
      const rule = REPAIR_RULES.find(
        (r) => r.slug === ex.catalogSlug && injuries.includes(r.injury)
      );
      if (!rule) continue;
      const replacement = catalogBySlug(rule.replacement);
      if (!replacement) continue;
      out.push({ exercise: ex.name, replacedWith: replacement.name, rule: rule.rule });
    }
  }
  return out;
}

function applyRepairs(id: string, plan: RoutinePlanView): RoutinePlanView {
  const injuries = PROFILES[id]?.injuries ?? [];
  return {
    ...plan,
    trainingDays: plan.trainingDays.map((day) => ({
      ...day,
      exercises: day.exercises.map((ex) => {
        const rule = REPAIR_RULES.find(
          (r) => r.slug === ex.catalogSlug && injuries.includes(r.injury)
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
  nutrition: Map<string, NutritionState>;
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
    nutrition: new Map(),
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
       * The real count, not a flattering one. The populated roster is three links
       * against a STARTER capacity of two, which is a state b-fit-api can reach (the
       * limit is enforced when an invite is CREATED, so a tier change leaves existing
       * links active) and which the populated scenario now demonstrates: the meter
       * reads over capacity and the invite control refuses with edge case 5's
       * sentence. The invite happy path is the `empty` scenario, which is what the
       * Playwright suite drives.
       */
      active: SCENARIO === "empty" || state().revoked ? 0 : 3,
      capacity: CAPACITY,
    };
  },

  async listClients(page = 0, size = 100): Promise<RosterPage> {
    const items =
      SCENARIO === "empty" || state().revoked ? [] : [lina(), petra(), yusuf()];
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

  async revokeClient(): Promise<void> {
    state().revoked = true;
  },

  // ── EV-184b routine ───────────────────────────────────────────────────────

  async getRoutine(id: string): Promise<CoachRoutineResponse> {
    await assertScope(id, "WORKOUTS");
    state().lastRoutineClient = id;
    return {
      clientId: id,
      traineeDisplayName: OVERVIEWS[id]().traineeDisplayName,
      activePlan: state().plans.get(id) ?? null,
      draft: state().drafts.get(id) ?? null,
      trainingProfile: PROFILES[id] ?? { injuries: [], equipment: [] },
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
  },

  async previewPublish(id: string): Promise<PublishPreview> {
    await assertScope(id, "WORKOUTS");
    if (CATALOG_DOWN_IDS.has(id)) {
      await fail(503, "CATALOG_UNAVAILABLE", "Catalog unavailable");
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
    return { planId, publishedAt: new Date().toISOString(), repairCount: repairs.length };
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
    const LIMIT = 20;
    return {
      items: items.slice(0, LIMIT),
      muscles: Array.from(
        new Set(CATALOG.map((e) => e.primaryMuscles).filter((m): m is string => !!m))
      ).sort(),
      equipment: Array.from(
        new Set(CATALOG.map((e) => e.equipment).filter((m): m is string => !!m))
      ).sort(),
      truncated: items.length > LIMIT,
    };
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
