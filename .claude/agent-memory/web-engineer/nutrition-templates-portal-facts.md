---
name: nutrition-templates-portal-facts
description: EV-273b (targets-only nutrition templates) — where it lives, the api shapes, the two-action apply and the test traps it hit (streaming action bodies, nav label collisions, journal now records GET nutrition)
metadata:
  type: project
---

EV-273b shipped on `feat/ev273b-portal-nutrition-templates` (b-fit-coach, off 117bbc0), against
b-fit-api 8b23d45. TARGETS ONLY by senior-po's N6 ruling: no `mealStructure`, no pins, until
EV-190d/EV-190e clear N1 and EV-273e adds the field.

**Why:** a template's structure field would be the first portal control that sends EV-190's N1,
which has unmet release conditions (ADR-0016b D16b.11).

**How to apply:**
- Code: `src/app/nutrition-templates/**`, `src/components/nutritionTemplates/*`,
  `src/lib/nutritionTemplateActions.ts` (server actions), `src/lib/nutritionTemplateUse.ts`
  (client-safe constants + the sessionStorage outcome hand-off). The outcome banner is
  `TemplateUseOutcome` on `/clients/[id]/nutrition`.
- Api: `/coach-portal/nutrition-templates` list/create, `/{id}` get/put/delete, `/{id}/duplicate`.
  No rename mapping (rename = whole PUT). List items are full templates. Codes
  `COACH_NUTRITION_TEMPLATE_LIMIT_REACHED` / `_NAME_TAKEN`, unknown keys `COACH_FIELD_NOT_ACCEPTED`.
  The response serves `mealStructure`; the portal type omits it on purpose (registered deviation).
- `coachApi.applyMealWeek(id, body)` takes the BODY now, so the fixture journal logs the
  serialised key set (`POST …/week/apply {weekStart}`). The journal also logs every
  `GET …/nutrition` (page renders too) — whole-journal assertions must snapshot first.
- Fixture switches (cookies): `evoli_fixture_targets=refused` (500),
  `evoli_fixture_week=rate_limited|out_of_range` (429/400). "No answer" = `route.abort()` on the
  browser's action POST, classified by its args (`["id",{calories…}]` vs `["id","YYYY-MM-DD"]`).
- A server action's response BODY keeps streaming after its result; the island moves on before
  `requestfinished`. Use the `response` event as "answered", and dedupe — navigation later
  fails the same request (`requestfailed` after `response`).
- Adding the nav label "Nutrition templates" broke every non-exact
  `getByRole("link", {name: "Templates"|"Nutrition"})` in other specs (substring match). Any new
  nav label that contains an old one needs an `exact: true` sweep.
- StrictMode double-runs mount effects in `next dev`: an effect that read-and-removed the
  hand-off then set `null` on the second run erased the banner. Only ever SET from such an effect.
- Two portal branches vendoring the spec in parallel: the one that syncs a newer api must
  register the other's unmerged fields as deviations, and delete them when it merges the other
  in (done for EV-274a when origin/main 4961a65 was merged into this branch). The guard's
  "register cannot rot" check is the reminder.

Related: [[swap-sheet-portal-facts]], [[every-fixture-test-starts-from-the-seed]],
[[playwright-gettext-is-case-insensitive-substring]], [[stories-carry-verbatim-copy]].

Staff review (blocker, fixed at b191df1): a client-side hand-off to a page is NOT guaranteed a
landing — the `[id]` layout can redirect to /clients/denied first. Stamp it (`at`), expire it
(2 min), mount the reader on every branch, and discard it on /clients/denied. Also: the kit
`Button` drops hyphenated props (`aria-*`) silently and tsc does not check hyphenated JSX
attributes; `disabled={pending}` is no double-click guard within one JS task — use a ref latch.
