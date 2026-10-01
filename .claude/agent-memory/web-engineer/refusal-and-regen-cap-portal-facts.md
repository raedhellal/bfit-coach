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
  RuntimeException and calls `releaseWeekApply` unconditionally. So ruling 2.1's Q2
  ("This has used today's apply...") is FALSE against the live api and is not rendered,
  not even on a second refusal in one page. Q3 renders on every apply refusal. If the api
  ever implements once-per-day, Q2 becomes renderable and the spec's `Q2_LEAD` absence
  check has to flip.
  **Why:** the ruling's "spent" variant was a claim the api never made true.
  **How to apply:** before rendering any quota claim, read `applyWeek`'s catch block.
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
