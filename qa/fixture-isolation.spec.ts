import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * EV-223 AC3 — a test that WRITES a draft, then a test that READS drafts, and the second
 * does not see the first's.
 *
 * `serial` on purpose: this file is the one place where the order is the experiment.
 * The first test must really write (it reloads and reads its own draft back, so a
 * silently failed save cannot make the second test vacuous); the second opens the same
 * trainee and must find the seed's published plan with no draft on it. Without the
 * per-test reset in `qa/fixture-test.ts` the second test is red.
 *
 * The seed check itself (`{ pristine: true }` before every test) is asserted by the auto
 * fixture, so it runs here too.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const SEED_PLAN_NAME = "Intermediate Muscle Building Routine";
const WRITTEN_PLAN_NAME = "EV-223 isolation probe";

test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("coach@evoli.fit");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

test("writer: a saved draft survives a reload in the same test", async ({ page }) => {
  await signIn(page);
  await page.goto(`/clients/${LINA}/routine`);
  await expect(page.getByText("Published plan")).toBeVisible();

  await page.getByLabel("Plan name").fill(WRITTEN_PLAN_NAME);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/^Draft saved /)).toBeVisible();

  await page.reload();
  await expect(page.getByText("Draft — not yet published")).toBeVisible();
  await expect(page.getByLabel("Plan name")).toHaveValue(WRITTEN_PLAN_NAME);
});

test("reader: the next test does not see that draft", async ({ page }) => {
  await signIn(page);
  await page.goto(`/clients/${LINA}/routine`);
  await expect(page.getByLabel("Plan name")).toHaveValue(SEED_PLAN_NAME);
  await expect(page.getByText("Published plan")).toBeVisible();
  await expect(page.getByText("Draft — not yet published")).toHaveCount(0);
});

/**
 * A spec file that imports `test` from `@playwright/test` instead of `./fixture-test`
 * silently opts out of the reset, and nothing else would notice until it shared state
 * with a neighbour. The exempt files are listed with why; any other spec file must use
 * the resetting `test`.
 */
const NOT_ON_THE_FIXTURE_SERVER: Record<string, string> = {
  "coach-live.spec.ts": "live config: a real b-fit-api and Postgres, no fixture store",
  "coach-affordance.live.spec.ts": "live config, same",
  "coach-legacy-api.spec.ts": "legacy config: COACH_API_MODE=live against qa/legacy-api.mjs",
  "refresh-single-flight.spec.ts": "refresh config: COACH_API_MODE=live against qa/stub-api.mjs",
  "contract-drift.spec.ts": "reads two files from disk; never calls the dev server",
  "api-merge-condition.spec.ts": "reads git and a file from disk; never calls the dev server",
  "ci-workflow.spec.ts": "reads .github/workflows/ci.yml from disk; never calls the dev server",
};

test("every spec file on the fixture server uses the resetting test", () => {
  const qa = __dirname;
  // RECURSIVE, like Playwright's own `testDir`: a spec in a subfolder is still run.
  const plain = readdirSync(qa, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".spec.ts"))
    .filter((f) => !/import \{ test \} from "\.\/fixture-test";/.test(readFileSync(join(qa, f), "utf8")))
    .sort();
  expect(
    plain,
    "a spec file outside the exempt list does not import { test } from ./fixture-test, so it does not reset the fixture store"
  ).toEqual(Object.keys(NOT_ON_THE_FIXTURE_SERVER).sort());
});
