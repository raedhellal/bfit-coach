---
name: recipe-library-portal-facts
description: b-fit-coach /recipes (EV-256b) — the api's TWO refusal shapes, why a retired key is the only reachable unknown-ingredient path, the name/whole-number counting rules, and why the fixture ports the Java instead of the portal's module
metadata:
  type: project
---

EV-256b (`feat/ev256b-recipe-library-page`, typed against b-fit-api `a3249bd`, merged)
added `/recipes`, `/recipes/new`, `/recipes/[id]`, `src/lib/recipeDocument.ts` (pure
rules + refusal addressing), `src/lib/recipeActions.ts` and `src/components/recipes/*`.
Placement on a trainee is EV-256e, not here.

- **The api answers a 400 in TWO shapes, and the portal must read both.**
  `CoachRecipeRules` refusals (name after trimming, blank step, key twice) are
  `VALIDATION_ERROR` + `details.field`; Bean Validation's (bounds, whole numbers, sizes)
  are `VALIDATION_ERROR` with NO details and the field LEADING `message`
  (`"proteinG must be a whole number"`, `"ingredients[1].quantity …"`, `"steps[3] …"`).
  `recipeFieldOf` accepts only a token of the body's shape, so a French JVM sentence can
  never be read as a field. The fixture reproduces both shapes on purpose.
- **`COACH_RECIPE_UNKNOWN_INGREDIENT` is unreachable from the UI except through a RETIRED
  key.** Every line comes from a search result, so the only way to meet it is a stored
  recipe whose key left the vocabulary (`unknownKeys` on read). The fixture seeds
  "Quark pancakes" with `quark` for exactly this; the load-time badge ("No longer on
  Evoli's list") and the save refusal are DIFFERENT strings so a spec can tell "the
  read said so" from "the api refused this line".
- **Local checks port the api with the api's unit.** Name: `CoachTemplateNames.normalise`
  (Zs→space, Cf removed, Java `strip()` — not JS `trim()`), then `.length` in UTF-16 (an
  emoji is 2 on both sides). Macros: 50.7 refused, 50.0 accepted. Quantity ≤ 2 decimals,
  and 150.000 is refused locally because the api's `@Digits` refuses it too. The macro
  CONSISTENCY rule is NOT pre-checked — AC4 wants the server's `computedKcal` sentence.
- **Steps are sent `strip()`ped**: the api's `@Size(max=300)` runs on the RAW string, so
  a 300-char step with a trailing space would be refused for text nobody can see.
- **The fixture ports the rules from the Java, not from `recipeDocument.ts`.** A fixture
  that validates with the subject's own module agrees with it by construction (see
  [[coach-contract-drift-guard]]). It also carries all 105 vocabulary keys, so
  `q=chick` returns the api's four results, not a hand-picked list.
- **Refusals from the browser for the bean shape are unreachable by design** (local
  checks fire first), so `qa/coach-recipe-rules.spec.ts` drives `serverProblem` /
  `recipeFieldOf` directly — a Playwright file with no `page`, importing a pure module.
  That only works while every `coachApi` import in `recipeDocument.ts` is `import type`.

See [[template-library-portal-facts]] for the create-without-remount rule this editor
reuses, and [[unicode-escapes-in-written-source]].
