---
name: project_ev342-perf-kjm-gate
description: 2026-10-07 EV-342 perf train d4f924a (k/j/m) — k FAIL (removing getMe killed the BUG-689 render-error fixture switch, 8 red), j PASS partial, m PASS + BUG-703; M.5/J.3 rig and the live-mode refresh stub
metadata:
  type: project
---

**2026-10-07, b-fit-coach `train/ev342-perf-kjm` @ d4f924a** = 711f4c2 + EV-342k 01e67b8 + EV-342j 17894de (with BUG-700) + EV-342m
fb57b42. The session log is the scratchpad `perf-kjm-qa.md`.

Verdicts:
- **EV-342k: FAIL.** Its ACs hold, but the default suite has 8 red tests.
  - Cause: the BUG-689 fixture affordance `evoli_fixture_render_error` poisons `getMe` (`coachApi.fixture.ts` `renderErrorSwitch`), and
    k removed `getMe` from every page but the roster.
  - Proof: 711f4c2 passes 16/16; 01e67b8 fails 8.
- **EV-342j: PASS as a partial**, "J.3 not met (EV-345)". **BUG-700: PASS.**
- **EV-342m: PASS**, plus a new P3 proposed as **BUG-703**: refuse the language switch's one-time reload ("stay" on beforeunload) and
  every later in-app navigation of that tab hangs.
- d4f924a merges cleanly onto main 9407651, but must not merge while the suite is red. See [[project_ev342-sprint1-gate]].

**Why:** a coach merge is a production deploy ([[coach-portal-merge-is-release]]). Staff's rebase checks read git objects only and ran
no Playwright, so a cross-unit test coupling surfaced only at the integrated full run.

**How to apply:**
- **A "remove a read" perf change can silently disarm a fixture switch hooked on that read.** Grep `coachApi.fixture.ts` for switches
  inside the removed read before gating. Attribute a red by running the same specs on the base and on the unit's tip alone.
- **Expired access + refresh cannot be tested in fixture mode.** The middleware calls the real `/auth/refresh`. Run `next start` with
  `COACH_API_MODE=live API_BASE_URL=<stub>` against a scratch stub (login, refresh, a counting `/coach-portal/me`, empty lists, 401 on an
  expired bearer). Copy it from the session's `qa1e/k-stub.mjs`.
  - The rotated token DOES reach the render: Next 14.2.35 middleware cookies are visible to `cookies()`.
  - One load posts `/auth/refresh` up to 5× in Chromium. This is pre-existing and harmless only because b-fit-api refresh tokens are
    stateless.
- **M.5-type hydration cost:** run c2768c2, 711f4c2 and the tip as `next start` at once, interleaved rep-major. Use CDP latency 100 +
  cache disabled, and stamp `[data-nav-progress-ready]` with an init-script MutationObserver. Medians: c2768c2→tip worst +110 ms on
  `/`; m itself +9..22 ms.
- **J.3 heights move with unrelated train content:** sprint 1/1b added +60 px to Lina's overview. The j spec's EN guard (≤ 2,820) is at
  2,818 on the train.
- **A route-intercepted dictionary 404 is recognisable by content:** EN "Add a client", FR "Ouvrir le plan".
- **A probe without per-action timeouts hangs a test to the 90 s limit on a missing locator.** Use `{ timeout }` + catch, and `rec()`
  after each step.
