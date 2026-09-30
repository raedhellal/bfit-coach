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
