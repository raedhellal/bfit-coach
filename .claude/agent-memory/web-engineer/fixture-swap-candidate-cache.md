---
name: fixture-swap-candidate-cache
description: EV-288 — the fixture now models the api's swap-candidate cache; an apply with no prior GET …/swap is a 409 SWAP_OPTIONS_STALE, so any new swap test must read options first
metadata:
  type: project
---

Since EV-288 (`feat/ev288-swap-options-stale-portal`), `coachApi.fixture.ts` keeps the
api's `planned_meal.swap_candidates` as BUG-271's fix (b-fit-api `0b23b73`) does:
`getSwapOptions` returns the cached list or builds + caches one; `applySwap` applies an
index FROM THE CACHE and answers 409 `SWAP_OPTIONS_STALE` when nothing is cached (checked
before eaten/locked, the api's order); a successful swap or placement clears that meal,
regenerate/apply-week clear the trainee's.

**Why:** the stale 409 is then produced by the real sequence (two tabs of one coach on one
meal), not a cookie switch, which is also story AC3's shape.

**How to apply:**
- A test (or demo) that applies a swap without first opening the sheet's options now gets
  the stale line, not a swap. Both sheets always read first, so no existing spec changed.
- The cache lives OUTSIDE `FixtureState` (a read fills it; the seed check must stay
  green) and is emptied by `resetFixtureState` — anything else added outside must be too.
- The seed week's meal names are NOT pool names: after a swap the old meal is not
  "offered again". Do not assert it (I did; it was wrong).
- Matched by code in `classify`; dormant against an api that still generates on a miss.

See [[swap-sheet-portal-facts]], [[every-fixture-test-starts-from-the-seed]].
