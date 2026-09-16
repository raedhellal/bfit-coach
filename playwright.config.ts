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
  // coach-live.spec.ts needs a real b-fit-api and a throwaway Postgres
  // (playwright.live.config.ts); refresh-single-flight.spec.ts needs the counting stub
  // api (playwright.refresh.config.ts). This suite must stay runnable with no backend
  // at all — that is what makes it the gate.
  testIgnore: /(coach-live|refresh-single-flight)\.spec\.ts/,
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
   */
  workers: 1,
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
