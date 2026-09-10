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
  fullyParallel: false,
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
