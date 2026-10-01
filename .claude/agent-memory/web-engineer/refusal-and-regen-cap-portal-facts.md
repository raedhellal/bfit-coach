---
name: refusal-and-regen-cap-portal-facts
description: EV-071b coach refusal (422 NO_SAFE_MEAL_PLAN) and EV-242b day-regen cap (429 COACH_DAY_REGEN_LIMIT) - what the api really does vs what the story rules, and the fixture switches
metadata:
  type: project
---

Shipped on `fix/coach-refusal-and-regen-copy` (2026-10-01, demo-weekend). Facts measured
against b-fit-api origin/main c82e55b, none of them in the story text:

- **The api releases the coach's apply claim on EVERY refusal**, not "once per link per
  day" as EV-071 ruling 2 says. `CoachNutritionUseCase.applyWeek` catches any
  RuntimeException (NoSafeMealPlanException is one) and calls `releaseWeekApply`
  unconditionally. So every quota sentence ruling 2.1 wrote is false or unwitnessed.
  **Staff ruled 2026-10-01 (option a): the week block carries NO quota line.** I first
  shipped Q3 and staff rejected it: its "trying again will use it" was false too. The spec
  asserts all three ABSENT.
  **Why:** a sentence that is true "in every case it renders in" under the ruling's
  model can still be false under the api's real behaviour. Read the catch block, not the
  ruling.
  **How to apply:** add a quota line only when the api states the fact (EV-196).
- **The cap line is about the TRAINEE's counter.** Staff rejected "You've used today's
  regenerations…", because the trainee may have used them. Use the impersonal wording:
  "Today's day regenerations for {trainee} are used up." / "Les régénérations de jour
  {de(first)} sont épuisées pour aujourd'hui." **A successful coach Apply resets the
  counter** (the week save writes regenDate null, regenCount 0), so the card clears
  `regenCapped` there and nowhere else. A swap refreshes the week but leaves the counter.
- **The day-refusal block is cleared on two paths**: the regenerate success branch, and
  the `initialWeek !== seenInitial` re-seed after `router.refresh()`. A mutant removing
  only one path stays green; the spec's nit-9 assertion goes red only with both removed.
- **`429 COACH_DAY_REGEN_LIMIT` carries `{code, message}` only.** It has no reset instant
  and no Retry-After, because EV-242a's second half is not on api main. The message says
  "they reset tomorrow", and EV-242's failure clause forbids reading it. So the portal
  shows AC3's first sentence only and disables every Regenerate for the page session.
  When the api adds the instant, add AC3's second sentence.
- **`72563e8` (local-only `feat/ev071b-coach-refusal`) is superseded.** Its (A)/(B) line
  needs `Day.origin`, which `CoachPlannedDay` still does not carry. `CoachMealWeek.status`
  IS served now (`REFUSED`), but the read-side (C) for a week the trainee's own
  generation refused is still not rendered. The ruling 2.3 sentences ("Nothing was
  changed") are false for that case, so it needs its own copy.
- Fixture switches (cookies, one context): `evoli_fixture_week=no_safe_plan`,
  `evoli_fixture_regen=no_safe_plan|capped|fail`. Spec: `qa/coach-nutrition-refusal.spec.ts`.
- NILS's nutrition page prints "Set the targets, then apply a meal week." TWICE (the page
  empty state and the week card's `<p>`). Scope it with `locator("p")`.
