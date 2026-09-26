"use server";

import { revalidatePath } from "next/cache";
import {
  ApiError,
  coachApi,
  isForbidden,
  isMealEaten,
  isMealLocked,
  isNutritionNotFound,
  isRecipeAllergiesUncheckable,
  isRecipeBelowFloor,
  isRecipeExcluded,
  isRecipeRuleUncheckable,
  isRecipeUnknownIngredient,
  isRouteNotFound,
  isWeekApplyRateLimited,
  isWeekOutOfRange,
  type CoachRecipeSummary,
  type CoachTargetsRequest,
  type CoachTargetsResult,
  type MealWeekView,
  type SwapOptions,
} from "./coachApi";

/**
 * EV-185b's write path. Same shape and same reasoning as `routineActions.ts`.
 *
 * There is no "publish" here and no draft: EV-185's ruling is that slice 1 writes the
 * trainee's live week directly, because the nutrition aggregate has no staging copy
 * and forking one is EV-092's work. Every action below is therefore immediately
 * visible to the trainee, which is why each one is behind a confirm dialog in the UI
 * and why the dialog says so in the story's own words.
 *
 * Note what is absent and cannot be added without changing this file: no action takes
 * an allergy, a dietary rule or a dislike. EV-185's non-negotiable ("there is no
 * control anywhere that would let them") is a property of these signatures, not a
 * promise made in a comment.
 */

/**
 * ADR-0015 D5: a 403 carries no scope information (the denial body is undifferentiated),
 * so this is `ACCESS_DENIED` — the link ended — and the scope sentence is decided from
 * the overview's `scopes` before this card is rendered at all.
 */
export type NutritionFailure =
  | "ACCESS_DENIED"
  | "WEEK_OUT_OF_RANGE"
  | "WEEK_RATE_LIMITED"
  /**
   * EV-256e AC7 — BUG-245's two 409s on the coach's Swap. Read by CODE, so they work
   * the day `fix/bug245-coach-swap-keeps-eaten` merges; until then `6a76d92` never
   * sends them on the swap route and these branches are dormant against live.
   */
  | "MEAL_EATEN"
  | "MEAL_LOCKED"
  | "INVALID"
  | "FAILED";

function classify(err: unknown): NutritionFailure {
  if (isMealEaten(err)) return "MEAL_EATEN";
  if (isMealLocked(err)) return "MEAL_LOCKED";
  if (isWeekOutOfRange(err)) return "WEEK_OUT_OF_RANGE";
  // ADR-0015 D6.6. Collapsed into FAILED, this read as "try again" — and the retry it
  // invited could not succeed until the next day.
  if (isWeekApplyRateLimited(err)) return "WEEK_RATE_LIMITED";
  if (isForbidden(err)) return "ACCESS_DENIED";
  return "FAILED";
}

function revalidateNutrition(clientId: string): void {
  revalidatePath(`/clients/${clientId}/nutrition`);
}

export type SaveTargetsResult =
  | { ok: true; result: CoachTargetsResult }
  | { ok: false; code: NutritionFailure };

export async function saveTargetsAction(
  clientId: string,
  body: CoachTargetsRequest
): Promise<SaveTargetsResult> {
  /**
   * AC2's "Enter a number above 0." is a CLIENT-side check that sends no request, and
   * it stays that way. This is the same rule restated on the server because a server
   * action is a public endpoint: a coach never sees this branch, but a hand-rolled POST
   * must not be able to write a zero or a negative target. The calorie FLOOR is not
   * repeated here — it belongs to `NutritionService.setManual`, it depends on the
   * trainee's profile sex, and this surface does not know it and must not guess it.
   */
  const values = [body.calories, body.proteinG, body.carbsG, body.fatG];
  if (values.some((v) => !Number.isFinite(v) || v <= 0)) {
    return { ok: false, code: "INVALID" };
  }
  try {
    const result = await coachApi.saveNutritionTargets(clientId, body);
    revalidateNutrition(clientId);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

export type WeekResult =
  | { ok: true; week: MealWeekView }
  | { ok: false; code: NutritionFailure };

/**
 * `weekStart` is echoed from the api's own `currentWeekStart`, never computed here —
 * a Monday derived in the coach's browser would disagree with the server's for anyone
 * whose zone crosses the boundary, and the refusal (COACH_WEEK_OUT_OF_RANGE) would be
 * invisible to the coach. Edge case 3 and edge case 5 are the same bug seen twice.
 */
export async function applyWeekAction(
  clientId: string,
  weekStart: string
): Promise<WeekResult> {
  try {
    const week = await coachApi.applyMealWeek(clientId, weekStart);
    revalidateNutrition(clientId);
    return { ok: true, week };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

export async function regenerateDayAction(
  clientId: string,
  index: number
): Promise<WeekResult> {
  try {
    const week = await coachApi.regenerateDay(clientId, index);
    revalidateNutrition(clientId);
    return { ok: true, week };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

export type SwapOptionsResult =
  | { ok: true; options: SwapOptions }
  | { ok: false; code: NutritionFailure };

export async function swapOptionsAction(
  clientId: string,
  mealId: string
): Promise<SwapOptionsResult> {
  try {
    return { ok: true, options: await coachApi.getSwapOptions(clientId, mealId) };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

export async function applySwapAction(
  clientId: string,
  mealId: string,
  candidateIndex: number
): Promise<WeekResult> {
  try {
    const week = await coachApi.applySwap(clientId, mealId, candidateIndex);
    revalidateNutrition(clientId);
    return { ok: true, week };
  } catch (err) {
    return { ok: false, code: classify(err) };
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * EV-256e — "Use one of my recipes".
 *
 * Two actions: the picker's list (read when the dialog opens, as the Swap reads its
 * candidates — the list is the coach's, it can change in another tab, and a meal week
 * page that never opens the picker should not pay for it), and the placement itself.
 *
 * The portal checks NOTHING before it asks. It has no `eaten`, no ingredient
 * categories, no dietary pattern and no floor — the api decides every refusal under
 * the plan lock against the meal as it is now, and the portal's whole job is to render
 * each one in the story's words, with the dialog left open (AC3).
 * ════════════════════════════════════════════════════════════════════════════ */

export type RecipeChoicesResult =
  | { ok: true; recipes: CoachRecipeSummary[] }
  | { ok: false; code: "FAILED" };

export async function recipeChoicesAction(): Promise<RecipeChoicesResult> {
  try {
    return { ok: true, recipes: (await coachApi.listRecipes()).recipes };
  } catch {
    return { ok: false, code: "FAILED" };
  }
}

/**
 * Every outcome the placement can have, each with the ONE detail its sentence needs.
 * Numbers and the excluded ingredient's label come from `details`; a refusal whose
 * detail is missing or the wrong type degrades to the generic sentence rather than
 * printing "undefined kcal".
 */
export type PlacementFailure =
  | { code: "EXCLUDED_INGREDIENT"; value: string }
  | { code: "EXCLUDED_NAME" }
  | { code: "RULE_UNCHECKABLE" }
  | { code: "ALLERGIES_UNCHECKABLE" }
  | { code: "BELOW_FLOOR"; floorKcal: number; dayKcalAfter: number }
  | { code: "MEAL_EATEN" }
  | { code: "MEAL_LOCKED" }
  | { code: "RETIRED_INGREDIENT" }
  | { code: "MEAL_CHANGED" }
  | { code: "PLACEMENT_OFF" }
  | { code: "ACCESS_DENIED" }
  | { code: "FAILED" };

function detail(err: ApiError, name: string): unknown {
  return err.details?.[name];
}

function classifyPlacement(err: unknown): PlacementFailure {
  if (!(err instanceof ApiError)) return { code: "FAILED" };
  if (isMealEaten(err)) return { code: "MEAL_EATEN" };
  if (isMealLocked(err)) return { code: "MEAL_LOCKED" };
  if (isRecipeAllergiesUncheckable(err)) return { code: "ALLERGIES_UNCHECKABLE" };
  if (isRecipeRuleUncheckable(err)) return { code: "RULE_UNCHECKABLE" };
  if (isRecipeUnknownIngredient(err)) return { code: "RETIRED_INGREDIENT" };
  if (isRecipeExcluded(err)) {
    const field = detail(err, "field");
    const value = detail(err, "value");
    if (field === "name") return { code: "EXCLUDED_NAME" };
    if (field === "ingredient" && typeof value === "string" && value.trim() !== "") {
      return { code: "EXCLUDED_INGREDIENT", value };
    }
    return { code: "FAILED" };
  }
  if (isRecipeBelowFloor(err)) {
    const floorKcal = detail(err, "floorKcal");
    const dayKcalAfter = detail(err, "dayKcalAfter");
    if (typeof floorKcal === "number" && typeof dayKcalAfter === "number") {
      return { code: "BELOW_FLOOR", floorKcal, dayKcalAfter };
    }
    return { code: "FAILED" };
  }
  if (isNutritionNotFound(err)) return { code: "MEAL_CHANGED" };
  if (isRouteNotFound(err)) return { code: "PLACEMENT_OFF" };
  if (isForbidden(err)) return { code: "ACCESS_DENIED" };
  return { code: "FAILED" };
}

export type PlaceRecipeResult =
  | { ok: true; week: MealWeekView }
  | { ok: false; failure: PlacementFailure };

export async function placeRecipeAction(
  clientId: string,
  mealId: string,
  recipeId: string
): Promise<PlaceRecipeResult> {
  try {
    const week = await coachApi.placeRecipe(clientId, mealId, recipeId);
    revalidateNutrition(clientId);
    return { ok: true, week };
  } catch (err) {
    return { ok: false, failure: classifyPlacement(err) };
  }
}
