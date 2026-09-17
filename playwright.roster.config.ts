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
 */
const PORT = process.env.COACH_ROSTER_PORT || "3301";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./qa",
  testMatch: /coach-roster-scopes\.spec\.ts/,
  fullyParallel: false,
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
      COACH_FIXTURE_SCENARIO: "populated",
      INVITE_BASE_URL: BASE_URL,
    },
  },
});
