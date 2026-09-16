import { expect, test, type Page } from "@playwright/test";

/**
 * The roster under partial consent — ADR-0015 D5/S1. Runs against the POPULATED
 * fixture scenario, which needs its own dev server (playwright.roster.config.ts):
 * `npm run test:e2e:roster`.
 *
 * S1 filters `currentPlanName`, `lastCompletedWorkoutDate` and `currentStreakDays` per
 * item on the link's scopes, so all three can be null for a reason that has nothing to
 * do with the trainee's behaviour. What is asserted here is that none of them is
 * rendered as a claim, and that a null date no longer drags the row to the top of a
 * needs-attention list the coach has no attention data for.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

/** The wide table's rows, in render order. */
function rowNames(page: Page) {
  return page
    .locator(".only-wide tbody tr")
    .evaluateAll((rows) => rows.map((r) => r.querySelector("td")?.textContent?.trim() ?? ""));
}

test("a scope-filtered row shows absences, not zeros", async ({ page }) => {
  await signIn(page);

  const petra = page.locator(".only-wide tbody tr", { hasText: "Petra L." });
  // NUTRITION only: no plan, no last workout, no streak.
  await expect(petra).toContainText("No plan");
  await expect(petra).toContainText("Not shared");
  // A streak of "0 days" or "No streak" would both be statements about a trainee whose
  // sessions this coach has never been allowed to see.
  await expect(petra).not.toContainText("0 days");
  await expect(petra).not.toContainText("No streak");

  const yusuf = page.locator(".only-wide tbody tr", { hasText: "Yusuf A." });
  // WORKOUTS only: the plan is shared, the progress fields are not — which is what
  // proves the three nulls are filtered independently and not row-wide.
  await expect(yusuf).toContainText("Two Day Full Body");
  await expect(yusuf).toContainText("Not shared");
  await expect(yusuf).not.toContainText("No streak");
});

test("an unknown last-workout date sorts LAST, not first", async ({ page }) => {
  await signIn(page);

  // `evaluateAll` does not auto-wait, and the roster streams behind a loading.tsx —
  // read the rows only once they are there, or the assertion races the skeleton.
  await expect(page.locator(".only-wide tbody tr")).toHaveCount(3);
  const names = await rowNames(page);
  // Lina has a date; Petra and Yusuf have none. Before ADR-0015 S1 a null meant "never
  // trained" and led the list — so both scope-filtered rows would have pinned
  // themselves above the one trainee with real, recent data, permanently.
  expect(names[0]).toContain("Lina M.");
  expect(names.slice(1).join(" ")).toContain("Petra L.");
  expect(names.slice(1).join(" ")).toContain("Yusuf A.");
});

test("the roster never renders a bare null or NaN for a filtered field", async ({ page }) => {
  await signIn(page);
  const body = page.locator("body");
  await expect(body).not.toContainText("null");
  await expect(body).not.toContainText("NaN");
  await expect(body).not.toContainText("undefined");
});
