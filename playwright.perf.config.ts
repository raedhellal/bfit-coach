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
 * PERF_CLIENT / PERF_CHALLENGE ids from it.
 *
 * A remote base URL (ADR-0033 D33.0's Vercel preview) is refused unless PERF_REMOTE_OK
 * repeats it exactly: a deliberate second typing, so this cannot be pointed at
 * production by accident. Use a TEST coach and trainee only (PERF_EMAIL/PERF_PASSWORD,
 * PERF_CLIENT, PERF_CHALLENGE). On a remote run the Save draft step, the one write, is
 * skipped unless PERF_SAVE=1.
 */
const BASE_URL = process.env.PERF_BASE_URL ?? "http://localhost:3371";
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE_URL);
if (!LOCAL && process.env.PERF_REMOTE_OK !== BASE_URL) {
  throw new Error(`playwright.perf.config.ts: ${BASE_URL} is not local; set PERF_REMOTE_OK to the same URL to confirm`);
}

export default defineConfig({
  testDir: "./qa/perf",
  testMatch: /transitions\.measure\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  retries: 0,
  reporter: [["list"]],
  // An English browser, stated: the harness's Save draft step reads English labels, and
  // since the Pro redesign's locale rule a request that names no language is French.
  // A hang must name its step: Playwright's goto/waitFor have no timeout by default.
  use: { baseURL: BASE_URL, locale: "en-US", actionTimeout: 30_000, navigationTimeout: 30_000 },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
