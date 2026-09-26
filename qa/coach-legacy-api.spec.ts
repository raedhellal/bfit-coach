import { expect, test, type Page } from "@playwright/test";

/**
 * The portal against b-fit-api **main (cc9a3c8)** — the api the Vercel deployment is
 * actually talking to, served by `qa/legacy-api.mjs`. Run it with
 * `npm run test:e2e:legacy`.
 *
 * This is a regression suite, not a feature suite. It pins the one property this
 * branch cannot get from the fixture: that a payload written by an api which predates
 * ADR-0015 B1 — no `scopes` field at all — renders a degraded screen and not a 500.
 * Before the `Array.isArray` guard in `hasScope`, `undefined.includes(...)` threw
 * during the server render of `/clients/[id]`, so opening ANY trainee from the roster
 * was an error page for the coach. The fixture cannot see it: the fixture is typed by
 * `coachApi.ts`, so it always sends `scopes`.
 *
 * The rule being asserted is FAIL CLOSED. An api that says nothing about consent has
 * not said "shared", so every block reads "Not shared" — even though this legacy api
 * is in fact returning a streak, a last session and a weight series. Under-claiming
 * shows the coach less than they may see; over-claiming would show a trainee's data on
 * the strength of a guess.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

/** No `scopes` in the overview — b-fit-api main. */
const LEGACY_CLIENT = "1a2b3c4d-0000-4000-8000-0000000000a1";
/** `scopes` present, tabs still 404 — the half-migrated deploy. */
const SCOPED_CLIENT = "1a2b3c4d-0000-4000-8000-0000000000a2";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

test("opening a trainee whose overview has no `scopes` renders, it does not 500", async ({
  page,
}) => {
  await signIn(page);

  // Navigate the way a coach does — from the roster row — so the assertion covers the
  // link the live regression was reached through, not just a typed URL.
  const response = await page.goto(`/clients/${LEGACY_CLIENT}`);
  expect(response?.status()).toBe(200);

  // Next's error boundary, and the dev overlay, both leave these behind.
  await expect(page.locator("body")).not.toContainText("Application error");
  await expect(page.locator("body")).not.toContainText("is not a function");
  await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");

  // The screen is the real overview, not the load-error card: the api DID answer, and
  // "we could not load this trainee" would be a different and false statement.
  await expect(page.getByRole("heading", { name: "Lina M." })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("This trainee could not be loaded.");
});

test("every scope-gated block fails closed to “Not shared”", async ({ page }) => {
  await signIn(page);
  await page.goto(`/clients/${LEGACY_CLIENT}`);

  // Blocks 4 and 5 are whole-card sentences, so they are unambiguous to assert.
  await expect(
    page.getByText("This trainee has not shared their weigh-ins with you.")
  ).toBeVisible();
  await expect(
    page.getByText(
      "Red flags need this trainee's progress and weigh-ins, which they have not shared."
    )
  ).toBeVisible();

  // …and none of the withheld-scope empty states leaked through in their place. Each
  // of these is a statement ABOUT the trainee, which is the failure F1 was written to
  // stop: it looks like data.
  const body = page.locator("body");
  await expect(body).not.toContainText("No weigh-ins in the last 8 weeks");
  await expect(body).not.toContainText("No red flags");
  await expect(body).not.toContainText("undefined");
  await expect(body).not.toContainText("NaN");

  // The tiles carry the caption at least once — the dash-plus-"Not shared" pairing.
  await expect(page.getByText("Not shared").first()).toBeVisible();
});

test("the routine tab states the absence instead of throwing", async ({ page }) => {
  await signIn(page);
  const response = await page.goto(`/clients/${LEGACY_CLIENT}/routine`);
  expect(response?.status()).toBe(200);

  // No `scopes` → fail closed → the portal does not call the (404) endpoint at all.
  await expect(
    page.getByText("This trainee has not shared their workouts with you.")
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Application error");
});

test("the nutrition tab states the absence instead of throwing", async ({ page }) => {
  await signIn(page);
  const response = await page.goto(`/clients/${LEGACY_CLIENT}/nutrition`);
  expect(response?.status()).toBe(200);

  await expect(
    page.getByText("This trainee has not shared their nutrition with you.")
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Application error");
});

/**
 * The half-migrated deploy: B1 has shipped (the overview carries `scopes`) but
 * EV-184a has not, so the tab endpoints 404. The scope IS held, so the portal calls
 * them — and a 404 must land on the load-error card, which says the routine could not
 * be loaded. It must NOT say the trainee withheld anything: the api being incomplete
 * is not the trainee's choice, and telling a coach their client revoked consent when
 * a controller is simply missing is the worse of the two wrong answers.
 */
test("a 404 from an unbuilt tab endpoint is a load error, not a consent claim", async ({
  page,
}) => {
  await signIn(page);

  const routine = await page.goto(`/clients/${SCOPED_CLIENT}/routine`);
  expect(routine?.status()).toBe(200);
  await expect(page.getByText("This trainee's routine could not be loaded.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("has not shared their workouts");
  await expect(page.locator("body")).not.toContainText("Application error");

  const nutrition = await page.goto(`/clients/${SCOPED_CLIENT}/nutrition`);
  expect(nutrition?.status()).toBe(200);
  await expect(page.getByText("This trainee's nutrition could not be loaded.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("has not shared their nutrition");
  await expect(page.locator("body")).not.toContainText("Application error");
});

/**
 * The roster is the screen the coach reaches all of the above from, and it takes the
 * same legacy payload: no `scopes` on the row either (Task 2 adds the field to
 * `RosterClient`, and the api that serves this test does not have it).
 */
test("the roster renders a legacy payload without a bare null", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText("Lina M.").first()).toBeVisible();
  const body = page.locator("body");
  await expect(body).not.toContainText("undefined");
  await expect(body).not.toContainText("NaN");
  await expect(body).not.toContainText("Application error");
});

/**
 * EV-223 — `src/app/api/fixture/state` ships in every build, including the Vercel
 * deployment, and must be inert there. This config is the only one in the repo that runs
 * the portal in `COACH_API_MODE=live` without a real api, so the witness lives here: a
 * SIGNED-IN coach (past the middleware) gets 404 for both the read and the reset.
 */
test("outside fixture mode the fixture reset route is a 404 to a signed-in coach", async ({ page }) => {
  await signIn(page);
  for (const method of ["GET", "DELETE"] as const) {
    const res = await page.request.fetch("/api/fixture/state", { method, maxRedirects: 0 });
    expect(res.status(), `${method} /api/fixture/state in live mode`).toBe(404);
  }
  // EV-272 — the call journal ships in every build too, and is inert the same way.
  const calls = await page.request.fetch("/api/fixture/calls", { method: "GET", maxRedirects: 0 });
  expect(calls.status(), "GET /api/fixture/calls in live mode").toBe(404);
});
