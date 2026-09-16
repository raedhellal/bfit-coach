import { defineConfig, devices } from "@playwright/test";

/**
 * The LEGACY config: the portal in `COACH_API_MODE=live` against `qa/legacy-api.mjs`,
 * which serves b-fit-api **main (cc9a3c8)** — the api the Vercel deployment actually
 * talks to, and one that predates ADR-0015 B1 and EV-184a.
 *
 * It is its own config for the same reason the refresh one is: the fixture suite can
 * never see this, because the fixture is typed by `coachApi.ts` and therefore always
 * sends `scopes`. The only way to drive an overview with the field ABSENT is an api
 * that does not have it, and that api is the one in production.
 *
 *   npm run test:e2e:legacy
 */
const PORT = process.env.COACH_LEGACY_PORT || "3303";
const BASE_URL = `http://localhost:${PORT}`;
const API_PORT = process.env.LEGACY_API_PORT || "8099";
const API_ORIGIN = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: "./qa",
  testMatch: /coach-legacy-api\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: BASE_URL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `node qa/legacy-api.mjs`,
      url: `${API_ORIGIN}/__health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { LEGACY_API_PORT: API_PORT },
    },
    {
      command: `npx next dev -p ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        COACH_API_MODE: "live",
        API_BASE_URL: API_ORIGIN,
        INVITE_BASE_URL: BASE_URL,
      },
    },
  ],
});
