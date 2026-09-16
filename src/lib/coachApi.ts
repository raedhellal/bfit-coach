import "server-only";
import { apiFetch, ApiError } from "./apiFetch";
import { COACH_API_MODE, INVITE_BASE_URL } from "./env";
import { fixtureCoachApi } from "./coachApi.fixture";
import { sanitiseCoachName } from "./inviteName";

/**
 * The ONE module that knows b-fit-api's coach-portal contract.
 *
 * Every path, field name and error code the web surface depends on is written down
 * exactly once, here, and the names below are the API's own names verbatim — not a
 * prettier local vocabulary. A renamed field is a place where drift can hide; when
 * `traineeDisplayName` is called `traineeDisplayName` all the way to the JSX, a
 * contract change is a type error rather than an empty cell.
 *
 * Source of truth: `b-fit-api` `openapi.yaml` (`/coach-portal/*`) and the DTOs in
 * `com.bfit.application.dto.coachportal`, branch demo/evoli-pro-mve1.
 *
 * `COACH_API_MODE=fixture` swaps the whole module for src/lib/coachApi.fixture.ts so
 * the screens are demoable without an api. The switch is read from the server
 * environment only, and `live` is the default.
 */

/* ════════════════════════════════════════════════════════════════════════════
 * PROVISIONAL — EV-184b / EV-185b. Everything in this block is UNBUILT on
 * b-fit-api as of 2026-09-14; ADR-0015 is being written in parallel and may
 * overrule any of it. Nothing below has been observed from a running server.
 *
 * It is written down here, in one place, so the api engineer can either match it
 * or contradict it deliberately — and so that when the real contract lands the
 * change is confined to this module plus `coachApi.fixture.ts`. No screen, no
 * component and no server action names a path, a query parameter or an error
 * code; they consume the exported types only.
 *
 * Until the api answers these, the screens only run under `COACH_API_MODE=fixture`
 * (`live` mode calls them and will 404, which is the honest failure — the portal
 * does not fabricate a routine or a meal week when the server has none).
 *
 *   ROUTINE (EV-184)
 *   GET    /coach-portal/clients/{id}/routine
 *          → CoachRoutineResponse — active plan + days + exercises, the saved
 *            draft if one exists, and the trainee's READ-ONLY injuries/equipment.
 *   GET    /coach-portal/clients/{id}/routine/draft   → CoachRoutineDraft | 404
 *   PUT    /coach-portal/clients/{id}/routine/draft   ← CoachRoutineDraftRequest
 *   DELETE /coach-portal/clients/{id}/routine/draft   → 204
 *   POST   /coach-portal/clients/{id}/routine/publish/preview
 *          → { repairs: [{ exercise, replacedWith, rule }], digest }
 *   POST   /coach-portal/clients/{id}/routine/publish  ← { digest }
 *          409 COACH_PUBLISH_REPAIRS_UNACKNOWLEDGED · 400 COACH_PLAN_EMPTY
 *          503 CATALOG_UNAVAILABLE
 *   GET    /coach-portal/catalog/exercises?q=&muscle=&equipment=
 *          → CatalogPage · 503 CATALOG_UNAVAILABLE
 *
 *   NUTRITION (EV-185)
 *   GET    /coach-portal/clients/{id}/nutrition
 *          → CoachNutritionResponse — targets + source + activity + the current
 *            week + the trainee's READ-ONLY allergies/rules/dislikes.
 *   PUT    /coach-portal/clients/{id}/nutrition/targets ← CoachTargetsRequest
 *   POST   /coach-portal/clients/{id}/nutrition/week/apply ← { weekStart }
 *          400 COACH_WEEK_OUT_OF_RANGE (current week only in slice 1)
 *   POST   /coach-portal/clients/{id}/nutrition/week/days/{index}/regenerate
 *   GET    /coach-portal/clients/{id}/nutrition/week/meals/{mealId}/swap
 *   POST   /coach-portal/clients/{id}/nutrition/week/meals/{mealId}/swap
 *          ← { candidateIndex }
 *
 * Four decisions this surface is ASKING FOR rather than assuming — each one is a
 * place the api may say no, and each is isolated to this module:
 *
 * 1. **`403 COACH_SCOPE_MISSING`.** EV-184 AC1 and EV-185 AC1 require the portal to
 *    tell a coach "This trainee has not shared their workouts with you." — which is a
 *    different sentence from "not on your roster". The portal therefore needs to tell a
 *    SCOPE denial from a LINK denial, and the only carrier is the error code. This does
 *    not weaken ADR-0012 D4: the code is only ever returned for a trainee the caller
 *    already has an ACTIVE link to, so it discloses nothing a foreign or non-existent id
 *    could learn — those keep answering the existing `COACH_ACCESS_DENIED` body. If the
 *    api refuses to distinguish, both sentences collapse into the roster one and AC1's
 *    scope limb cannot be met.
 * 2. **The publish `digest`.** EV-184 ruling 2 requires publish to echo "the exact repair
 *    set the coach was shown". A digest computed server-side over (draft, repair list) is
 *    the smallest thing the client can echo without re-serialising the repairs — and it
 *    means an edit between preview and publish invalidates the acknowledgement, which a
 *    repair-list echo would not.
 * 3. **The catalog's filter vocabulary travels with its results** (`CatalogPage.muscles` /
 *    `.equipment`). The alternative is this surface hard-coding a muscle and equipment
 *    list, i.e. inventing product data in the web tier; the filters would then silently
 *    disagree with the 1,235-row catalog.
 * 4. **Exercise shape mirrors `com.bfit.application.dto.routine.RoutineExercise`** —
 *    `sets` is an int, `reps` and `rest` are STRINGS ("8-12", "90s"), because that record
 *    is what `RoutinePlanWriter` persists. The editor's fields are typed to match rather
 *    than to a tidier `number`, so the draft round-trips without a lossy conversion.
 * ════════════════════════════════════════════════════════════════════════════ */

// ── types (the api contract, as this surface consumes it) ────────────────────

/** `CoachProfileResponse.tier` — enum [STARTER] today; the ladder lands at MVE-6. */
export type CapacityTier = "STARTER";
/**
 * AC5's three rules. The api sends the code; src/lib/copy.ts owns the sentence.
 *
 * `PAIN_REPORTED` is published by the api and **never emitted**: there is no
 * structured pain signal in the product (`Feedback` is {EASY, OK, HARD} and no mobile
 * call site writes `workout_completion.notes`), so the server deliberately does not
 * compute that rule. We keep it in the vocabulary — and keep its sentence in copy.ts —
 * so the gap is visible rather than silently absent (ADR-0012 D6).
 */
export type RedFlagCode =
  | "MISSED_TWO_OR_MORE_SESSIONS"
  | "PAIN_REPORTED"
  | "NO_WEIGH_IN_14_DAYS";
/** `com.bfit.domain.workout.Feedback` — there is no PAIN value today (ADR-0012 D6). */
export type SessionFeedback = "EASY" | "OK" | "HARD";
/** The roster only ever lists ACTIVE rows; REVOKED links are history. */
export type ClientStatus = "ACTIVE";

/**
 * `GET /coach-portal/me` → `CoachProfileResponse`.
 *
 * Flat, not `{ capacity: { … } }`: the api returns the three capacity values
 * alongside the profile and inventing a nested object here would be this surface
 * disagreeing with its own contract for cosmetic reasons.
 */
export interface CoachMe {
  /** The coach's user id — the same account as their Evoli Fit login. */
  coachId: string;
  displayName: string;
  tier: CapacityTier;
  /** ACTIVE links held right now. */
  active: number;
  /** How many ACTIVE links the tier allows. */
  capacity: number;
}

/** One row of `GET /coach-portal/clients` → `CoachClientSummaryResponse`. */
export interface RosterClient {
  /** The `coach_clients` row id — the ONLY id the coach portal addresses. */
  id: string;
  traineeDisplayName: string;
  /** Null when the trainee's app is on no plan. */
  currentPlanName: string | null;
  /** `YYYY-MM-DD` (UTC) of the last completed workout; null if there has never been one. */
  lastCompletedWorkoutDate: string | null;
  currentStreakDays: number;
  status: ClientStatus;
  /** ISO-8601 instant — when the trainee accepted. */
  since: string;
}

/**
 * `GET /coach-portal/clients` → `CoachClientPageResponse`.
 *
 * A paged envelope, not a bare array: every collection endpoint on b-fit-api
 * paginates. The roster is one page in practice (see `ROSTER_PAGE_SIZE`).
 */
export interface RosterPage {
  items: RosterClient[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/**
 * The api caps `size` at 100 and the largest contemplated tier is 100 profiles, so
 * one page of 100 is the whole roster for every tier that can exist. If a tier ever
 * exceeds that, this constant stops being sufficient and the roster needs real
 * pagination — which is why the page reads `totalElements` and not `items.length`.
 */
export const ROSTER_PAGE_SIZE = 100;

/** `POST /coach-portal/invites` → 201 `CoachInviteResponse`. Raw token, once, ever. */
export interface InviteResponse {
  inviteId: string;
  token: string;
  /** ISO-8601 instant, creation + 7 days. */
  expiresAt: string;
}

/** What the UI actually renders: the api's token wrapped in this surface's URL. */
export interface Invite extends InviteResponse {
  url: string;
}

/** `TraineeWeightPoint`. */
export interface WeightPoint {
  /** `YYYY-MM-DD`. */
  date: string;
  weightKg: number;
}

/** `TraineeLastSession` — block 3. */
export interface LastSession {
  /** `YYYY-MM-DD` (UTC) of completion. */
  date: string;
  /** The workout's title; null if the workout row has since gone. */
  name: string | null;
  /** Null renders "No feedback given". */
  difficulty: SessionFeedback | null;
}

/**
 * `GET /coach-portal/clients/{id}` → `TraineeOverviewResponse`.
 *
 * Exactly AC5's five blocks and nothing else. Note there is **no plan name here** —
 * the plan is a roster-row field only, so the overview header must not claim one.
 */
export interface ClientOverview {
  /** The `coach_clients` row id. */
  clientId: string;
  traineeDisplayName: string;
  /** ISO-8601 instant — when the trainee accepted. */
  since: string;
  /** Block 1. Week boundaries are UTC (ADR-0012 risk (c)). */
  adherenceThisWeek: { done: number; planned: number };
  /** Block 2. */
  currentStreakDays: number;
  /** Block 3 — null renders "No sessions yet". */
  lastSession: LastSession | null;
  /** Block 4 — weigh-ins over the last 8 weeks, oldest first. Empty, never null. */
  weightSeries: WeightPoint[];
  /** Block 5 — an EMPTY list is "No red flags". */
  redFlags: RedFlagCode[];
}

// ── EV-184b: the routine contract (PROVISIONAL — see the block at the top) ───

/**
 * One prescribed exercise. Field for field `RoutineExercise` in
 * `com.bfit.application.dto.routine`, minus the fields no coach control touches
 * (`tempo`, `notes`, `weight`, `durationSeconds`): `sets` is an int, `reps` and
 * `rest` are strings because the persisted record's are.
 *
 * `catalogSlug` is `ExerciseCatalogEntry.slug` — the identity the coach PICKED.
 * It travels with the draft so the api never has to re-resolve a free-typed name,
 * which is what AC2's "the coach picks, never types" means on the wire.
 */
export interface RoutineExerciseEntry {
  catalogSlug: string;
  name: string;
  /** `ExerciseCatalogEntry.primaryMuscles`; null on a catalog row that has none. */
  primaryMuscles: string | null;
  /** `ExerciseCatalogEntry.equipment`; null means bodyweight/unspecified. */
  equipment: string | null;
  sets: number;
  /** "8-12", "AMRAP" — a string in the persisted record, not a number. */
  reps: string;
  /** "90s" — likewise. */
  rest: string;
}

/** One training day. `dayOfWeek` is ISO 1=Monday…7=Sunday, as `TrainingDay` has it. */
export interface RoutineDayEntry {
  dayOfWeek: number;
  /** `TrainingDay.focus` — the split label the coach reads ("Upper body"). */
  focus: string;
  exercises: RoutineExerciseEntry[];
}

/** A plan as the coach sees it: name + days. */
export interface RoutinePlanView {
  /** Null for a draft that has never been published. */
  planId: string | null;
  name: string;
  /** Schedule order is the api's order; this surface does not re-sort it. */
  trainingDays: RoutineDayEntry[];
}

/**
 * The trainee's stored profile facts, READ-ONLY (CS-22 / ADR-0001).
 *
 * `UserProfile.injuries` / `.equipment` are `List<String>`. They are displayed and
 * never submitted: there is no field in `CoachRoutineDraftRequest` that could carry
 * them, which is the structural version of the story's "may not submit them".
 */
export interface TraineeTrainingProfile {
  injuries: string[];
  equipment: string[];
}

/** A saved draft. `updatedAt` is an ISO instant — last write wins (edge case 2). */
export interface CoachRoutineDraft extends RoutinePlanView {
  updatedAt: string;
}

/** `GET /coach-portal/clients/{id}/routine`. */
export interface CoachRoutineResponse {
  clientId: string;
  traineeDisplayName: string;
  /** Null renders AC1's "No active plan" empty state. */
  activePlan: RoutinePlanView | null;
  /** Null means there is nothing unpublished; the header then claims no draft. */
  draft: CoachRoutineDraft | null;
  trainingProfile: TraineeTrainingProfile;
}

/** `PUT …/routine/draft`. Carries no ids and no injuries — deliberately (CS-22). */
export interface CoachRoutineDraftRequest {
  name: string;
  trainingDays: RoutineDayEntry[];
}

/**
 * One line of the publish preview. All three strings are the api's — the portal
 * renders them and never composes a rule sentence of its own, because the rule is
 * `RoutinePolicy`'s and only the engine knows which one fired.
 */
export interface PublishRepair {
  exercise: string;
  replacedWith: string;
  rule: string;
}

/** `POST …/routine/publish/preview`. An EMPTY `repairs` is "No changes were needed". */
export interface PublishPreview {
  repairs: PublishRepair[];
  /** Echoed back by publish; see decision 2 in the block at the top. */
  digest: string;
}

/** `POST …/routine/publish` → the plan the trainee now has. */
export interface PublishResult {
  planId: string;
  publishedAt: string;
  /** The number of repairs actually applied — may differ from the preview's. */
  repairCount: number;
}

/** One catalog row, pick-only. `slug` is the identity, `name` is the label. */
export interface CatalogExercise {
  slug: string;
  name: string;
  primaryMuscles: string | null;
  equipment: string | null;
}

/**
 * `GET /coach-portal/catalog/exercises`.
 *
 * The filter vocabulary ships with the results (decision 3): a hard-coded muscle list
 * in the web tier is product data invented outside the catalog.
 */
export interface CatalogPage {
  items: CatalogExercise[];
  /** Distinct `primaryMuscles` values, for the muscle filter. */
  muscles: string[];
  /** Distinct `equipment` values, for the equipment filter. */
  equipment: string[];
  /** True when more rows matched than were returned — the UI says "refine". */
  truncated: boolean;
}

// ── EV-185b: the nutrition contract (PROVISIONAL) ───────────────────────────

/**
 * `NutritionTarget.Source` is `AUTO | MANUAL` today; EV-185's migration adds
 * `COACH`. All three are here so the day the column gains its value this file does
 * not need editing — and so a value with no sentence cannot reach a coach's screen.
 */
export type NutritionTargetSource = "AUTO" | "MANUAL" | "COACH";

/** `ActivityLevel` — the enum verbatim; `copy.ts` owns the words. */
export type ActivityLevel = "SEDENTARY" | "LIGHT" | "MODERATE" | "ACTIVE" | "VERY_ACTIVE";

/** `WeeklyMealPlan.MealSlot`. */
export type MealSlot = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";

/** `NutritionTarget`, with the api's `…G` gram suffixes kept verbatim. */
export interface NutritionTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: NutritionTargetSource;
  /** `ActivityLevel`; null for a trainee who never completed nutrition onboarding. */
  activity: ActivityLevel | null;
  /** ISO instant — the date in "Set by you on {date}". */
  updatedAt: string;
}

/** `WeeklyMealPlan.PlannedMeal`, reduced to what the coach's week renders. */
export interface PlannedMealView {
  mealId: string;
  slot: MealSlot;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** `WeeklyMealPlan.PlannedDay`. `index` is 0–6 from the week start. */
export interface PlannedDayView {
  index: number;
  /** `YYYY-MM-DD`. */
  date: string;
  trainingDay: boolean;
  meals: PlannedMealView[];
}

/** The current week. Seven days, always — a short week is an api bug, not a state. */
export interface MealWeekView {
  /** `YYYY-MM-DD`, the Monday. */
  weekStart: string;
  days: PlannedDayView[];
}

/**
 * The trainee's stored `nutrition_preferences`, READ-ONLY.
 *
 * `rules` is `FoodRule` (HALAL / KOSHER) — hard exclusions. Nothing here is
 * submittable: no request type in this module carries an allergy, a rule or a dislike,
 * which is EV-185's "there is no control anywhere that would let them", enforced by
 * the type system rather than by review.
 */
export interface TraineeDietProfile {
  allergies: string[];
  rules: string[];
  dislikes: string[];
}

/** `GET /coach-portal/clients/{id}/nutrition`. */
export interface CoachNutritionResponse {
  clientId: string;
  traineeDisplayName: string;
  /** Null + a null week is AC1's "No nutrition set up yet". */
  targets: NutritionTargets | null;
  week: MealWeekView | null;
  /**
   * `YYYY-MM-DD` of the week the api considers current. The portal NEVER computes
   * this: a browser-derived Monday would disagree with the server for anyone whose
   * zone crosses the boundary, and "apply" would then be refused with
   * COACH_WEEK_OUT_OF_RANGE for reasons invisible to the coach (edge case 3/5).
   */
  currentWeekStart: string;
  dietProfile: TraineeDietProfile;
}

/** `PUT …/nutrition/targets`. Calories are clamped SERVER-side by the engine's floor. */
export interface CoachTargetsRequest {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * The saved targets plus the engine's own flag.
 *
 * `floorCalories` is non-null exactly when `NutritionService.setManual` raised the
 * value; the portal renders the engine's sentence from it rather than deciding for
 * itself that a floor applied — the floor is 1500/1200 by profile sex and this surface
 * does not know the trainee's sex and must not guess it.
 */
export interface CoachTargetsResult {
  targets: NutritionTargets;
  floorCalories: number | null;
}

/** `POST …/nutrition/week/apply` — current week only in slice 1. */
export interface CoachApplyWeekRequest {
  weekStart: string;
}

/** One swap candidate. `index` is `SwapOptionsResponse.Candidate.index`. */
export interface SwapCandidate {
  index: number;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** `GET …/week/meals/{mealId}/swap`. */
export interface SwapOptions {
  mealId: string;
  candidates: SwapCandidate[];
}

/** `POST …/week/meals/{mealId}/swap`. */
export interface CoachApplySwapRequest {
  candidateIndex: number;
}

// ── error helpers ────────────────────────────────────────────────────────────

export { ApiError } from "./apiFetch";

/**
 * The coach portal answers 403 uniformly for a foreign id, a revoked link AND an id
 * that never existed, so the prefix is not an existence oracle. All three land here
 * and must read the same to the coach.
 */
export function isForbidden(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}
export function isCapacityReached(err: unknown): boolean {
  return err instanceof ApiError && err.code === "COACH_CAPACITY_REACHED";
}

/**
 * The link is ACTIVE but does not carry the scope this screen needs — EV-184 AC1
 * ("This trainee has not shared their workouts with you.") and EV-185 AC1.
 *
 * PROVISIONAL, decision 1 at the top of this file: it is the error CODE that carries
 * the distinction, never the status, because the status is 403 for a scope denial, a
 * foreign id and an id that never existed alike. If the api declines to send this
 * code, every 403 falls through to `isForbidden` and the coach reads the roster
 * sentence — degraded, but never wrong.
 */
export function isScopeMissing(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && err.code === "COACH_SCOPE_MISSING";
}
/** 503 — ADR-0013's refuse-before-charging condition on the exercise catalog. */
export function isCatalogUnavailable(err: unknown): boolean {
  return err instanceof ApiError && err.code === "CATALOG_UNAVAILABLE";
}
/** 400 — a draft with zero training days (EV-184 AC4). */
export function isPlanEmpty(err: unknown): boolean {
  return err instanceof ApiError && err.code === "COACH_PLAN_EMPTY";
}
/** 409 — the digest did not match the repairs the coach was shown (EV-184 AC3). */
export function isRepairsUnacknowledged(err: unknown): boolean {
  return (
    err instanceof ApiError && err.code === "COACH_PUBLISH_REPAIRS_UNACKNOWLEDGED"
  );
}
/** 400 — slice 1 applies the CURRENT week only (EV-185 edge case 3). */
export function isWeekOutOfRange(err: unknown): boolean {
  return err instanceof ApiError && err.code === "COACH_WEEK_OUT_OF_RANGE";
}

// ── the live client ──────────────────────────────────────────────────────────

/**
 * `/coach-portal/clients/{id}` — the one id this surface addresses (the
 * `coach_clients` row id, never a user id), encoded once so no call site can forget.
 */
function client(id: string): string {
  return `/coach-portal/clients/${encodeURIComponent(id)}`;
}

const liveCoachApi = {
  getMe(): Promise<CoachMe> {
    return apiFetch<CoachMe>("/coach-portal/me");
  },
  listClients(page = 0, size = ROSTER_PAGE_SIZE): Promise<RosterPage> {
    return apiFetch<RosterPage>(`/coach-portal/clients?page=${page}&size=${size}`);
  },
  createInvite(): Promise<InviteResponse> {
    return apiFetch<InviteResponse>("/coach-portal/invites", { method: "POST" });
  },
  getClient(id: string): Promise<ClientOverview> {
    return apiFetch<ClientOverview>(
      `/coach-portal/clients/${encodeURIComponent(id)}`
    );
  },
  async revokeClient(id: string): Promise<void> {
    // 204 No Content — `apiFetch` parses an empty body to null, which is the point.
    await apiFetch<void>(
      `/coach-portal/clients/${encodeURIComponent(id)}/revoke`,
      { method: "POST" }
    );
  },

  // ── EV-184b routine (PROVISIONAL paths — see the block at the top) ─────────

  getRoutine(id: string): Promise<CoachRoutineResponse> {
    return apiFetch<CoachRoutineResponse>(`${client(id)}/routine`);
  },
  saveRoutineDraft(id: string, draft: CoachRoutineDraftRequest): Promise<CoachRoutineDraft> {
    return apiFetch<CoachRoutineDraft>(`${client(id)}/routine/draft`, {
      method: "PUT",
      body: JSON.stringify(draft),
    });
  },
  async discardRoutineDraft(id: string): Promise<void> {
    // 204 No Content.
    await apiFetch<void>(`${client(id)}/routine/draft`, { method: "DELETE" });
  },
  previewPublish(id: string): Promise<PublishPreview> {
    return apiFetch<PublishPreview>(`${client(id)}/routine/publish/preview`, {
      method: "POST",
    });
  },
  publishRoutine(id: string, digest: string): Promise<PublishResult> {
    return apiFetch<PublishResult>(`${client(id)}/routine/publish`, {
      method: "POST",
      body: JSON.stringify({ digest }),
    });
  },
  searchCatalog(q: string, muscle: string, equipment: string): Promise<CatalogPage> {
    const query = new URLSearchParams({ q, muscle, equipment });
    return apiFetch<CatalogPage>(`/coach-portal/catalog/exercises?${query.toString()}`);
  },

  // ── EV-185b nutrition (PROVISIONAL paths) ─────────────────────────────────

  getNutrition(id: string): Promise<CoachNutritionResponse> {
    return apiFetch<CoachNutritionResponse>(`${client(id)}/nutrition`);
  },
  saveNutritionTargets(id: string, body: CoachTargetsRequest): Promise<CoachTargetsResult> {
    return apiFetch<CoachTargetsResult>(`${client(id)}/nutrition/targets`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  applyMealWeek(id: string, weekStart: string): Promise<MealWeekView> {
    const body: CoachApplyWeekRequest = { weekStart };
    return apiFetch<MealWeekView>(`${client(id)}/nutrition/week/apply`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  regenerateDay(id: string, index: number): Promise<MealWeekView> {
    return apiFetch<MealWeekView>(
      `${client(id)}/nutrition/week/days/${index}/regenerate`,
      { method: "POST" }
    );
  },
  getSwapOptions(id: string, mealId: string): Promise<SwapOptions> {
    return apiFetch<SwapOptions>(
      `${client(id)}/nutrition/week/meals/${encodeURIComponent(mealId)}/swap`
    );
  },
  applySwap(id: string, mealId: string, candidateIndex: number): Promise<MealWeekView> {
    const body: CoachApplySwapRequest = { candidateIndex };
    return apiFetch<MealWeekView>(
      `${client(id)}/nutrition/week/meals/${encodeURIComponent(mealId)}/swap`,
      { method: "POST", body: JSON.stringify(body) }
    );
  },
};

export type CoachApi = typeof liveCoachApi;

const impl: CoachApi = COACH_API_MODE === "fixture" ? fixtureCoachApi : liveCoachApi;

export const coachApi = {
  ...impl,
  /**
   * The invite URL is built here, not by the api: only this surface knows the host a
   * phone can reach it on (ADR-0012 D5 — LAN IP for the demo, `pro.evoli.fit` when
   * ⛔ D8 lands). Shown and QR-encoded from this one string so the two are
   * byte-identical, which is AC2.
   *
   * The coach's display name is appended as `?coach=<name>` (EV-183 AC3): the mobile
   * consent screen has to name the coach *before* the trainee accepts, and the api has
   * no pre-accept lookup for an invite token, so the name has to travel on the link.
   * It is a hint, not a credential — the app falls back to "Your coach" without it, so
   * a failed /coach-portal/me must never cost the coach their invite.
   */
  async createInviteWithUrl(): Promise<Invite> {
    const [inviteResult, meResult] = await Promise.allSettled([impl.createInvite(), impl.getMe()]);
    if (inviteResult.status === "rejected") throw inviteResult.reason;
    const invite = inviteResult.value;

    const coachName =
      meResult.status === "fulfilled" ? sanitiseCoachName(meResult.value.displayName) : null;
    const query = coachName ? `?coach=${encodeURIComponent(coachName)}` : "";

    return { ...invite, url: `${INVITE_BASE_URL}/i/${invite.token}${query}` };
  },
};

/**
 * Ordering rule for the roster: needs attention first (EV-183's roster read).
 *
 * **Least recently seen first**, which is the only needs-attention signal the list
 * endpoint carries: `CoachClientSummaryResponse` has no `redFlags` field, and the
 * flags are computed per trainee by `GET /coach-portal/clients/{id}`. Fetching them
 * for the roster would mean one extra request per row on every render of the landing
 * page — an N+1 against a tier ladder that already contemplates 100 profiles — so the
 * red-flag chip lives on the overview only, and the roster sorts by
 * `lastCompletedWorkoutDate` ascending instead. A trainee who has never completed a
 * workout (null) sorts first: they are the most in need of attention, not the least.
 */
export function sortNeedsAttentionFirst(items: RosterClient[]): RosterClient[] {
  return [...items].sort((a, b) => {
    // "" sorts before every real YYYY-MM-DD, so null (never trained) leads.
    const av = a.lastCompletedWorkoutDate ?? "";
    const bv = b.lastCompletedWorkoutDate ?? "";
    if (av !== bv) return av < bv ? -1 : 1;
    return a.traineeDisplayName.localeCompare(b.traineeDisplayName);
  });
}
