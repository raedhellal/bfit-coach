import { defineConfig, devices } from "@playwright/test";

/**
 * BUG-745, ADR-0033 D33.14 — the session-epoch witnesses (`qa/session-epoch.spec.ts`) and the
 * cookie rules (`qa/session-epoch-cookie.spec.ts`), on the POPULATED fixture (Lina M.'s row),
 * in Chromium AND WebKit, on either server:
 *
 *   COACH_SESSION_SERVER=dev   npm run test:e2e:session
 *   COACH_SESSION_SERVER=start npm run test:e2e:session
 *
 * ⚠ NO CI RUNS THIS. b-fit-coach has no `.github/workflows`, and `playwright.config.ts` ignores
 * both session specs, so the default gate does not run them either. A QA gate on anything that
 * touches the session, the guard, `useUnsavedChanges`, middleware's `toLogin` or the root layout
 * must run BOTH lines above (staff S3 on BUG-745).
 *
 * `start` builds the checkout first (`COACH_SESSION_PREBUILT=1` skips that when you have just run
 * `npx next build` on this tree), serves it with `next start`, and puts `qa/tls-front.mjs` in
 * front: a production build's cookies are `Secure` and the epoch is `__Host-evoli_pro_epoch`,
 * which WebKit will not store from plain http://localhost. Both engines use the https front, one
 * code path. Never beside a `next dev` of the same checkout: both write `.next`.
 *
 * `qa/session-epoch-stub-api.mjs` answers the one api call fixture mode still makes,
 * `POST /auth/refresh` (a rotation for U4/W10, a refusal for W8).
 *
 * `COACH_SESSION_EXTERNAL=1` uses servers you started yourself on the same ports (the mutant
 * runs: one build per mutant, no Playwright boot each time).
 *
 * Ports 3520–3532, inside the range this work was given.
 */
const SERVER = process.env.COACH_SESSION_SERVER === "start" ? "start" : "dev";
const DEV_PORT = 3520;
const FRONT_PORT = 3530;
const START_PORT = 3531;
const STUB_PORT = 3532;
const STUB_ORIGIN = `http://127.0.0.1:${STUB_PORT}`;
const BASE_URL = SERVER === "start" ? `https://localhost:${FRONT_PORT}` : `http://localhost:${DEV_PORT}`;

const appEnv = {
  COACH_API_MODE: "fixture",
  COACH_FIXTURE_SCENARIO: "populated",
  INVITE_BASE_URL: BASE_URL,
  API_BASE_URL: STUB_ORIGIN,
};

const stub = {
  command: "node qa/session-epoch-stub-api.mjs",
  url: `${STUB_ORIGIN}/__health`,
  reuseExistingServer: false,
  timeout: 30_000,
  env: { STUB_API_PORT: String(STUB_PORT) },
};

const START = `npx next start -p ${START_PORT}`;
const servers =
  SERVER === "start"
    ? [
        stub,
        {
          command: process.env.COACH_SESSION_PREBUILT === "1" ? START : `npx next build && ${START}`,
          url: `http://localhost:${START_PORT}/login`,
          reuseExistingServer: false,
          timeout: 600_000,
          env: appEnv,
        },
        {
          command: "node qa/tls-front.mjs",
          url: `${BASE_URL}/login`,
          ignoreHTTPSErrors: true,
          reuseExistingServer: false,
          timeout: 30_000,
          env: { TLS_FRONT_PORT: String(FRONT_PORT), TLS_TARGET_PORT: String(START_PORT) },
        },
      ]
    : [
        stub,
        {
          command: `npx next dev -p ${DEV_PORT}`,
          url: BASE_URL,
          reuseExistingServer: false,
          timeout: 120_000,
          env: appEnv,
        },
      ];

export default defineConfig({
  testDir: "./qa",
  testMatch: /session-epoch(-cookie)?\.spec\.ts/,
  fullyParallel: false,
  // One worker per fixture server, enforced by the first globalSetup (BUG-249).
  workers: 1,
  expect: { timeout: 10_000 },
  timeout: 120_000,
  // Dev compiles each route on first visit (see playwright.config.ts); a build has nothing left to compile.
  globalSetup: SERVER === "dev" ? ["./qa/fixture-single-worker.ts", "./qa/warm-routes.ts"] : ["./qa/fixture-single-worker.ts"],
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    locale: "en-US",
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
  },
  metadata: { server: SERVER, stubOrigin: STUB_ORIGIN },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: process.env.COACH_SESSION_EXTERNAL === "1" ? undefined : servers,
});
