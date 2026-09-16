import "server-only";
import type {
  CatalogExercise,
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
 * The overviews the fixture can answer, by id. `NO_WEIGH_IN_14_DAYS` is attached to
 * the trainee who has never weighed in because that is the rule the api would actually
 * compute for them — the flags and block 4 have to agree here as they do in the api.
 */
const OVERVIEWS: Record<string, () => ClientOverview> = {
  [LINA_ID]: () => ({
    clientId: LINA_ID,
    traineeDisplayName: "Lina M.",
    since: isoInstant(23),
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
    adherenceThisWeek: { done: 1, planned: 3 },
    currentStreakDays: 0,
    lastSession: { date: isoDate(4), name: "Full Body A", difficulty: "EASY" },
    weightSeries: [{ date: isoDate(3), weightKg: 81.0 }],
    redFlags: [],
  }),
};

/** Revoke mutates this so AC6's flow can be walked through in fixture mode too. */
let revoked = false;

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
 *   …0003 Sara P.  — ACTIVE link WITHOUT the WORKOUTS or NUTRITION scope: both
 *                    tabs answer 403 COACH_SCOPE_MISSING.
 *   …0004 Dana W.  — an injury that repairs two exercises on publish, and a
 *                    49-character exercise name for the truncation case.
 *   …0005 Omar T.  — the exercise catalog is unavailable (503).
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
/** Sara's link is ACTIVE but carries neither scope — see the block above. */
const NO_SCOPE_IDS = new Set([SARA_ID]);
/** Fixture affordance only. See the block above. */
const CATALOG_DOWN_IDS = new Set([OMAR_ID]);

/**
 * `GET /coach-portal/catalog/exercises` carries no trainee id — it is a server-wide
 * read, and rightly so. The fixture therefore remembers which trainee's routine page
 * was opened last and answers 503 while that is the catalog-down scenario.
 *
 * This is the one place the fixture keeps state the api would not, and it is confined
 * to the fixture on purpose: adding a client id to the catalog path so the outage could
 * be addressed "properly" would be this file's convenience leaking into the contract.
 */
let lastRoutineClient: string | null = null;
function catalogIsDown(): boolean {
  return lastRoutineClient !== null && CATALOG_DOWN_IDS.has(lastRoutineClient);
}

async function fail(status: number, code: string, message: string): Promise<never> {
  const { ApiError } = await import("./apiFetch");
  throw new ApiError(status, message, code);
}

/** Every read and write in both tabs goes through this first. */
async function assertScope(id: string): Promise<void> {
  if (revoked || !OVERVIEWS[id]) {
    await fail(403, "COACH_ACCESS_DENIED", "Forbidden");
  }
  if (NO_SCOPE_IDS.has(id)) {
    await fail(403, "COACH_SCOPE_MISSING", "Forbidden");
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

/** The live plan per trainee. `publishRoutine` replaces an entry here. */
const PLANS = new Map<string, RoutinePlanView | null>([
  [LINA_ID, linaPlan()],
  [NILS_ID, null], // AC1's "No active plan"
  [SARA_ID, null],
  [DANA_ID, danaPlan()],
  [OMAR_ID, omarPlan()],
]);

const DRAFTS = new Map<string, CoachRoutineDraft>();
/** The digest handed out by the last preview, per trainee (EV-184 ruling 2). */
const PENDING_DIGEST = new Map<string, string>();

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
    const pick = options[(index * 3 + slotIndex + seed) % options.length];
    return {
      mealId: `${weekStart}-${index}-${slot.toLowerCase()}-${seed}`,
      slot,
      name: pick.name,
      kcal: pick.kcal,
      proteinG: pick.p,
      carbsG: pick.c,
      fatG: pick.f,
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
        activity: "MODERATE",
        updatedAt: new Date().toISOString(),
      },
      week: buildWeek(week, [0, 0, 0, 0, 0, 0, 0]),
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
        activity: "VERY_ACTIVE",
        updatedAt: new Date().toISOString(),
      },
      week: buildWeek(week, [2, 2, 2, 2, 2, 2, 2]),
      seeds: [2, 2, 2, 2, 2, 2, 2],
      floorCalories: 1500,
      dietProfile: { allergies: [], rules: ["HALAL"], dislikes: [] },
    };
  }
  // Nils and Sara: AC1's "No nutrition set up yet".
  return {
    targets: null,
    week: null,
    seeds: [0, 0, 0, 0, 0, 0, 0],
    floorCalories: 1500,
    dietProfile: { allergies: [], rules: [], dislikes: [] },
  };
}

const NUTRITION = new Map<string, NutritionState>();
function nutritionState(id: string): NutritionState {
  let state = NUTRITION.get(id);
  if (!state) {
    state = initialNutrition(id);
    NUTRITION.set(id, state);
  }
  return state;
}

export const fixtureCoachApi: CoachApi = {
  async getMe(): Promise<CoachMe> {
    return {
      coachId: "1a2b3c4d-0000-4000-8000-00000000c0ac",
      displayName: "Alex R.",
      tier: "STARTER",
      active: SCENARIO === "empty" || revoked ? 0 : 1,
      capacity: CAPACITY,
    };
  },

  async listClients(page = 0, size = 100): Promise<RosterPage> {
    const items = SCENARIO === "empty" || revoked ? [] : [lina()];
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
    if (!known || revoked) {
      const { ApiError } = await import("./apiFetch");
      throw new ApiError(403, "Forbidden", "COACH_ACCESS_DENIED");
    }
    return known();
  },

  async revokeClient(): Promise<void> {
    revoked = true;
  },

  // ── EV-184b routine ───────────────────────────────────────────────────────

  async getRoutine(id: string): Promise<CoachRoutineResponse> {
    await assertScope(id);
    lastRoutineClient = id;
    return {
      clientId: id,
      traineeDisplayName: OVERVIEWS[id]().traineeDisplayName,
      activePlan: PLANS.get(id) ?? null,
      draft: DRAFTS.get(id) ?? null,
      trainingProfile: PROFILES[id] ?? { injuries: [], equipment: [] },
    };
  },

  async saveRoutineDraft(
    id: string,
    draft: CoachRoutineDraftRequest
  ): Promise<CoachRoutineDraft> {
    await assertScope(id);
    const saved: CoachRoutineDraft = {
      planId: PLANS.get(id)?.planId ?? null,
      name: draft.name,
      trainingDays: draft.trainingDays,
      updatedAt: new Date().toISOString(),
    };
    DRAFTS.set(id, saved);
    // Any edit invalidates an acknowledgement taken against the previous draft.
    PENDING_DIGEST.delete(id);
    return saved;
  },

  async discardRoutineDraft(id: string): Promise<void> {
    await assertScope(id);
    DRAFTS.delete(id);
    PENDING_DIGEST.delete(id);
  },

  async previewPublish(id: string): Promise<PublishPreview> {
    await assertScope(id);
    if (CATALOG_DOWN_IDS.has(id)) {
      await fail(503, "CATALOG_UNAVAILABLE", "Catalog unavailable");
    }
    const draft = DRAFTS.get(id);
    if (!draft || draft.trainingDays.length === 0) {
      // AC4: a draft with zero training days is refused, and nothing is written.
      await fail(400, "COACH_PLAN_EMPTY", "Plan empty");
    }
    const plan = draft as CoachRoutineDraft;
    const repairs = repairsFor(id, plan);
    const digest = digestOf(JSON.stringify({ plan, repairs }));
    PENDING_DIGEST.set(id, digest);
    return { repairs, digest };
  },

  async publishRoutine(id: string, digest: string): Promise<PublishResult> {
    await assertScope(id);
    if (CATALOG_DOWN_IDS.has(id)) {
      await fail(503, "CATALOG_UNAVAILABLE", "Catalog unavailable");
    }
    const draft = DRAFTS.get(id);
    if (!draft || draft.trainingDays.length === 0) {
      await fail(400, "COACH_PLAN_EMPTY", "Plan empty");
    }
    if (PENDING_DIGEST.get(id) !== digest) {
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
    PLANS.set(id, { planId, name: repaired.name, trainingDays: repaired.trainingDays });
    DRAFTS.delete(id);
    PENDING_DIGEST.delete(id);
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
    await assertScope(id);
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
    await assertScope(id);
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
      activity: state.targets?.activity ?? "MODERATE",
      updatedAt: new Date().toISOString(),
    };
    state.targets = targets;
    return { targets, floorCalories: floored ? state.floorCalories : null };
  },

  async applyMealWeek(id: string, weekStart: string): Promise<MealWeekView> {
    await assertScope(id);
    const state = nutritionState(id);
    if (weekStart !== currentWeekStart()) {
      // Edge case 3: slice 1 applies the current week only.
      await fail(400, "COACH_WEEK_OUT_OF_RANGE", "Week out of range");
    }
    // AC3: applying twice REPLACES the week; it never accumulates.
    state.seeds = state.seeds.map(() => state.seeds[0] + 1);
    state.week = buildWeek(weekStart, state.seeds);
    return state.week;
  },

  async regenerateDay(id: string, index: number): Promise<MealWeekView> {
    await assertScope(id);
    const state = nutritionState(id);
    if (!state.week) await fail(400, "COACH_WEEK_OUT_OF_RANGE", "No week");
    const week = state.week as MealWeekView;
    state.seeds = state.seeds.map((s, i) => (i === index ? s + 1 : s));
    state.week = buildWeek(week.weekStart, state.seeds);
    return state.week;
  },

  async getSwapOptions(id: string, mealId: string): Promise<SwapOptions> {
    await assertScope(id);
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
    await assertScope(id);
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
