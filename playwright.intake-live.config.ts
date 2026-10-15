import { defineConfig, devices } from "@playwright/test";

/**
 * EV-341b B17 — THE MERGE GATE for the intake's autosave: the portal in `COACH_API_MODE=live`
 * against a real b-fit-api whose access token lives ONE MINUTE (`JWT_ACCESS_TTL=1m`).
 *
 * Its own config, not `playwright.live.config.ts`: the other live specs do not expect a token
 * that expires under them, and B17 needs one. The spec asserts the TTL it is given (≤ 60 s) and
 * fails, rather than passing vacuously, against an api on the 15-minute default.
 *
 * It does NOT provision the api. Bring one up first, against a THROWAWAY database (the run
 * creates a link, grants the interview consent through the trainee, writes an intake and
 * revokes the link at the end, so it is re-runnable):
 *
 *   docker run -d --name bfit-pg-ev341b -p 55433:5432 \
 *     -e POSTGRES_USER=bfit -e POSTGRES_PASSWORD=bfit -e POSTGRES_DB=bfit postgres:15
 *   cd b-fit-api && SPRING_PROFILES_ACTIVE=local JWT_ACCESS_TTL=1m EXERCISE_PROVIDER=seed \
 *     JWT_SECRET="$(openssl rand -base64 48)" OTP_PEPPER="$(openssl rand -base64 32)" \
 *     MFA_ENC_KEY="$(openssl rand -base64 32)" \
 *     ./gradlew bootRun --args='--server.port=8099 --spring.datasource.url=jdbc:postgresql://localhost:55433/bfit'
 *   npm run test:e2e:intake-live
 *
 * The `local` profile seeds coach@evoli.fit (COACH) and user@evoli.fit (the trainee); the coach
 * must hold no ACTIVE link when the run starts. The consent wording's hash is read from the api
 * checkout (`B_FIT_API_DIR`, default `../b-fit-api`): the grant proves the text it consents to.
 */
const PORT = process.env.COACH_LIVE_PORT || "3302";
const BASE_URL = `http://localhost:${PORT}`;
const API_ORIGIN = process.env.COACH_LIVE_API_ORIGIN || "http://localhost:8099";

export default defineConfig({
  testDir: "./qa",
  testMatch: /intake-token-expiry\.live\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: BASE_URL, trace: "retain-on-failure", locale: "en-US" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      COACH_API_MODE: "live",
      API_BASE_URL: API_ORIGIN,
      INVITE_BASE_URL: BASE_URL,
      // EV-341b merges dark behind the release hold (story R6): the gate runs with it ON.
      COACH_INTAKE_REQUEST: "on",
    },
  },
});
