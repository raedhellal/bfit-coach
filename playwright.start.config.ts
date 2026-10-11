import { defineConfig, devices } from "@playwright/test";

/**
 * EV-356d — the specs that need a PRODUCTION build (`next start`), on the populated roster.
 *
 * `router.prefetch` and every `<Link>` prefetch are no-ops under `next dev`
 * (`next/dist/client/components/app-router.js`), so the roster rows' intent prefetch
 * (`src/components/roster/IntentLink.tsx`) cannot be observed by the gate's dev servers.
 * This config builds the checkout and serves it with `next start` in fixture mode.
 *
 *   npx playwright test --config playwright.start.config.ts --workers=1
 *
 * The build is part of the server command ON PURPOSE: a `next start` over a `.next` left by
 * an earlier checkout would test that checkout's code and report it green. Set
 * `COACH_START_PREBUILT=1` only when you have just run `npx next build` on this tree.
 * Never run it beside a `next dev` of the same checkout: both write `.next`.
 *
 * COACH_START_PORT keeps it off :3300/:3301 and off the other configs' ports.
 *
 *   · `intent-prefetch.spec.ts` — EV-356d D.1-D.6; it FAILS (not skips) on a dev server;
 *   · `client-load-reload.spec.ts` — D.6 / P5 (ADR-0033 D33.13 point 8), Chromium and WebKit;
 *   · `no-auto-prefetch.spec.ts` — P4, invariant N (D33.13 point 2), Chromium and WebKit;
 *   · `page-read-budget.spec.ts` — its D.4 rows ("a roster load prefetches no client page",
 *     "hover = one render, re-hover = zero"), which the roster config can only half-run.
 *   · `library-roster-unblocked.spec.ts` — EV-356g G.1–G.4: the libraries paint before a held
 *     roster read. Its timings are a production build's (a dev server compiles on first hit).
 */
const PORT = process.env.COACH_START_PORT || "3302";
const BASE_URL = `http://localhost:${PORT}`;
const START = `npx next start -p ${PORT}`;

export default defineConfig({
  testDir: "./qa",
  testMatch: /(intent-prefetch|page-read-budget|client-load-reload|no-auto-prefetch|library-roster-unblocked)\.spec\.ts/,
  fullyParallel: false,
  // One worker per fixture server, enforced by the first globalSetup (BUG-249).
  workers: 1,
  expect: { timeout: 10_000 },
  timeout: 60_000,
  // No warm-up: a production build has nothing left to compile.
  globalSetup: ["./qa/fixture-single-worker.ts"],
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: BASE_URL, trace: "on-first-retry", locale: "en-US" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    /**
     * WebKit for the intent-prefetch tests that use the runner's own page (D.1, D.2, D.4).
     * The other WebKit cells (D.3, D.5, and every test in client-load-reload and
     * no-auto-prefetch) launch WebKit inside their spec and run under the chromium project.
     */
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testMatch: /intent-prefetch\.spec\.ts/,
      grep: /D\.1 — pointer|D\.2: after|D\.4: hovering/,
    },
  ],
  webServer: {
    command: process.env.COACH_START_PREBUILT === "1" ? START : `npx next build && ${START}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 600_000,
    env: {
      COACH_API_MODE: "fixture",
      COACH_FIXTURE_SCENARIO: "populated",
      INVITE_BASE_URL: BASE_URL,
    },
  },
});
