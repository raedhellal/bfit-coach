---
name: coach-portal-i18n-facts
description: EV-324 French portal — what `satisfies Copy` cannot see, which texts are api content (stay English), the fixture sign-in trap, and the AC2/AC3 date conflict
metadata:
  type: project
---

EV-324 (branch `feat/ev324-coach-portal-french`, 2026-09-29) split `src/lib/copy.ts` into
`en` + `copy.fr.ts` `fr` (`satisfies Copy`), with `getCopy()` (server, `headers()`) and
`useCopy()` (client context). Formatters in `format.ts` take a REQUIRED `Locale`. The
README's Copy section says how to add a string; these are the non-obvious parts.

**Why:** Raed's investor demo, Sat 2026-10-03, is in French; ruling R1 = the first
`Accept-Language` entry decides, no UI switch, no stored preference.

**How to apply:**
- `satisfies Copy` fails `tsc` on a missing/extra key EXCEPT inside `as Record<string,
  string>` maps (mealSlots, activityLabels, guardrails, ruleLabels, goalLabels…).
  `qa/coach-i18n.spec.ts` compares key sets at run time for those — witnessed red on a
  deleted `mealSlots.SNACK` while `tsc` stayed green.
- A new enum-label map that must leave English unchanged (AC2) uses an IDENTITY English
  map (`HALAL: "HALAL"`) and French words; English words for tokens are a separate UX row.
- `qa/coach-i18n.spec.ts` also fails when a French string (or template output with "Qz"
  args) equals English, unless allowlisted with a reason. `qa/coach-french.spec.ts`'s
  leftover guard compares page text to EN-only dictionary strings — a page anchor that
  is itself the sabotaged string fails on the anchor first, so sabotage a non-anchor
  (the placeholder) to witness the guard.
- English on a French page that is NOT a defect (api content, R3): meal names (engine and
  model, EV-015), exercise names and the catalogue's muscle/equipment filter values,
  workout names, the api's `repairs` sentences in the publish preview, trainee-typed
  allergies/dislikes, ingredient labels. SUPERSEDED for the catalogue's muscle/equipment
  VALUES by BUG-489 (`fix/portal-french-polish-2`): they are labelled via `copy.catalog` +
  `src/lib/catalogLabels.ts`, and the fixture catalogue was moved onto the api's own
  vocabulary (V21: `quads,glutes`, `DUMBBELLS`) so the map is exercised by fixture specs.
  Exercise NAMES stay English.
  🔴 **V21 is NOT production's vocabulary** (staff CHANGES REQUESTED, 2026-10-01): prod runs
  `EXERCISE_PROVIDER=musclewiki`, and `SyncExercisesUseCase.toEntry` stores MuscleWiki's
  first primary muscle VERBATIM ("Anterior Deltoid", "Traps (mid-back)") and the category
  UPPER-CASED ("BOSU-BALL", "MEDICINE-BALL", "TRX"). A gate api on `EXERCISE_PROVIDER=seed`
  shows V21's tokens — a "live" picker dump is only as good as its provider. Check
  `application.yml` and the sync code before calling any catalogue vocabulary "live".
- Ingredient search matches ENGLISH labels (`IngredientLabels.of(key)`, keys like
  `chicken_breast`, api `CoachRecipeUseCase.searchIngredients`), so the French
  placeholder says "En anglais : chicken, rice, oats…".
- The fixture signs in ANY credentials: a wrong-password refusal is unreachable in the
  default suite; use `/login?error=expired` for a refusal line.
- An existing recipe/template editor is titled with the item's name, not "Edit …".
- AC3 writes the English date as "Oct 3, 2026" (en-US); AC2 (existing suite unchanged)
  needs en-GB "3 Oct 2026". Kept en-GB and recorded it in the spec.
- The legal footer lives in the ROOT layout (every page), sticky ≥ 768 px; the frame is
  shortened by `--legal-footer-h` so short pages are never covered. Below 768 it is static.
- `coachApi.ts` still has English `initialiserName` fallbacks ("Your gym"); /activate
  maps the two kinds itself because BUG-195c owned coachApi.ts that week.

See [[stories-carry-verbatim-copy]], [[unicode-escapes-in-written-source]] (it happened
again here: `\u00a0` in `copy.fr.ts` and `\u202f` in specs landed literal — scan after
every write), [[coach-portal-fixture-mode]].
