import { defineConfig, devices } from "@playwright/test";

/**
 * The LIVE config: Evoli Pro in `COACH_API_MODE=live`, wired to a real b-fit-api.
 *
 * Separate from playwright.config.ts on purpose. The fixture suite must keep running
 * with no backend at all (that is what makes it a gate), and this suite must keep
 * being the thing that catches a contract drift the fixture cannot see — a fixture
 * written from the same wrong assumption as the client agrees with it perfectly.
 *
 * It does NOT provision the api. Bring one up first, against a THROWAWAY database —
 * never the shared dev Postgres on :5433, because this run creates and revokes a real
 * coach link:
 *
 *   docker run -d --name bfit-pg-ev183 -p 55433:5432 \
 *     -e POSTGRES_USER=bfit -e POSTGRES_PASSWORD=bfit -e POSTGRES_DB=bfit postgres:15
 *   cd b-fit-api && SPRING_PROFILES_ACTIVE=local \
 *     JWT_SECRET=… OTP_PEPPER=… MFA_ENC_KEY="$(openssl rand -base64 32)" \
 *     ./gradlew bootRun --args='--server.port=8099 \
 *       --spring.datasource.url=jdbc:postgresql://localhost:55433/bfit'
 *   npx playwright test --config playwright.live.config.ts
 *
 * MFA_ENC_KEY must be base64 — a plain string fails bean construction with
 * "Last unit does not have enough valid bits" and no mention of the variable's name.
 */
const PORT = process.env.COACH_LIVE_PORT || "3301";
const BASE_URL = `http://localhost:${PORT}`;
const API_ORIGIN = process.env.COACH_LIVE_API_ORIGIN || "http://localhost:8099";

export default defineConfig({
  testDir: "./qa",
  testMatch: /coach-live\.spec\.ts/,
  fullyParallel: false,
  workers: 1, // the two specs share one coach account and one roster
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: BASE_URL, trace: "on-first-retry" },
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
    },
  },
});
