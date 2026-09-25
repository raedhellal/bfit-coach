---
name: recipe-placement-portal-facts
description: EV-256e "Use one of my recipes" — the coach wire has no `eaten`, the flag is server-wide but keyed per trainee in the fixture, and the fixture-blind fail-open read
metadata:
  type: project
---

EV-256e (`feat/ev256e-use-a-recipe`, against b-fit-api `6a76d92`, on main) put a meal
action, a picker dialog and the refusal copy on `/clients/[id]/nutrition`
(`components/nutrition/RecipePickerDialog.tsx`, `NutritionWeekCard.tsx`,
`lib/nutritionActions.ts` `placeRecipeAction`/`recipeChoicesAction`, copy in
`copy.placement`). Facts that are decisions, not details:

- **The coach's meal has no `eaten` and must not grow one** (EV-256 catch-up ruling;
  the trainee's food log is `D-CNS-1`'s). So the action shows on every NOT-LOCKED meal
  and an eaten one is answered by the api's 409 `COACH_MEAL_EATEN`. Never guess eaten
  client-side. AC5's apply warning says "up to n" for the same reason.
- **`recipePlacementEnabled` is SERVER-WIDE and false in production** until EV-256f
  ships. The fixture keys it to one trainee (`PLACEMENT_OFF_IDS`, Pia) so one dev
  server reaches both values — an affordance, not an api shape.
- **The fixture cannot see a fail-open read**: it always serves a boolean, so
  `!== false` passes every browser test. The predicate lives in
  `lib/recipePlacement.ts` and `qa/recipe-placement-flag.spec.ts` pins absent/null/
  malformed ⇒ hidden. Any future server-gated flag needs the same node-level pin.
- **Refusals stay in the open dialog; the one exception is 404
  `NUTRITION_NOT_FOUND`** (meal regenerated since load, edge case 6): close, show
  "This meal changed. Pick it again.", `router.refresh()`. The card now adopts a new
  `week` prop when it changes — before, `router.refresh()` never reached the card's
  state, so a "re-read" re-rendered the stale week.
- **Swap 409s (BUG-245) are matched by code**, handled in the swap dialog. At `6a76d92`
  the api never sends them on the swap route; they arrive with
  `fix/bug245-coach-swap-keeps-eaten` (unmerged at `105c25b`, not in the vendored spec).
- **Meal names repeat across the week**: locate a meal by its row
  (`role=group`, name "Friday Dinner", `data-meal-id`), never by `indexOf(name)`.
- **`Modal`'s Close squeezed to 39 px at 320** under a long title (flex items shrink
  by default); fixed in `kit.tsx` with `flexShrink: 0` + a `minWidth: 0` title block.

- **One 403 body means two things** (recipe deleted / link ended). Saying "not in your
  library" from the 403 alone flashed that sentence before the /clients/denied redirect
  in staff's live revoke run. The picker now re-reads the library and only says it when
  the recipe is really absent; otherwise the neutral `accessDenied` (not story copy).
- **Mid-session changes are fixture COOKIES, not process state**:
  `evoli_fixture_placement=off` and `evoli_fixture_link=ended` (read in
  `coachApi.fixture.ts`) scope a flag flip or a revoke to one browser context;
  `revokeClient()`'s process-wide flag would poison every later spec.
- **A mutant with no result line is NOT RUN, never a survivor or a kill.** Under load
  the webServer timed out (120 s) and the harness printed nothing; classify on
  "failed"/"passed" explicitly and rerun the NO-RUNs.

See [[recipe-library-portal-facts]], [[coach-editor-client-island-pitfalls]].
