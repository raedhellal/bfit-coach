---
name: every-fixture-test-starts-from-the-seed
description: EV-223 — the fixture store is reset before every Playwright test; how, what the seed check can and cannot see, and why the each-file-alone loop was green on main while the Publish test was red alone
metadata:
  type: project
---

Since EV-223 every fixture-mode spec imports `test` from `qa/fixture-test.ts`, whose auto
fixture signs in, `DELETE`s `/api/fixture/state` and asserts `{ pristine: true }` before
the body runs. `qa/fixture-isolation.spec.ts` fails if a spec file outside its exempt
list imports `test` from `@playwright/test`. The route answers 404 unless
`COACH_API_MODE=fixture` (witnessed in `coach-legacy-api.spec.ts`, live mode).

**Why:** the store was one object for the whole run. The Publish-modal test was red 3/3
alone and green in the suite only because the AC2 test left a draft for Dana. Turning
the reset on turned hidden chains into FULL-run reds (default: 3 red, 50 skipped behind
them; roster: 1 red plus its serial tail). Ten tests were rewritten to build their own
state through the UI (routine 1, library 1, nutrition 3, library-apply 5).

**How to apply:**
- A new test must set up what it reads from the SEED through the UI. The failure clause
  forbids planting a draft. Publish already saves the editor's plan first
  (`previewPublishAction`), so one edit in the editor is enough to publish a "draft".
- The seed is built ONCE per process and every reset is a `structuredClone` of it. The
  first cut re-recorded the seed at each reset, so a partial reset also redefined
  "pristine" and the check stayed green. Compare against the first seed, never a
  second `freshState()` (its relative instants drift).
- warm-routes' visit to Lina's routine page sets `lastRoutineClient`. So before EV-223
  not even the first test started at the seed.
- The each-file-alone loop (`npm run test:e2e:alone`, ~25 min) was ALL GREEN on main
  (45d237a). The defect was at test level, not file level. The loop only catches state
  the reset cannot see: worker-process globals, or anything added outside
  `FixtureState`. Its CI job belongs to EV-224's workflow.
- Pre-existing race, not fixed here: in `coach-progress-goal.spec.ts`, `setLina`'s
  "Saved." is still on screen when the next save is awaited. With a 1.5 s slow fixture
  write it is red on main (test at :618). See
  [[a-notice-already-on-screen-is-not-a-sync-point]].

See [[coach-portal-fixture-mode]], [[next-module-state-duplicated-across-layers]].
