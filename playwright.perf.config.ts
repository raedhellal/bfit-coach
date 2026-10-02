import { defineConfig, devices } from "@playwright/test";

/**
 * ADR-0033 D33.11's MEASUREMENT config — never a gate (`qa/perf/transitions.measure.ts`
 * asserts no time). It starts no server: build and start one yourself, so the build
 * under test is the one you name, and point this at it.
 *
 *   npx next build
 *   COACH_API_MODE=fixture COACH_FIXTURE_SCENARIO=populated npx next start -p 3371
 *   PERF_BASE_URL=http://localhost:3371 PERF_MODE=fixture PERF_OUT=before.json \
 *     npx playwright test --config playwright.perf.config.ts
 *
 * Live mode (`PERF_MODE=live`) needs a LOCAL b-fit-api on a throwaway database and
 * PERF_CLIENT / PERF_CHALLENGE ids from it. The base URL must be localhost: this file
 * refuses anything else, so it cannot be pointed at production by accident.
 */
const BASE_URL = process.env.PERF_BASE_URL ?? "http://localhost:3371";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE_URL)) {
  throw new Error(`playwright.perf.config.ts measures a local server only, not ${BASE_URL}`);
}

export default defineConfig({
  testDir: "./qa/perf",
  testMatch: /transitions\.measure\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: BASE_URL },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
