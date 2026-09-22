import { defineConfig, devices } from "@playwright/test";

/**
 * The POPULATED roster, which the main config cannot serve.
 *
 * `COACH_FIXTURE_SCENARIO` is read once per dev-server process, and the main suite
 * runs `empty` (that is what EV-183 AC1's empty state and the invite happy path need).
 * ADR-0015 S1 put three scope-filtered nulls on the roster row — plan, last workout,
 * streak — and those only render with rows present, so they get their own server.
 *
 * COACH_ROSTER_PORT keeps it off :3300 and off the main suite's port when both run.
 *
 * ⚠ FILE ORDER: Playwright runs files in name order with `workers: 1`, and
 * `coach-library-apply.spec.ts` MUTATES the fixture's draft store for two trainees. It
 * sorts before `coach-roster-scopes.spec.ts`, which is read-only — that is the safe
 * order and it is an accident of the names, so a rename needs re-checking.
 */
const PORT = process.env.COACH_ROSTER_PORT || "3301";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./qa",
  /**
   * EV-188b's apply half joins this config for the same reason the roster scopes did:
   * AC3's trainee picker is built from the ROSTER, and the main suite's `empty`
   * scenario serves no rows — so "Use on a trainee" there can only reach its
   * no-trainees branch. The populated scenario is the only place the apply, its 409
   * retry and AC5's marks are reachable at all.
   */
  testMatch: /(coach-roster-scopes|coach-roster-triage|coach-library-apply)\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  // The same cold-compile budget as the main config, and for the same reason —
  // see playwright.config.ts. This config serves its own dev server, so it pays
  // the first-compile cost for every route it touches all over again.
  expect: { timeout: 10_000 },
  timeout: 60_000,
  // Compile every route once before anything is timed — see qa/warm-routes.ts.
  globalSetup: "./qa/warm-routes.ts",
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
      COACH_FIXTURE_SCENARIO: "populated",
      INVITE_BASE_URL: BASE_URL,
    },
  },
});
