---
name: swap-sheet-portal-facts
description: EV-272 Swap sheet (recipes first, suggestions on demand) — StrictMode doubles effect reads in next dev, the fixture call journal is the only "no request" witness, fixture coaches C1/C0/c100 keyed by email
metadata:
  type: project
---

EV-272 (`feat/ev272-swap-searches-my-recipes`, off b-fit-coach `ab14f02`) replaced
EV-256e's "Use one of my recipes" button with a recipes-first Swap sheet
(`components/nutrition/SwapSheet.tsx`; the recipe half is still in
`RecipePickerDialog.tsx`, which keeps its name; pure rules in `lib/recipeSearch.ts`).
Flag off = the old sheet, same DOM (`SuggestionRow` is shared by both).

- **An "exactly one request on open" AC cannot be met from a mount effect in `next dev`.**
  `reactStrictMode: true` mounts twice in dev, so the effect-driven library read went
  out TWICE and AC2's count failed. EV-256e's picker had the same shape and nobody
  counted. The fix: start the read in the click handler that opens the sheet and hand the
  promise to the sheet (`readLibrary()` → `target.library`). A prod build would have hidden
  this, and the gate runs `next dev`.
- **The browser never sees an api path.** Every read and write is a server action, a POST
  to the page URL. "Zero `GET …/meals/{M}/swap`" is witnessed by the fixture's call journal
  (`GET /api/fixture/calls`, 404 unless fixture mode, emptied by every reset, deliberately
  outside `FixtureState` so reads do not break the seed check). Count browser
  `next-action` POSTs as the second witness.
- **Fixture coaches are keyed by the sign-in EMAIL, and only for the recipe library**:
  `coach.c1@evoli.fit` (the story's six), `coach.c0@evoli.fit` (none),
  `coach.c100@evoli.fit` (100, edge case 5). Any other email gets the default library.
  Roster and links are shared. T-veg for EV-272 is **Tess V.** (`…0019`), not Vera,
  because AC9 needs a week with no recipe meal. `evoli_fixture_recipes=fail` makes the
  library read answer 500 for one browser context.
- **The sheet's mode is fixed when it opens** (`recipeSwap` vs `swapping`). Edge case 2
  refreshes the page under an open sheet. If the mode were read from the prop, the sheet
  would turn into the other sheet mid-choice.
- **Placement MEAL_LOCKED is now unreachable from the UI.** A locked meal's sheet asks
  nothing (AC6), so the 409 branch only fires if the trainee locks the meal after the
  sheet opened. It is kept.
- The EV-256e specs were serial, so one red test hid 50 others as "did not run". The red
  run used a throwaway copy with serial lifted. The new spec is not serial.

See [[recipe-placement-portal-facts]], [[one-worker-per-fixture-server]],
[[every-fixture-test-starts-from-the-seed]].
