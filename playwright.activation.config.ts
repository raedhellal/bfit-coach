import { defineConfig, devices } from "@playwright/test";

/**
 * EV-278c — the activation flow in LIVE mode, against `qa/activation-stub-api.mjs`.
 *
 * The default suite proves the screens against the fixture, which answers in-process:
 * it never sends a bearer, never sets a `Retry-After` header and never refuses a PENDING
 * token on `/coach-portal/*`. So the parts of EV-278c that live in the live code path —
 * the sign-in handler asking `GET /me/activation` with the token BEFORE any cookie
 * exists, `apiFetch` reading `Retry-After`, the handler swapping the session to the fresh
 * tokens, the old refresh token dying with `token_version` — are proven here, against a
 * stub that models b-fit-api `c69c287` (see its header).
 *
 * Two web servers, like `playwright.refresh.config.ts`: the stub, then `next dev` in
 * live mode pointed at it. Ports are their own so this can run beside the other suites.
 */
const PORT = process.env.COACH_ACTIVATION_PORT || "3304";
const BASE_URL = `http://localhost:${PORT}`;
const STUB_PORT = process.env.ACTIVATION_STUB_PORT || "8097";
const STUB_ORIGIN = `http://localhost:${STUB_PORT}`;

export default defineConfig({
  testDir: "./qa",
  testMatch: /coach-activation\.stub\.spec\.ts/,
  fullyParallel: false,
  workers: 1, // one stub, one store; every test resets it
  expect: { timeout: 10_000 },
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  /**
   * An ENGLISH browser, stated. Playwright's Chromium sends NO Accept-Language unless a
   * locale is set (witnessed 2026-10-02), and since the redesign's locale rule a request
   * that names no language is French. Every spec written for the English portal therefore
   * says so here; a spec about French sets `test.use({ locale: "fr-FR" })` as before.
   */
  use: { baseURL: BASE_URL, trace: "on-first-retry", locale: "en-US" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `node qa/activation-stub-api.mjs`,
      url: `${STUB_ORIGIN}/__health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { ACTIVATION_STUB_PORT: STUB_PORT },
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
