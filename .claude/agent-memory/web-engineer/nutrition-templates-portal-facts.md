---
name: nutrition-templates-portal-facts
description: EV-273b (targets-only nutrition templates) — where it lives, the api shapes, the two-action apply, the French port, and the test traps it hit (streaming action bodies, nav label collisions, journal records GET nutrition, the cap switch)
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

**French (EV-324 merged in, 2026-09-30, merge `dc0e8ce`):**
- The branch sat UNPUSHED for three days (staff-reviewed at `c4ef90a`) while main grew the
  i18n split. A task that says "create branch X" may find X already exists locally with
  reviewed work: check `git branch --list` and `git log origin/main..X` before `worktree
  add -b`, and bring it forward with a merge rather than rebuild it.
- A `node_modules` SYMLINK is not matched by `.gitignore`'s `node_modules/` (trailing slash =
  directories only). `git add -A` in a worktree with a symlinked node_modules stages it.
  Stage paths explicitly.
- French nav label is "Modèles nutrition", never bare "Modèles" (the routine library's).
  It contains "Modèles", so a French `getByRole("link", {name: "Modèles"})` needs `exact`.
- `nutritionTemplates.amount(value, unit)` exists because English prints raw ("1800 kcal",
  EV-324 AC2) and French groups with U+202F ("1 800 kcal"); `formatKcal` alone would have
  changed the English dialog to "1,800".
- The api's duplicate suffix is English `(copy)` on a French page. It is data (the api
  names the row), not UI; `expectNoEnglish` rightly ignores it. Worth a line to Raed.
- `evoli_fixture_nutrition_template_cap=reached` refuses create/duplicate with the 409
  without changing the served list (a second tab filled it) — the cap is otherwise
  untestable short of 47 UI creates.
- The apply specs stay on `playwright.roster.config.ts`: the default scenario's roster is
  empty, so "Use on a trainee" offers nobody there.

**Staff follow-ups (APPROVED at 3bfd017, 2026-09-30):**
- Rename is `renameNutritionTemplateAction(id, name)`: GET the template, then PUT
  `{name, targets: current.targets}`. The row's rendered targets reverted another tab's
  edit. The api has no If-Match, so GET→PUT only NARROWS the race. The fixture now journals
  `GET /coach-portal/nutrition-templates/{id}` (editor page renders log it too).
- **An access-lost redirect hides a wrong hand-off.** A week 403 that wrongly handed off
  WEEK_FAILED and pushed to the trainee page (mutant M6) passed "hand-off is null" AND
  "journal has one GET …/nutrition": the layout's overview 403 redirects before the page
  reads, and /clients/denied discards the hand-off. Witness the NAVIGATION: no browser
  request for `/clients/{id}/nutrition` after Confirm. Measure a proposed assertion
  against the mutant before trusting it.
- "(copy)" stays English in French: the portal cannot tell the api's suffix from a name a
  coach typed, and the rename dialog would write a translated display back.
