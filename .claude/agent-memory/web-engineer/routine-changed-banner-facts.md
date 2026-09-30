---
name: routine-changed-banner-facts
description: EV-283b "the trainee changed this plan" — the banner keys on lastChangedBy not the flag, one fixture record feeds both reads, en-GB ICU prints "Sept", and how to vendor when local api main is behind
metadata:
  type: project
---

EV-283b (`feat/ev283b-routine-changed-banner`, built against b-fit-api main `6264142`,
2026-09-28) put a banner on `/clients/[id]/routine` and a "Plan changed" marker on the
roster. Facts that are decisions, not details:

- **The banner keys on `lastChangedBy === "TRAINEE"`, NOT on `changedSinceYourPublish`.**
  The story says so, and the difference is reachable: a trainee this coach never
  published to who edits their own plan reads TRAINEE with the flag false (fixture:
  Omar). The flag is the ROSTER marker's rule; the routine page types it and never
  renders from it. Collapsing the two hides the banner exactly when the coach is about
  to publish over someone's own plan for the first time.
- **Both reads fail closed** (`src/lib/routineChange.ts`, pinned by
  `qa/routine-change-predicates.spec.ts`): literal `"TRAINEE"` plus a parseable instant,
  literal `true`. The fields are optional in `coachApi.ts` because an older api omits
  them; the legacy config (`npm run test:e2e:legacy`) stayed 7/7 with no change.
- **Fixture: ONE `planAuthors` record feeds `getRoutine` and the roster row**, and the
  roster row derives its null from its OWN `scopes` (`withPlanFlag`), so the marker and
  the page cannot disagree — the api's own claim, held by construction.
  `publishRoutine` writes COACH/now/false, which is what makes "publishing clears it"
  testable end to end on both screens.
- **en-GB ICU prints September as "Sept"**, so "24 Sep 2026" in a literal is red.
  The specs derive the expected date with `Intl` directly (not the portal's
  `formatInstant`, which would agree by construction).
- **Session edits are not recorded until EV-283c** (api). The banner reads the same
  fields, so EV-283c needs no portal change and no copy change.
- **Vendoring when local `b-fit-api` main is behind `origin/main`:** make a detached
  worktree of `origin/main` and run `B_FIT_API_DIR=<it> npm run spec:sync`. The sha file
  then says `ref: (detached)`; set it to `ref: main` by hand (the merge-condition spec
  reads `on-api-main`, not `ref`).
- **A roster-state spec is a new file in TWO configs**: add it to
  `playwright.roster.config.ts` `testMatch` AND to `playwright.config.ts` `testIgnore`,
  or the default (empty-roster) run executes it and fails.
- **The date is labelled " (UTC)"** — Raed's ruling 2026-09-28 after staff review: keep
  UTC, say so. Any future banner/date copy on this portal should follow the same rule
  rather than guess the coach's zone.
- **No Playwright test can witness a `revalidatePath` on a publish here.** The routine
  editor calls `router.refresh()` after every write, and in Next 14.2 that purges the
  whole client router cache, so the roster clears on a click-through even with all
  three `revalidatePath`s removed (checked 2026-09-28, dev server). The roster
  clearing spec pins the coach-visible behaviour and says so in a comment; do not
  claim a revalidate line is "tested" by it.

See [[coach-portal-reads-scopes-never-a-status]], [[every-fixture-test-starts-from-the-seed]],
[[stories-carry-verbatim-copy]].
