---
name: coach-portal-fixture-mode
description: COACH_API_MODE=fixture is how b-fit-coach screens get built and tested before b-fit-api has the endpoints — the scenario selector is the trainee id
metadata:
  type: project
---

`b-fit-coach` runs its whole api surface through one module, `src/lib/coachApi.ts`, with
`COACH_API_MODE=fixture` swapping in `coachApi.fixture.ts`. `live` is the default; the
switch is server-side only.

**Why it exists:** the coach-portal endpoints land on `b-fit-api` after the screens are
built (EV-184b/EV-185b were built against an ADR-0015 contract that was still being
designed). The fixture is how a screen is demoable and testable without inventing a
backend — and the rule that keeps it honest is that its shapes are the *exported contract
types*, so the day the api lands, drift is a compile error rather than a nicer-looking
fixture.

**How to apply:**
- The **scenario selector is the trainee id**, not an env var — the roster lists one
  trainee but the per-trainee reads answer for several, which is how b-fit-api behaves
  anyway. That lets one dev server serve populated / empty / no-scope / repairs-on-publish
  / catalog-down states without a restart, and it is what the Playwright specs rely on.
  `COACH_FIXTURE_SCENARIO=empty` only controls the roster.
- Playwright runs in fixture mode with `workers: 1`. The fixture is one mutable in-memory
  store and the specs deliberately write to it (a draft must survive a reload), so
  parallel workers produce ordering artefacts, not findings. SUPERSEDED in part by
  EV-223: the store is now reset to its seed before every test, so no test may rely on
  an earlier one's writes. See [[every-fixture-test-starts-from-the-seed]].
- The fixture's mutable state must live on `globalThis` — see
  [[next-module-state-duplicated-across-layers]].
- Login works in fixture mode: `/api/auth/login` mints a local unsigned token when the
  mode is `fixture`, so specs sign in normally.
