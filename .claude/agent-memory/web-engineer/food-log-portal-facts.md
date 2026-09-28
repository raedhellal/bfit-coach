---
name: food-log-portal-facts
description: EV-284b Food log on the nutrition tab — QUICK dashes are a rule on the source, no range is sent, <summary> takes phrasing content only, page-load reads have their own journal, and two branches that both re-vendor the api spec see each other's fields as drift
metadata:
  type: project
---

EV-284b (`feat/ev284b-coach-food-log`, built against b-fit-api main `6264142`,
2026-09-28) added `components/nutrition/FoodLogCard.tsx` under the nutrition tab. Facts
that are decisions, not details:

- **The numbers are the api's `totals`, never re-summed.** They come from the same code
  as the trainee's Today screen (AC2); a portal sum is a second answer. `totals` null is
  the ONLY "Nothing logged" signal on the collapsed row, never 0 kcal. Review N3: a
  day with totals but empty `entries` and `eatenMeals` keeps the totals in its summary
  and its expanded panel reads "Nothing logged" instead of opening onto nothing
  (fixture: Nils, two days ago, via `totalsOverride`).
- **QUICK → kcal and a dash per macro, as a rule on `source`.** Macros are stored
  `NOT NULL DEFAULT 0` (V28), so a 0 cannot mean "not entered" on any other entry; OFF
  and MANUAL show their 0. OFF is "From the food database" with OR without a barcode:
  the app sends the code for a scan and a search alike, so "Scanned" is not buildable.
- **No `from`/`to` is sent.** The api's default week ends on its UTC today (ADR-0025
  D25.6 decides otherwise, not the portal), and a day is `food_log.logged_on`, the
  server's UTC day of the write (BUG-274). The section says "Days are counted in UTC."
  and times carry " UTC".
- **`<summary>` takes phrasing content only.** A `<dl>` inside it is invalid, so the
  collapsed pairs are spans with `data-pair`/`data-value`; the expanded entries use
  `<dt>`/`<dd>`. Native `<details>` keeps the whole section a server component.
- **The log is a second read under NUTRITION, in parallel** (`Promise.allSettled`). Its
  failure is the section's own load error (never "not shared"); a 403 on it is access
  ended → `/clients/denied`. Fixture cookie `evoli_fixture_food_log=down|forbidden`
  reaches both branches.
- **Page-load reads have their own journal** (`reads` on `/api/fixture/calls`). EV-272's
  `calls` means recipe/swap operations and two of its specs assert it EXACTLY empty after
  a page load; recording the food-log read there turned them red.
- **Two portal branches that both re-vendor the api spec see each other's new fields as
  drift.** This branch registers EV-283a's fields in `qa/contract-deviations.ts` as owned
  by `feat/ev283b-routine-changed-banner`; whichever of the two merges SECOND deletes those
  entries (the register fails on a stale one, so it cannot be forgotten). Both branches
  carry a byte-identical `NutritionTemplateSaveRequest` untagged-root line, so they merge
  cleanly with each other; EV-273b deletes it when it lands.
- **Pre-existing, not fixed here:** the nutrition page overflows at 320 px from the
  targets card's "Activity level: Moderately active" line (right edge 376 px). The 320
  spec is scoped to the section's own boxes for that reason.
- **`recipe-placement-portal-facts`' "no `eaten` on the coach wire" still holds for the
  meal week** (`CoachPlannedMeal`); eaten marks reach the coach only through this log's
  `eatenMeals`, rendered under "From the plan".
- AC2's phone leg (portal totals vs the Today screen) is QA's device check.

See [[recipe-placement-portal-facts]], [[coach-portal-reads-scopes-never-a-status]],
[[a-fixture-without-the-shape-cannot-guard-it]].
