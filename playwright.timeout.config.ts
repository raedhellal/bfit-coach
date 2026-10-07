import { defineConfig, devices } from "@playwright/test";

/**
 * BUG-690 — the portal→api timeout, in LIVE mode, against `qa/stall-api.mjs`.
 *
 * The fixture answers in-process and never reaches `apiFetch`, so the timeout can only be
 * proven where the real transport runs: `next dev` in live mode pointed at a stub that can
 * hold a read for a set time or never answer it. Its own config and ports, like the
 * refresh and activation ones, so it never runs in the gate suite and can run beside it.
 *
 *   npm run test:e2e:timeout
 */
const PORT = process.env.COACH_TIMEOUT_PORT || "3305";
const BASE_URL = `http://localhost:${PORT}`;
const STUB_PORT = process.env.STALL_API_PORT || "8096";
const STUB_ORIGIN = `http://localhost:${STUB_PORT}`;

export default defineConfig({
  testDir: "./qa",
  testMatch: /api-timeout\.stub\.spec\.ts/,
  fullyParallel: false,
  workers: 1, // one stub, one hold setting; every test resets it
  expect: { timeout: 15_000 },
  timeout: 90_000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: BASE_URL, trace: "on-first-retry", locale: "en-US" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `node qa/stall-api.mjs`,
      url: `${STUB_ORIGIN}/__health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { STALL_API_PORT: STUB_PORT },
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
