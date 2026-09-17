"use server";

import { revalidatePath } from "next/cache";
import {
  coachApi,
  isForbidden,
  isWeekApplyRateLimited,
  isWeekOutOfRange,
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
  | "INVALID"
  | "FAILED";

function classify(err: unknown): NutritionFailure {
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
