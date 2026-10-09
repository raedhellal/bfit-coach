---
name: first-name-fallback-is-mid-sentence-lower-case
description: BUG-720 — firstName()'s fallback "This trainee"/« Ce client » is lower-cased inside a sentence via midSentence(); six firstName() calls feed 31 copy keys; the table spec pins all of them
metadata:
  type: project
---

`firstName(null|blank, locale)` returns "This trainee" / « Ce client », the SENTENCE-INITIAL form.
Since BUG-720 (2026-10-09, ruling 720-R1, branch `fix/bug-720-this-trainee-lowercase`) every copy
function that puts `first` anywhere but a sentence's first word wraps it: `mid(first)` in
`copy.ts` / `copy.fr.ts`, which is `midSentence(first, locale)` from `src/lib/format.ts`. French
wraps BEFORE `de` / `que` (`de(mid(first))`), so the elision rule reads « ce client » and gives
« de ce client », « que ce client ». `de()` and `que()` themselves are unchanged
(`french-polish.spec.ts` still pins `de("Ce client")` = "de Ce client").

**Why it is safe to compare by string:** a real first name is one whitespace-free token
(`split(/\s+/)[0]`), so it can never equal the two-word fallback; no name is ever lower-cased.

**The trace (for the next sentence that takes `first`):** `firstName()` is called in six places:
overview `page.tsx` (progressGoal.notShared), `routineChange.ts` (routine.traineeChanged),
`ProgressGoalBlock` (noWeightYet), `NutritionWeekCard` (nutrition.* refusals, weekGenerating,
dayRegenCapped, placement.applyWarning/mealEaten/mealLocked, and `SwapSheet` →
`RecipePicker.refusalSentence` → placement.*), `NutritionTemplateLibrary` (confirm dialog) and
`TemplateUseOutcome` (outcomes). 31 keys per language; 42 mid-sentence lines (17 EN, 25 FR).
A NEW sentence with `first` after its first word must use `mid(first)`, and must get a row in
`qa/first-name-fallback-case.spec.ts` (KEYS is pinned at 31).

**How to apply:** default is the capital, so a missed site keeps the old defect rather than
starting a sentence in lower case. The browser witnesses are in
`qa/pro-roster-unnamed-client.spec.ts` (BUG-720 block: Petra `__null__` through "Use on a
trainee", Yusuf `__null__` for the routine banner, Chromium + WebKit). See
[[unnamed-trainee-is-absent-not-unknown]], [[french-copy-elision-and-numbers]].
