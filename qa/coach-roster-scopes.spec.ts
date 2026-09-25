import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * The roster under partial consent — ADR-0015 D5/S1. Runs against the POPULATED
 * fixture scenario, which needs its own dev server (playwright.roster.config.ts):
 * `npm run test:e2e:roster`.
 *
 * S1 filters `currentPlanName`, `lastCompletedWorkoutDate` and `currentStreakDays` per
 * item on the link's scopes, so all three can be null for a reason that has nothing to
 * do with the trainee's behaviour. Since the row carries `scopes` (contract item 4) the
 * roster can say which reason — so what is asserted here is that a null renders as a
 * claim about the TRAINEE only when the scope is held, as an absence when it is not,
 * and that the two sort to opposite ends of a needs-attention list.
 *
 * The four rows and what each one is for:
 *   Lina  — everything shared, a recent date: the ordinary row.
 *   Petra — NUTRITION only: all three fields withheld.
 *   Yusuf — WORKOUTS only: the plan is shared, the progress fields are not.
 *   Sara  — PROGRESS + WEIGH_INS, never trained: the null date that IS a fact about
 *           her, plus a real streak of zero.
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
  // NUTRITION only: WORKOUTS and PROGRESS are both withheld, so all three cells are
  // absences. "No plan" would be a claim about her app made from a field the api
  // filtered out — which is what `scopes` on the row now prevents.
  await expect(petra).not.toContainText("No plan");
  await expect(petra).toContainText("Not shared");
  await expect(petra).not.toContainText("No workouts yet");
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
  await expect(yusuf).not.toContainText("No workouts yet");
});

test("a held scope with no data says so, and is not confused with an absence", async ({
  page,
}) => {
  await signIn(page);

  const sara = page.locator(".only-wide tbody tr", { hasText: "Sara P." });
  // PROGRESS is held and she has never completed a workout: that is a fact about Sara,
  // and the row is allowed to state it. "Not shared" here would be a lie in the other
  // direction — the trainee DID share, there is simply nothing yet.
  await expect(sara).toContainText("No workouts yet");
  // A real streak of zero, from a scope that is held. The only row where "No streak"
  // is an honest sentence.
  await expect(sara).toContainText("No streak");
  // …and WORKOUTS is not held, so the plan cell is the absence, not "No plan".
  await expect(sara).not.toContainText("No plan");
  await expect(sara).toContainText("Not shared");
});

test("an unknown last-workout date sorts LAST, not first", async ({ page }) => {
  await signIn(page);

  /**
   * Six rows since EV-187b seeded AC2's roster (Tobias and Mara joined the four).
   *
   * ⚠️ **The sort moved with it, and this test asserts the SURVIVING half of the old
   * ruling.** Order used to be `lastCompletedWorkoutDate` ascending, computed in the
   * portal. EV-187a put `redFlagCount` on the row and `sort` on the endpoint, so the api
   * orders by flags FIRST and the silence key second. What ADR-0015 S1's ruling still
   * governs — and what this test is for — is the two readings of one null date: PROGRESS
   * held and never trained sorts EARLY, PROGRESS withheld is unknown and sorts LAST. The
   * flag ordering itself belongs to `coach-roster-triage.spec.ts`.
   */
  await expect(page.locator(".only-wide tbody tr")).toHaveCount(6);
  const names = await rowNames(page);
  // Sara shares PROGRESS, has never trained, and carries one flag: still above Lina,
  // who has the same flag count and trained yesterday.
  expect(names.indexOf(names.find((n) => n.includes("Sara P."))!)).toBeLessThan(
    names.indexOf(names.find((n) => n.includes("Lina M."))!)
  );
  // Petra and Yusuf withheld PROGRESS: their date is UNKNOWN, not old, so they sort
  // after Lina. Sorting them first produced a needs-attention list led by exactly the
  // trainees the coach has no attention data for, permanently.
  const afterLina = names.slice(names.findIndex((n) => n.includes("Lina M.")) + 1).join(" ");
  expect(afterLina).toContain("Petra L.");
  expect(afterLina).toContain("Yusuf A.");
});

test("the roster never renders a bare null or NaN for a filtered field", async ({ page }) => {
  await signIn(page);
  const body = page.locator("body");
  await expect(body).not.toContainText("null");
  await expect(body).not.toContainText("NaN");
  await expect(body).not.toContainText("undefined");
});
