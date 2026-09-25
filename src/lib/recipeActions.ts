"use server";

import { revalidatePath } from "next/cache";
import {
  ApiError,
  coachApi,
  isForbidden,
  isRecipeLimitReached,
  isRecipeMacrosInconsistent,
  isRecipeNameTaken,
  isRecipeUnknownIngredient,
  isValidationError,
  type CoachIngredientOption,
  type CoachRecipe,
  type CoachRecipeSaveRequest,
} from "./coachApi";
import { recipeFieldOf, type RecipeFailure } from "./recipeDocument";

/**
 * EV-256b's write path and its one read that runs from the browser (the ingredient
 * search). The library pages are server components; the editor and the delete dialog
 * are client islands and these actions are the only way either reaches b-fit-api — the
 * bearer token and the base URL stay on the server, exactly as for the templates.
 *
 * Each action returns a RESULT and never throws (see `templateActions.ts`): AC4 needs
 * every refusal to arrive as data carrying its FIELD, so the editor can put it next to
 * the control it is about. A thrown error would collapse them all into one boundary and
 * the coach's typing with it.
 *
 * ⚠ Every call site wraps these in `settled()` — a server action whose request fails
 * resolves with `undefined`, and the state that would be lost here is a recipe the coach
 * has been typing.
 */

function numberDetail(err: ApiError, name: string): number | null {
  const value = err.details?.[name];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringDetail(err: ApiError, name: string): string | null {
  const value = err.details?.[name];
  return typeof value === "string" ? value : null;
}

function classify(err: unknown): RecipeFailure {
  const none = { field: null, key: null, computedKcal: null };
  if (!(err instanceof ApiError)) return { code: "FAILED", ...none };
  if (isRecipeUnknownIngredient(err)) {
    return {
      code: "UNKNOWN_INGREDIENT",
      field: recipeFieldOf(err.details, null),
      key: stringDetail(err, "key"),
      computedKcal: null,
    };
  }
  if (isRecipeMacrosInconsistent(err)) {
    return { code: "MACROS_INCONSISTENT", ...none, computedKcal: numberDetail(err, "computedKcal") };
  }
  if (isRecipeNameTaken(err)) return { code: "NAME_TAKEN", ...none };
  if (isRecipeLimitReached(err)) return { code: "LIMIT_REACHED", ...none };
  if (isValidationError(err)) {
    return { code: "INVALID_FIELD", ...none, field: recipeFieldOf(err.details, err.message) };
  }
  // AC6 — one 403 for a foreign, an unknown and a deleted recipe. The portal does not
  // invent the distinction the server refuses to make.
  if (isForbidden(err)) return { code: "ACCESS_DENIED", ...none };
  return { code: "FAILED", ...none };
}

function revalidateLibrary(): void {
  revalidatePath("/recipes");
}

export type RecipeResult = { ok: true; recipe: CoachRecipe } | { ok: false; failure: RecipeFailure };

export async function createRecipeAction(body: CoachRecipeSaveRequest): Promise<RecipeResult> {
  try {
    const recipe = await coachApi.createRecipe(body);
    revalidateLibrary();
    return { ok: true, recipe };
  } catch (err) {
    return { ok: false, failure: classify(err) };
  }
}

export async function updateRecipeAction(
  id: string,
  body: CoachRecipeSaveRequest
): Promise<RecipeResult> {
  try {
    const recipe = await coachApi.updateRecipe(id, body);
    revalidateLibrary();
    revalidatePath(`/recipes/${id}`);
    return { ok: true, recipe };
  } catch (err) {
    return { ok: false, failure: classify(err) };
  }
}

export type DeleteRecipeResult = { ok: true } | { ok: false; failure: RecipeFailure };

export async function deleteRecipeAction(id: string): Promise<DeleteRecipeResult> {
  try {
    await coachApi.deleteRecipe(id);
    revalidateLibrary();
    return { ok: true };
  } catch (err) {
    return { ok: false, failure: classify(err) };
  }
}

export type IngredientSearchResult =
  | { ok: true; options: CoachIngredientOption[] }
  | { ok: false; code: "ACCESS_DENIED" | "FAILED" };

/**
 * AC2/AC3's search. The empty-result case is NOT a failure: `[]` is the api's answer,
 * it logs the demand line server-side, and the editor renders AC3's sentence for it.
 */
export async function searchIngredientsAction(q: string): Promise<IngredientSearchResult> {
  try {
    return { ok: true, options: await coachApi.searchIngredients(q) };
  } catch (err) {
    return { ok: false, code: isForbidden(err) ? "ACCESS_DENIED" : "FAILED" };
  }
}
