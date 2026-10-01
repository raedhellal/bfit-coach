/**
 * EV-272 — the Swap sheet's type-ahead over the coach's own recipes. Pure, with no
 * server import, so `qa/coach-swap-recipes.spec.ts` can pin the rules without a page.
 *
 * The library is capped at 100 (EV-256a AC5) and read once per sheet opening, so the
 * search runs in the browser (story NOT-list 1): no request per keystroke.
 */

/**
 * Apostrophes a coach's keyboard may write: U+2019 (macOS / iOS smart punctuation turns
 * the straight one into it as you type), U+2018, U+02BC and the backtick. Written as
 * escapes so no editor can quietly turn them back into the straight one.
 */
const APOSTROPHES = /[\u2019\u2018\u02BC`]/g;

/**
 * The search form of a name or a query: "Crêpes aux ÉPINARDS" → "crepes aux epinards".
 *
 * EV-272 AC3 folds case and accents; EV-276 widens it, on BOTH sides, with
 *   · the ligatures œ / Œ → "oe" and æ / Æ → "ae" — NFD does not split them (they are
 *     letters, not a letter plus an accent), and most keyboards cannot type them, so
 *     "boeuf" finds « Bœuf bourguignon »;
 *   · every apostrophe above → the straight one, so "chef's" finds « Chef’s salad » and
 *     "mom’s" finds "Mom's stew".
 * Nothing else is folded (EV-276 NOT-list): no ß, no hyphens, no spaces.
 */
export function foldForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(APOSTROPHES, "'");
}

/**
 * AC3 — a recipe matches when its name CONTAINS the trimmed query, ignoring case and
 * accents. The query is one substring, not words: "bowl oats" matches nothing. A query
 * of only spaces is the empty query (edge case 7), which matches everything.
 */
export function matchesQuery(name: string, query: string): boolean {
  const needle = foldForSearch(query.trim());
  return needle === "" || foldForSearch(name).includes(needle);
}

/**
 * AC2 — ascending distance between the recipe's kcal and the meal being replaced, ties
 * broken by name A→Z. Returns a new array; the input (the api's alphabetical list) is
 * left as it is.
 */
export function orderByKcalDistance<T extends { name: string; kcal: number }>(
  recipes: readonly T[],
  mealKcal: number
): T[] {
  return [...recipes].sort((a, b) => {
    const d = Math.abs(a.kcal - mealKcal) - Math.abs(b.kcal - mealKcal);
    if (d !== 0) return d;
    const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    return byName !== 0 ? byName : a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

/** Both at once: the rows the sheet shows for this query, in AC2's order. */
export function recipesFor<T extends { name: string; kcal: number }>(
  recipes: readonly T[],
  mealKcal: number,
  query: string
): T[] {
  return orderByKcalDistance(recipes, mealKcal).filter((r) => matchesQuery(r.name, query));
}

/** What a swap sheet knows about the meal it was opened on, for BUG-537. */
export interface MealContent {
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  provenance: string;
  placedByYou: boolean;
}

/**
 * BUG-537 — `recipe` is the one ALREADY on `meal`, so choosing it would write a no-op
 * swap (« Hachis parmentier de dinde » → « Hachis parmentier de dinde »).
 *
 * The coach's meal carries no recipe id (`CoachPlannedMeal` has none, and this branch
 * changes no api), so it is told by content. The placement copies the recipe's name,
 * kcal and macros onto the meal verbatim (`RecipeFit.asMeal`), so a meal this coach
 * placed (`COACH_RECIPE` + `placedByYou`) with the same name AND the same four numbers
 * would be rewritten with what it already holds. Anything short of that is a REAL
 * write and stays offered:
 *   · an engine meal that shares the name — placing changes who wrote it;
 *   · another coach's placement — placing makes it « Your recipe »;
 *   · the recipe edited since it was placed (other numbers) — placing brings it up to date.
 */
export function isMealsOwnRecipe(
  recipe: { name: string; kcal: number; proteinG: number; carbsG: number; fatG: number },
  meal: MealContent | null
): boolean {
  return (
    meal !== null &&
    meal.provenance === "COACH_RECIPE" &&
    meal.placedByYou === true &&
    recipe.name === meal.name &&
    recipe.kcal === meal.kcal &&
    recipe.proteinG === meal.proteinG &&
    recipe.carbsG === meal.carbsG &&
    recipe.fatG === meal.fatG
  );
}
