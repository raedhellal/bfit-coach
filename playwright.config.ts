import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke specs for Evoli Pro. They run against the Next dev server on :3300 in
 * **fixture mode** (`COACH_API_MODE=fixture`), so no b-fit-api and no Postgres are
 * needed — which is the point of the fixture: the screens are testable before
 * ADR-0012's D4 endpoints exist.
 *
 * `COACH_FIXTURE_SCENARIO=empty` serves the zero-trainee roster, which is what AC1's
 * empty state and capacity meter are asserted against.
 *
 * COACH_PORT overrides :3300 so a second checkout (or a running dev server) cannot be
 * silently tested instead of the code under test — `reuseExistingServer` cannot tell
 * the two apart.
 */
const PORT = process.env.COACH_PORT || "3300";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./qa",
  // coach-live.spec.ts and coach-affordance.live.spec.ts need a real b-fit-api and a
  // throwaway Postgres (playwright.live.config.ts); refresh-single-flight.spec.ts needs the counting stub
  // api (playwright.refresh.config.ts); coach-legacy-api.spec.ts needs the pre-ADR-0015
  // api stub (playwright.legacy.config.ts); coach-roster-scopes.spec.ts needs the
  // populated fixture scenario (playwright.roster.config.ts); coach-library-apply.spec.ts
  // needs it too — EV-188 AC3's trainee picker is built from the roster, and this
  // suite's `empty` scenario serves no rows, so the apply half can only reach its
  // no-trainees branch here (which `coach-library.spec.ts` asserts). This suite must
  // stay runnable with no backend at all — that is what makes it the gate.
  testIgnore: /(coach-live|coach-affordance\.live|refresh-single-flight|coach-roster-scopes|coach-roster-triage|coach-legacy-api|coach-library-apply)\.spec\.ts/,
  fullyParallel: false,
  /**
   * ONE worker, not one per file.
   *
   * `COACH_API_MODE=fixture` is a single in-memory store inside one dev-server
   * process: drafts, published plans, targets and meal weeks are module state that
   * the routine and nutrition specs deliberately MUTATE (a draft has to survive a
   * reload for EV-184 AC2, a publish has to replace the plan for AC3). Two workers
   * would interleave writes against that one store and the failures would be
   * ordering artefacts rather than product defects. `fullyParallel: false` only
   * serialises within a file; this serialises across them.
   *
   * ENFORCED, not just configured (BUG-249): since EV-223 every test resets that whole
   * store, so a second worker would wipe the first's state mid-test. `--workers=N` on the
   * command line overrides this line, so `qa/fixture-single-worker.ts` (first globalSetup)
   * refuses any run whose resolved worker count is above 1, naming the cause.
   */
  workers: 1,
  /**
   * ⏱ The assertion budget, raised for a COLD `.next` — not for a slow product.
   *
   * `next dev` compiles a route the first time it is NAVIGATED to, and this suite runs
   * against `next dev` by design (that is what makes it the gate: no build step, no
   * backend). EV-188b added three routes and 25 tests, which pushed the first
   * assertion on several pages past Playwright's 5 s `expect` default on a cold
   * checkout: `senior-qa` measured branch-cold RED 2/2 and main-cold GREEN 2/2, with a
   * DIFFERENT pre-existing file failing each time and no EV-188b test ever failing —
   * so it is compile latency, not a defect, and a fresh clone was getting a red gate.
   *
   * 10 s is sized against the thing that actually varies (one route's first compile),
   * and the per-test budget is raised with it so a test holding several such
   * assertions cannot pass each one and then trip the test timeout instead. Both are
   * still far below anything a product regression would need: a page that renders in
   * 9 s is a bug this suite would now MISS, which is the cost, and it is bounded — the
   * live suite (`playwright.live.config.ts`) is where real latency is judged.
   */
  expect: { timeout: 10_000 },
  timeout: 60_000,
  // Compile every route once before anything is timed — see qa/warm-routes.ts.
  // BUG-249: refuse >1 worker FIRST (qa/fixture-single-worker.ts), then compile every route.
  globalSetup: ["./qa/fixture-single-worker.ts", "./qa/warm-routes.ts"],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: BASE_URL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      COACH_API_MODE: "fixture",
      COACH_FIXTURE_SCENARIO: "empty",
      INVITE_BASE_URL: BASE_URL,
    },
  },
});
