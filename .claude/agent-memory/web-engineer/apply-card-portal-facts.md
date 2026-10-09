---
name: apply-card-portal-facts
description: EV-337g2 apply card on the coach nutrition tab - where the one apply button lives, the BUG-718 predicate that follows it, the 4th page read, the template-list fixture switch, and why the spec runs in the roster config
metadata:
  type: project
---

EV-337g2 (branch feat/ev337g2-apply-card, 2026-10-09) moved the page's only « Appliquer à {client} »
button out of the meal week's head into `NutritionApplyCard` (aside, under the targets card).

- The current-targets apply (dialog, `applyWeek`, error line, `week-generating`, refusal block)
  stays in `NutritionWeekCard`; only its open state and `useTransition` moved up into
  `NutritionApplyScope` so the button can open it. A future slice (g3 day grid) that touches the
  week card must keep reading `useApplyScope()`, or the button silently stops opening anything.
- **BUG-718 predicate follows the button**: `TemplateUseOutcome`'s prop is `applyButtonDrawn`
  (was `weekCardDrawn`), still the page's one `shown !== null`. `weekApplyLabel` lives in
  `NutritionApplyCard.tsx` now; the card and the outcome both call it (G2.4).
- The template path reuses the library dialog via `TemplateUseConfirmDialog` (`onLand` prop).
  In-page outcomes go through the scope, NOT `handOffOutcome` (a hand-off would be re-taken by
  the next render within its 2 min TTL and shown twice).
- The nutrition page's document render makes **4 reads** (+`listNutritionTemplates`, in the same
  allSettled; depth still 2). `qa/page-read-budget.spec.ts` pins it in 4 places.
- Templates are seeded only in the POPULATED fixture scenario, so `pro-nutrition-apply-card.spec.ts`
  is in `playwright.roster.config.ts` (and the main config's testIgnore). Fixture switch
  `evoli_fixture_nutrition_templates=fail|empty` covers G2.5.
- Word-for-word "same dialog as the library" checks cannot catch a mutation of the SHARED
  component (both sides change). The meaningful mutant mutates what the client page passes in
  (template/trainee props) — see [[a-witness-does-not-choose-between-two-checks]].

**Why:** g3/g4/j1 all touch this page or the dialog next; each needs these facts first.
**How to apply:** read this before changing NutritionWeekCard, TemplateUseOutcome or the template dialog.
