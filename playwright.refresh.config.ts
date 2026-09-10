import { defineConfig, devices } from "@playwright/test";

/**
 * The REFRESH config: one spec, `qa/refresh-single-flight.spec.ts`, run in
 * `COACH_API_MODE=live` against `qa/stub-api.mjs` instead of a real b-fit-api.
 *
 * Separate from both other configs on purpose. The fixture suite never calls the api,
 * so it cannot count api calls; the live suite talks to a real api, which answers "how
 * many times did you refresh?" only by silently signing the coach out. The stub is the
 * only place that number is observable, and keeping it in its own config keeps it out
 * of the gate suite, where a stub api has no business.
 *
 *   npx playwright test --config playwright.refresh.config.ts
 */
const PORT = process.env.COACH_REFRESH_PORT || "3302";
const BASE_URL = `http://localhost:${PORT}`;
const STUB_PORT = process.env.STUB_API_PORT || "8098";
const STUB_ORIGIN = `http://localhost:${STUB_PORT}`;

export default defineConfig({
  testDir: "./qa",
  testMatch: /refresh-single-flight\.spec\.ts/,
  fullyParallel: false,
  workers: 1, // the stub holds one session's worth of state
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: BASE_URL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `node qa/stub-api.mjs`,
      url: `${STUB_ORIGIN}/__health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { STUB_API_PORT: STUB_PORT },
    },
    {
      command: `npx next dev -p ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        COACH_API_MODE: "live",
        API_BASE_URL: STUB_ORIGIN,
        INVITE_BASE_URL: BASE_URL,
      },
    },
  ],
});
