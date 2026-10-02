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

/**
 * The names of the rows that carry the marker. EV-337d: one `.roster-row` per client, a
 * row from 768 px and a card below it (CSS decides), so "both layouts" is one locator read
 * at two widths.
 */
async function markedRows(page: Page) {
  return page.locator(".roster-row").evaluateAll(
    (rows, marker) =>
      rows
        .filter((r) =>
          Array.from(r.querySelectorAll("[data-plan-changed]")).some(
            (el) => el.textContent?.trim() === marker
          )
        )
        .map((r) => r.querySelector(".roster-name")?.textContent?.trim() ?? "?"),
    MARKER
  );
}

test("the marker is on the flagged row and on no other, in both layouts", async ({ page }) => {
  await signIn(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator(".roster-row")).toHaveCount(6);
  expect(await markedRows(page)).toEqual(["Yusuf A."]);
  await expect(
    page.locator(".roster-row", { hasText: "Yusuf A." }).getByText(MARKER, { exact: true })
  ).toBeVisible();

  // AC2 of EV-187 is demoed at 390 px; a signal that exists only on the desktop table
  // is not a roster signal.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".roster-row")).toHaveCount(6);
  expect(await markedRows(page)).toEqual(["Yusuf A."]);
  await expect(
    page.locator(".roster-row", { hasText: "Yusuf A." }).getByText(MARKER, { exact: true })
  ).toBeVisible();
});

test("publishing to the trainee clears the marker, reached by clicking", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const yusufRow = page.locator(".roster-row", { hasText: "Yusuf A." });
  await expect(yusufRow.getByText(MARKER, { exact: true })).toBeVisible();

  // Every step below is a click, never a page.goto: the defect this guards is the
  // CLIENT router cache serving the roster it rendered before the publish, and a
  // goto is a fresh document that never consults that cache. The window marker
  // proves no step fell back to a full load.
  //
  // What this does NOT witness (checked 2026-09-28, Next 14.2.35, dev server): it stays
  // green with `revalidatePath("/")` removed from routineActions.ts — and with all
  // three of its revalidatePath calls removed — because the editor's own
  // `router.refresh()` after a publish purges the whole client router cache. It pins
  // the behaviour the coach sees, not which line produces it.
  await page.evaluate(() => {
    (window as unknown as { __ev283bSpa?: boolean }).__ev283bSpa = true;
  });

  // The whole row is the link (EV-337d).
  await yusufRow.click();
  await page.waitForURL(`/clients/${YUSUF}`);
  await page
    .getByRole("navigation", { name: "Trainee sections" })
    .getByRole("link", { name: "Routine", exact: true })
    .click();
  await page.waitForURL(`/clients/${YUSUF}/routine`);

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: /^Publish/ });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(
    page.getByText("Published. The trainee sees it next time they open the app.")
  ).toBeVisible();

  // The header's text link, not the logo (which shares its aria-label).
  await page
    .getByRole("link", { name: "Back to roster" })
    .filter({ hasText: "Back to roster" })
    .click();
  await page.waitForURL("/");
  expect(
    await page.evaluate(() => (window as unknown as { __ev283bSpa?: boolean }).__ev283bSpa)
  ).toBe(true);

  await expect(page.locator(".roster-row")).toHaveCount(6);
  await expect(yusufRow.getByText(MARKER, { exact: true })).toHaveCount(0);
  expect(await markedRows(page)).toEqual([]);
  await expect(page.getByText(MARKER, { exact: true })).toHaveCount(0);
});
