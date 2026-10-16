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

- Round 2 (rulings EV-337g2-R1..R6, hub c2ca7092): after an outcome whose TARGETS step landed
  (APPLIED, WEEK_*) the select returns to "Their current targets" (`targetsLanded`); TARGETS_* keep
  the template. The library's landing sentence and the in-page one are ONE slot in the scope
  (`TemplateUseOutcome` puts the taken hand-off there); a template apply replaces it, and
  `applyWeek` calls `clearOutcome()` once its answer is in (any answer: my reading of "the next
  attempt"). A `?? landed` fallback would bring a cleared landing back (mutant R2b).
- Several ruled clauses (G2.3b, G2.3c(3), G2.3d(2), G2.1b focus) were already true at 91b60a2:
  they are pins, green before and after; their mutants are the evidence, not a red-first run.

- Resume 2026-10-15 (merge of main bfb4164 as 1be91e7, not a rebase): main's F1 (4c348b6) tags
  what the week card's ONE transition runs; that tag (`weekRunning`/`setWeekRunning`,
  `RunningAction`) now lives in `NutritionApplyScope` beside the transition, and the button reads
  « Application… » only for `kind === "apply"`. A naive resolution (`weekPending`) turns
  `qa/coach-nutrition-pending-labels.spec.ts` red 4/6 (default config). `NutritionTarget` is
  re-exported from `NutritionTemplateLibrary` for main's EV-356g page.
- R4's local focus return is `returnFocus`/`buttonWrap` + one `useEffect` in `NutritionApplyCard`;
  BUG-171's Modal restore made it a redundant restore, removed in BUG-171 (staff N6/N3); G2.1b
  in `qa/pro-nutrition-apply-card.spec.ts` now witnesses the Modal's restore.
- `targetsLanded` reads `TARGETS_LANDED: Record<UseOutcomeKind, boolean>` (N1): a new kind is a
  tsc error until classified.
- Cloud container: Playwright 1.63 wants chromium 1243, only 1194 is installed and downloads
  are proxy-blocked; a scratch PLAYWRIGHT_BROWSERS_PATH symlinking the 1243 paths to 1194 runs
  Chromium. WebKit cannot run there. A full default suite under 4 parallel suites exceeds the
  2 h background cap: run it in file chunks with `--reporter=list,json`.

**Why:** g3/g4/j1 all touch this page or the dialog next; each needs these facts first.
**How to apply:** read this before changing NutritionWeekCard, TemplateUseOutcome or the template dialog.
