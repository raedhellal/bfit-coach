import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * EV-284b — the coach sees what the trainee logged to eat, against the targets.
 * AC5 as amended 2026-09-27 (hub story EV-284, restated after the EV-284a review):
 *
 *   The section renders seven days, the eaten/target pair per day, and "Nothing logged"
 *   for an empty day. Expanding a day lists its entries with the source shown as "From
 *   the food database" (OFF, with or without a barcode), "Quick add" (QUICK) or "Entered
 *   by hand" (MANUAL), and its eaten planned meals under "From the plan". A QUICK entry
 *   shows its kcal and — for protein, carbs and fat; any other entry shows its stored
 *   macros, including 0.
 *
 * Every story sentence is a LITERAL here, never imported from `copy.ts`: an assertion
 * built from the shipped string agrees with it by construction.
 *
 * The fixture's days are relative to the SERVER's UTC today, exactly as the api's
 * default window is (the portal sends no range). The test computes the same seven UTC
 * dates. A run that straddles UTC midnight can disagree with itself; that is the
 * api's own window (ADR-0025 D25.6), not a portal decision.
 *
 * AC2 (the portal's totals equal the phone's Today screen) is a DEVICE check for QA:
 * the portal never re-sums, it renders the api's `totals`, and nothing in a browser
 * run can reach the phone.
 *
 * Trainees:
 *   Lina  — targets 2,150 kcal / 150 g protein. Today: an OFF entry with a barcode and a
 *           QUICK one (AC1's Monday). 1 day ago: a planned meal eaten, no entries.
 *           3 days ago: OFF without a barcode, MANUAL with 0 g fat, and an eaten lunch.
 *           6 days ago: OFF + QUICK. Days 2, 4 and 5 ago: nothing.
 *   Nils  — no stored target; one MANUAL entry today; 2 days ago totals with no
 *           entries and no eaten meals (review N3).
 *   Petra — NUTRITION only, never logs: seven "Nothing logged" (edge case 1).
 *   Yusuf — no NUTRITION scope: no section, and the log is never requested.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
const PETRA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0006";
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

/** `YYYY-MM-DD` of the UTC day `daysAgo` before today. */
function utcDay(daysAgo: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** The section, by its landmark name — never a div found by its text. */
function foodLog(page: Page): Locator {
  return page.getByRole("region", { name: "Food log" });
}

function day(page: Page, daysAgo: number): Locator {
  return foodLog(page).locator(`[data-date="${utcDay(daysAgo)}"]`);
}

/** The value a day (or an entry) shows for one label: `<dt>label</dt><dd>value</dd>`. */
function valueOf(scope: Locator, label: string): Locator {
  return scope.locator(`dt:text-is("${label}") + dd`);
}

/** A collapsed day's eaten/target pair, e.g. "417 / 2,150 kcal", by its label. */
function pairOf(dayRow: Locator, label: string): Locator {
  return dayRow.locator(`summary [data-pair="${label}"] [data-value]`);
}

/** One entry of an expanded day, by its name. */
function entry(scope: Locator, name: string): Locator {
  return scope.locator("[data-entry]").filter({ has: scope.page().getByText(name, { exact: true }) });
}

async function openNutrition(page: Page, id: string) {
  await signIn(page);
  const res = await page.goto(`/clients/${id}/nutrition`);
  expect(res?.status()).toBe(200);
}

test.describe("EV-284b AC5 — the Food log section", () => {
  test("seven days, newest first, with the eaten/target pair on each logged day", async ({
    page,
  }) => {
    await openNutrition(page, LINA);
    const section = foodLog(page);
    await expect(section).toBeVisible();

    const dates = await section
      .locator("[data-date]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-date")));
    expect(dates).toEqual([0, 1, 2, 3, 4, 5, 6].map(utcDay));

    // The api's totals, never re-summed here: entries PLUS planned meals marked eaten.
    await expect(pairOf(day(page, 0), "Calories")).toHaveText("417 / 2,150 kcal");
    await expect(pairOf(day(page, 0), "Protein")).toHaveText("17 / 150 g");
    // A day whose only record is a planned meal marked eaten still has totals.
    await expect(pairOf(day(page, 1), "Calories")).toHaveText("420 / 2,150 kcal");
    await expect(pairOf(day(page, 1), "Protein")).toHaveText("18 / 150 g");
    await expect(pairOf(day(page, 3), "Calories")).toHaveText("787 / 2,150 kcal");
    await expect(pairOf(day(page, 3), "Protein")).toHaveText("51 / 150 g");
    await expect(pairOf(day(page, 6), "Calories")).toHaveText("970 / 2,150 kcal");
  });

  test("an empty day says Nothing logged, never 0 kcal, and has nothing to expand", async ({
    page,
  }) => {
    await openNutrition(page, LINA);
    for (const daysAgo of [2, 4, 5]) {
      const empty = day(page, daysAgo);
      await expect(empty).toContainText("Nothing logged");
      await expect(empty).not.toContainText("kcal");
      await expect(empty.locator("details")).toHaveCount(0);
    }
    // And a logged day never says it.
    await expect(day(page, 0)).not.toContainText("Nothing logged");
  });

  test("expanding a day lists its entries with the three source labels", async ({ page }) => {
    await openNutrition(page, LINA);

    // Collapsed by default: the entries are not on screen until the coach asks.
    const today = day(page, 0);
    await expect(entry(today, "Greek yogurt 0%")).toBeHidden();
    await today.locator("summary").click();

    // OFF WITH a barcode → "From the food database" (not "Scanned": AC5's struck label).
    const yogurt = entry(today, "Greek yogurt 0%");
    await expect(yogurt).toBeVisible();
    await expect(yogurt).toContainText("From the food database");
    await expect(yogurt).not.toContainText("Scanned");
    await expect(yogurt).toContainText("Fage");
    await expect(yogurt).toContainText("170 g");

    await expect(entry(today, "Pastry")).toContainText("Quick add");

    const three = day(page, 3);
    await three.locator("summary").click();
    // OFF WITHOUT a barcode → the same one label.
    await expect(entry(three, "Banana")).toContainText("From the food database");
    await expect(entry(three, "Rice cakes")).toContainText("Entered by hand");
    await expect(foodLog(page).getByText("Scanned")).toHaveCount(0);
  });

  test("a QUICK entry shows its kcal and a dash per macro; any other shows its stored 0", async ({
    page,
  }) => {
    await openNutrition(page, LINA);
    const today = day(page, 0);
    await today.locator("summary").click();

    const quick = entry(today, "Pastry");
    await expect(valueOf(quick, "Calories")).toHaveText("320 kcal");
    for (const macro of ["Protein", "Carbs", "Fat"]) {
      await expect(valueOf(quick, macro)).toHaveText("—");
    }

    // OFF with a real 0 g fat: shown as 0, not a dash.
    const yogurt = entry(today, "Greek yogurt 0%");
    await expect(valueOf(yogurt, "Calories")).toHaveText("97 kcal");
    await expect(valueOf(yogurt, "Protein")).toHaveText("17.3 g");
    await expect(valueOf(yogurt, "Fat")).toHaveText("0 g");

    // MANUAL with a stored 0 g fat: shown as 0 too.
    const three = day(page, 3);
    await three.locator("summary").click();
    await expect(valueOf(entry(three, "Rice cakes"), "Fat")).toHaveText("0 g");
  });

  test("eaten planned meals are listed under From the plan, with their slot and macros", async ({
    page,
  }) => {
    await openNutrition(page, LINA);
    const one = day(page, 1);
    await one.locator("summary").click();
    const plan = one.getByRole("group", { name: "From the plan" });
    await expect(plan).toBeVisible();
    const oats = plan.locator("[data-eaten-meal]").filter({ hasText: "Overnight oats with berries" });
    await expect(oats).toContainText("Breakfast");
    await expect(valueOf(oats, "Calories")).toHaveText("420 kcal");
    await expect(valueOf(oats, "Protein")).toHaveText("18 g");
    // No entries that day: the entries group is absent, not an empty heading.
    await expect(one.locator("[data-entry]")).toHaveCount(0);

    // A day with no eaten meal has no "From the plan" group at all.
    const today = day(page, 0);
    await today.locator("summary").click();
    await expect(today.getByRole("group", { name: "From the plan" })).toHaveCount(0);
  });

  test("a trainee who never logs gets seven Nothing logged days", async ({ page }) => {
    await openNutrition(page, PETRA);
    const days = foodLog(page).locator("[data-date]");
    await expect(days).toHaveCount(7);
    await expect(foodLog(page).getByText("Nothing logged", { exact: true })).toHaveCount(7);
    await expect(foodLog(page)).not.toContainText("kcal");
  });

  test("a trainee with no stored target shows what they ate and no invented target", async ({
    page,
  }) => {
    await openNutrition(page, NILS);
    await expect(pairOf(day(page, 0), "Calories")).toHaveText("300 kcal · No target");
    await expect(pairOf(day(page, 0), "Protein")).toHaveText("10 g · No target");
  });

  test("totals with no entries and no eaten meals open onto Nothing logged, not an empty panel", async ({
    page,
  }) => {
    await openNutrition(page, NILS);
    const odd = day(page, 2);
    // The api's totals are still shown, never hidden or re-derived from empty lists.
    await expect(pairOf(odd, "Calories")).toHaveText("250 kcal · No target");
    await odd.locator("summary").click();
    await expect(odd.locator("details")).toHaveAttribute("open", "");
    const panel = odd.locator("details > div");
    await expect(panel).toHaveText("Nothing logged");
    await expect(panel).toBeVisible();
    await expect(panel.locator("[data-entry], [data-eaten-meal]")).toHaveCount(0);
  });

  /**
   * Scoped to the SECTION's own boxes, not the document: the nutrition page already
   * overflows at 320 px on main, from the targets card's "Activity level: …" line (right
   * edge 376 px, measured 2026-09-28 before this section is opened). That is a separate
   * defect, reported rather than fixed here; a document-wide check would be red for it.
   */
  test("the section is 320 px safe: nothing in an expanded day runs past the viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openNutrition(page, LINA);
    for (const daysAgo of [0, 3]) {
      await day(page, daysAgo).locator("summary").click();
    }
    await expect(entry(day(page, 3), "Banana")).toBeVisible();
    const widest = await foodLog(page).evaluate((root) =>
      Math.max(
        ...Array.from(root.querySelectorAll("*"))
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => r.right)
      )
    );
    expect(widest).toBeLessThanOrEqual(320);
    // The summary stays a 44 px touch target at 320.
    const summary = await day(page, 0).locator("summary").boundingBox();
    expect(summary?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});

test.describe("EV-284b — consent, access and failure", () => {
  test("without NUTRITION there is no section and the log is never requested", async ({ page }) => {
    await openNutrition(page, YUSUF);
    await expect(page.getByText("This trainee has not shared their nutrition with you.")).toBeVisible();
    await expect(foodLog(page)).toHaveCount(0);
    const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const reads = ((await res.json()) as { reads: string[] }).reads;
    expect(reads.filter((c) => c.endsWith("/nutrition/log"))).toEqual([]);
  });

  test("with NUTRITION the log is requested once, with no range (the api's default week)", async ({
    page,
  }) => {
    await openNutrition(page, LINA);
    await expect(foodLog(page)).toBeVisible();
    const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
    const reads = ((await res.json()) as { reads: string[] }).reads;
    expect(reads.filter((c) => c.includes("/nutrition/log"))).toEqual([
      `GET /coach-portal/clients/${LINA}/nutrition/log`,
    ]);
  });

  test("a failed log read loses the section's data only; the rest of the page stands", async ({
    page,
    context,
  }) => {
    await signIn(page);
    await context.addCookies([{ name: "evoli_fixture_food_log", value: "down", url: page.url() }]);
    await page.goto(`/clients/${LINA}/nutrition`);
    await expect(foodLog(page)).toContainText("The food log could not be loaded.");
    // Not a consent sentence: the api being down is not the trainee withholding anything.
    await expect(foodLog(page)).not.toContainText("not shared");
    await expect(foodLog(page).locator("[data-date]")).toHaveCount(0);
    await expect(page.getByText("Daily targets")).toBeVisible();
  });

  test("a 403 on the log read means access ended: the coach lands on the denial page", async ({
    page,
    context,
  }) => {
    await signIn(page);
    await context.addCookies([
      { name: "evoli_fixture_food_log", value: "forbidden", url: page.url() },
    ]);
    await page.goto(`/clients/${LINA}/nutrition`);
    await page.waitForURL("**/clients/denied");
    await expect(page.getByText("Nothing logged")).toHaveCount(0);
  });
});
