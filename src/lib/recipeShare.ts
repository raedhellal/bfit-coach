import type { MealWeekView } from "./coachApi";

/**
 * EV-320 AC17 — how many of the week's meals come from the VIEWING coach's recipes.
 *
 * Read from what b-fit-api serves on every meal of `CoachMealWeekResponse` (the apply
 * response and the nutrition read alike): `provenance` and `placedByYou`. The EV-320a fill
 * writes `MealProvenance.coachRecipe(applyingCoach)`, so a filled meal arrives as
 * `COACH_RECIPE` + `placedByYou: true`, exactly like a recipe the coach placed by hand.
 *
 * `recipeMeals` counts `COACH_RECIPE` AND `placedByYou`: the sentence says "your recipes",
 * and a recipe a previous coach placed is `COACH_RECIPE` too (the "Coach recipe" marker).
 * Both are read as `=== ` so an api that omits a field counts nothing rather than guessing.
 *
 * Pure, so `qa/coach-recipe-share.spec.ts` drives it without a browser.
 */
export function recipeShare(week: MealWeekView | null): { recipeMeals: number; totalMeals: number } {
  const meals = week ? week.days.flatMap((d) => d.meals) : [];
  return {
    recipeMeals: meals.filter((m) => m.provenance === "COACH_RECIPE" && m.placedByYou === true).length,
    totalMeals: meals.length,
  };
}

/**
 * EV-320b follow-up (Raed's ruling, 2026-09-30) — does the week hold ANY meal whose text the
 * meal ENGINE wrote? The « generated in English » sentence ("Meal plans are generated in
 * English.", `nutrition.generatedInEnglish`) is about that text, so it is shown only when
 * at least one meal is not a coach recipe. The ingredient-check sentence beside it
 * (`nutrition.ingredientChecksEnglish`) does not read this: it shows on every week (BUG-536).
 *
 * "Coach recipe" is ANY coach's (`provenance === "COACH_RECIPE"`), not only `placedByYou`:
 * the note is about who WROTE the meal's words, and a recipe a previous coach placed was
 * written by a coach in their own language, exactly like this coach's. (AC17's count is
 * different: it says "YOUR recipes", so it needs `placedByYou`.)
 *
 * Read as `!== "COACH_RECIPE"`: a meal whose provenance is missing counts as the engine's,
 * so an api that omits the field keeps the note rather than hiding a true limitation.
 *
 * With NO week (or a week with no meals) this answers true: the next Apply writes engine
 * meals, so the note is still about what the coach is about to get.
 */
export function hasEngineMeal(week: MealWeekView | null): boolean {
  const meals = week ? week.days.flatMap((d) => d.meals) : [];
  return meals.length === 0 || meals.some((m) => m.provenance !== "COACH_RECIPE");
}
