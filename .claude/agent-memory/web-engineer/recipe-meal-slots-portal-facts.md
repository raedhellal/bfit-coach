---
name: recipe-meal-slots-portal-facts
description: EV-320c/EV-320b recipe meal-slot chips — the api's keep-on-omit rule, why the portal compares against a baseline instead of a touched flag, and three locator traps on /recipes
metadata:
  type: project
---

`feat/ev320c-portal-recipe-meal-slots` (2026-09-30, api EV-320a `0d58432`, vendored 741ed39)
added meal-slot chips to the recipe editor plus badges and a slot filter on /recipes.
**The ID is disputed.** The hub story names the portal row **EV-320b** (chips + the
"N repas sur M" count line, AC16–AC18) and says "EV-320c" was withdrawn. The orchestrator
used EV-320c as a provisional ID. senior-po settles it. AC17's count line was added in a
second commit on the same branch.

**Why:** the api's `mealSlots` is not whole-representation. On update, omitted or JSON
`null` KEEPS the stored tags. `[]` is a 400, so a tagged recipe can never go back to
untagged. On read, `null` means untagged, and the fill treats it as LUNCH + DINNER
(`CoachRecipeLibrary.UNTAGGED_SLOTS`).

**How to apply:**
- `slotsForSave` (`src/lib/recipeDocument.ts`) is the only place that decides. It always
  sends on create. On update it sends only when the chips differ from `slotBaseline`,
  compared through `effectiveSlots`.
- The baseline moves ONLY on a successful save, to the tags the api answered with.
- Why not a "touched" flag: a touched-and-restored selection should send nothing, and a
  change made before a refused save must still be sent. EV-274b's trap.
- Why not "always send": a typo fix would turn an untagged recipe into an explicit
  LUNCH,DINNER. A stale tab would also overwrite tags the seed wrote through the api.
- Specs in `qa/coach-recipe-slots.spec.ts` prove both. Three mutants were each caught:
  "always send", "baseline moves on send", and `null → []`.
- On /recipes, every `role=group` is a recipe row. `coach-recipes.spec.ts` reads the
  alphabetical order from `getByRole("group")`, so the badge list is a `<ul aria-label>`
  and the filter is a `<select>`. Neither is a group.
- A select WRAPPED in its `<label>` gets the selected option's text folded into its
  accessible name. `getByLabel("Meal time", {exact:true})` then finds nothing. Use
  `htmlFor`/`id`.
- `getByLabel("Meal time")` without `exact` also matches the badge list's
  `aria-label="Meal times"`. `getByRole("button",{name:"Déjeuner"})` matches
  "Petit-déjeuner". Use `exact: true` for every slot name.
- Chips before hydration: click only if `aria-pressed` is not yet the target state. A
  blind retry toggles the chip back (`setChip` in the spec).

**AC17's count line** (`src/lib/recipeShare.ts`, the week card):
- Needed no api change. Every coach meal already carries `provenance` + `placedByYou`, and
  the fill writes `coachRecipe(applyingCoach)`.
- It counts `COACH_RECIPE && placedByYou`, not the story's bare `COACH_RECIPE`: Vera's
  previous-coach recipe is not "vos recettes".
- The verb agrees with n ("1 repas sur 28 vient"). Both are deviations flagged to senior-po.
- It is hidden only on `recipePlacementEnabled: false`. The coach wire does NOT expose the
  fill flag, so with placement on and fill off an apply reads "0 of 28", which is true.
- The fixture's apply runs a REDUCED port of the fill, only when the context sets the
  `evoli_fixture_recipe_fill=on` cookie. Off by default, because on-by-default would rewrite
  every earlier apply spec's week.
- `coach.fill@evoli.fit` has 12 slot-tagged recipes that fill all 28 of Dana's meals. Its
  breakfasts sit at the top of the engine range because an engine day (1770) starts BELOW
  the day guard's ±10 % band (1782). The breakfast is tried first, so a lower breakfast is
  refused and the week ends at 27/28.

See [[recipe-library-portal-facts]], [[progress-goal-absent-key-semantics]],
[[a-whole-representation-put-needs-a-required-nullable-type]] (this field is the exception to that rule).
