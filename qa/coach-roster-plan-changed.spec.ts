import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * EV-283b AC5, the roster's half: a small "Plan changed" marker on the rows whose
 * `routineChangedSinceYourPublish` is true, and on no other row. Publishing clears it.
 *
 * Runs on the POPULATED scenario (`playwright.roster.config.ts`,
 * `npm run test:e2e:roster`): the default suite's roster is empty.
 *
 * The six rows and their flag:
 *   Yusuf  — true: the trainee's own plan became live after this coach's publish.
 *   Lina, Tobias — false: WORKOUTS is shared and the coach's plan is live.
 *   Petra, Sara, Mara — null: no WORKOUTS, so the api does not say. Null is "not
 *            shared", never a marker and never a claim that nothing changed.
 *
 * "Plan changed" is a literal here on purpose: an import from copy.ts would agree with
 * the shipped string by construction.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
const MARKER = "Plan changed";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

/** The names of the rows that carry the marker, in one layout. */
async function markedRows(page: Page, layout: ".only-wide tbody tr" | ".only-narrow a") {
  return page.locator(layout).evaluateAll(
    (rows, marker) =>
      rows
        .filter((r) =>
          Array.from(r.querySelectorAll("[data-plan-changed]")).some(
            (el) => el.textContent?.trim() === marker
          )
        )
        .map((r) => (r.textContent ?? "").match(/[A-Z][a-z]+ [A-Z]\./)?.[0] ?? "?"),
    MARKER
  );
}

test("the marker is on the flagged row and on no other, in both layouts", async ({ page }) => {
  await signIn(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator(".only-wide tbody tr")).toHaveCount(6);
  expect(await markedRows(page, ".only-wide tbody tr")).toEqual(["Yusuf A."]);
  await expect(
    page.locator(".only-wide tbody tr", { hasText: "Yusuf A." }).getByText(MARKER, { exact: true })
  ).toBeVisible();

  // AC2 of EV-187 is demoed at 390 px; a signal that exists only on the desktop table
  // is not a roster signal.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".only-narrow a")).toHaveCount(6);
  expect(await markedRows(page, ".only-narrow a")).toEqual(["Yusuf A."]);
  await expect(
    page.locator(".only-narrow a", { hasText: "Yusuf A." }).getByText(MARKER, { exact: true })
  ).toBeVisible();
});

test("publishing to the trainee clears the marker", async ({ page }) => {
  await signIn(page);
  await expect(
    page.locator(".only-wide tbody tr", { hasText: "Yusuf A." }).getByText(MARKER, { exact: true })
  ).toBeVisible();

  await page.goto(`/clients/${YUSUF}/routine`);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: /^Publish/ });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(
    page.getByText("Published. The trainee sees it next time they open the app.")
  ).toBeVisible();

  await page.goto("/");
  await expect(page.locator(".only-wide tbody tr")).toHaveCount(6);
  expect(await markedRows(page, ".only-wide tbody tr")).toEqual([]);
  await expect(page.getByText(MARKER, { exact: true })).toHaveCount(0);
});
