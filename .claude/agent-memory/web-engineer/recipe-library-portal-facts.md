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

- **Bounds are held equal in THREE places** by `qa/coach-recipe-bounds.spec.ts`: the
  vendored spec's `maxItems`/`maxLength`/`maximum`, `recipeDocument.ts`, and
  `src/lib/fixtureRecipeBounds.ts`. `contract-drift` compares NAMES only — staff loosened
  every recipe bound in the spec and 91 tests stayed green before this existed.
- **A row-addressing test needs the subject at index ≠ 0.** A mutant hardcoding
  `"ingredients.0"` passed 31/31 while the seeded retired key sat at index 0; it now sits
  at index 1. Same shape as a `.first()` locator: position 0 hides "always the first".
- **The fixture now 400s a non-UUID id** like the api (`INVALID_REQUEST`, type
  mismatch); a map-lookup 403 flattered the page's missing UUID guard.

See [[template-library-portal-facts]] for the create-without-remount rule this editor
reuses, and [[unicode-escapes-in-written-source]].
