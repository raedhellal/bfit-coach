/**
 * The fixture's copy of EV-256a's recipe bounds, as the api states them in
 * `CoachRecipeSaveRequest` at b-fit-api `a3249bd`.
 *
 * Its own module, and NOT `src/lib/recipeDocument.ts`'s constants, for the reason the
 * fixture ports the rules from the Java: a fixture that validates with the subject's
 * numbers agrees with it by construction. Kept out of `coachApi.fixture.ts` only because
 * that file is `server-only` and `qa/coach-recipe-bounds.spec.ts` must import these to
 * hold all three copies (published spec, portal, fixture) equal. (The
 * `fixtureAdherence.ts` precedent: the pure part lives beside the fixture.)
 */
export const FIXTURE_RECIPE_BOUNDS = {
  nameMax: 80,
  ingredientsMin: 1,
  ingredientsMax: 25,
  stepsMax: 15,
  stepMaxLength: 300,
  kcalMin: 1,
  kcalMax: 3000,
  macroMin: 0,
  macroMax: 300,
  quantityMax: 5000,
} as const;
