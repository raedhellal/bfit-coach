import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * EV-288 AC2 — the coach's Swap sheet recovers from `409 SWAP_OPTIONS_STALE` (BUG-271,
 * ADR-0028 §4.3b) by showing the current options, in **fixture mode**, on both sheets
 * (placement flag off: Pia O.; flag on: Tess V. with coach C1).
 *
 * How the 409 is produced — no switch, the real sequence: the fixture keeps the api's
 * swap-candidate cache (`src/lib/coachApi.fixture.ts`, EV-288 block). Tab A reads the
 * meal's options; tab B, same coach, reads them and applies one, which replaces the meal
 * and clears the cache; tab A then applies from its list, which is no longer the server's.
 * That is story AC3's two-device case, played by two tabs against the fixture.
 *
 * The four facts, per sheet: the sheet stays open; the options are read again, ONCE
 * (the fixture's call journal); the new options render; the line is shown and no generic
 * error is. Plus: nothing was written by the stale apply, a pick from the new list works,
 * and edge case 1 (the re-read fails → today's options-error state, no line).
 *
 * Every AC sentence is a LITERAL here, never imported from `copy.ts`.
 */

const PASSWORD = "Password123!";
const C1 = "coach.c1@evoli.fit";
const DEFAULT_COACH = "coach@evoli.fit";
const TESS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0019";
const PIA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0018";
const M_ROW = "Wednesday Lunch";

/* ── verbatim ──────────────────────────────────────────────────────────────── */
const CHANGED = "These options changed. Here are the current ones.";
const SWAP_FAILED = "The meal could not be swapped.";
const SWAP_NONE = "No swap options are available for this meal.";
const SHOW = "Show suggestions";
const SUGGESTIONS = "Suggestions";

async function signIn(page: Page, email: string) {
  await signInThroughForm(page, { email: email, password: PASSWORD });
}

async function openNutrition(page: Page, id: string) {
  const res = await page.goto(`/clients/${id}/nutrition`);
  expect(res?.status()).toBe(200);
}

function meal(page: Page, name: string): Locator {
  return page.getByRole("group", { name, exact: true });
}

async function mealName(row: Locator): Promise<string> {
  const title = await row.locator("span[title]").first().getAttribute("title");
  expect(title, "the meal row carries its full name").toBeTruthy();
  return title as string;
}

/** Retried until the dialog answers: a click before hydration is a no-op. */
async function openSheet(page: Page, row: Locator): Promise<Locator> {
  const sheet = page.getByRole("dialog", { name: "Swap meal" });
  await expect(async () => {
    await row.getByRole("button", { name: /^Swap meal: / }).click();
    await expect(sheet).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  return sheet;
}

/** The candidate buttons the sheet shows, by full name (flag off: the whole sheet). */
async function names(list: Locator): Promise<string[]> {
  const rows = list.locator("button[title]");
  await expect(rows.first()).toBeVisible();
  return rows.evaluateAll((els) => els.map((el) => el.getAttribute("title") ?? ""));
}

function suggestions(sheet: Locator): Locator {
  return sheet.getByRole("region", { name: SUGGESTIONS });
}

async function calls(page: Page): Promise<string[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status(), "GET /api/fixture/calls — fixture mode only").toBe(200);
  return ((await res.json()) as { calls: string[] }).calls;
}
const isSwapRead = (c: string) => /^GET \/coach-portal\/clients\/[^/]+\/nutrition\/week\/meals\/[^/]+\/swap$/.test(c);
const isSwapApply = (c: string) => /^POST \/coach-portal\/clients\/[^/]+\/nutrition\/week\/meals\/[^/]+\/swap$/.test(c);

/** The journal AFTER the last swap apply: what the stale answer caused. */
async function afterLastApply(page: Page): Promise<string[]> {
  const journal = await calls(page);
  let last = -1;
  journal.forEach((c, i) => {
    if (isSwapApply(c)) last = i;
  });
  expect(last, "an apply was sent").toBeGreaterThanOrEqual(0);
  return journal.slice(last + 1);
}

/**
 * Tab B: the same coach, the same meal, swaps it to its first option. Returns the name
 * the meal now has. This is "the other device" of story AC3.
 */
async function swapFromAnotherTab(
  context: BrowserContext,
  id: string,
  flagOn: boolean
): Promise<string> {
  const other = await context.newPage();
  await openNutrition(other, id);
  const row = meal(other, M_ROW);
  const before = await mealName(row);
  const sheet = await openSheet(other, row);
  const list = flagOn ? suggestions(sheet) : sheet;
  if (flagOn) await suggestions(sheet).getByRole("button", { name: SHOW }).click();
  const first = list.locator("button[title]").first();
  const chosen = (await first.getAttribute("title")) as string;
  await first.click();
  await expect(sheet).toBeHidden();
  await expect.poll(() => mealName(meal(other, M_ROW))).toBe(chosen);
  expect(chosen).not.toBe(before);
  await other.close();
  return chosen;
}

test.describe("EV-288 AC2 — flag off (the sheet that loads suggestions at once)", () => {
  test("a stale apply: the sheet stays open, the options are re-read once, the current ones render with the line, no generic error; a pick from them works", async ({ page, context }) => {
    await signIn(page, DEFAULT_COACH);
    await openNutrition(page, PIA);
    const row = meal(page, M_ROW);
    const original = await mealName(row);
    const sheet = await openSheet(page, row);
    const stale = await names(sheet);

    const written = await swapFromAnotherTab(context, PIA, false);

    // Tab A still shows the old list; it picks from it.
    await sheet.locator("button[title]").last().click();

    await expect(sheet.getByTestId("swap-options-changed")).toHaveText(CHANGED);
    await expect(sheet).toBeVisible();
    const current = await names(sheet);
    expect(current, "the list on screen is the server's current one").not.toEqual(stale);
    expect(current, "the meal it is now is not offered as itself").not.toContain(written);
    await expect(page.getByText(SWAP_FAILED)).toHaveCount(0);
    await expect(sheet.getByTestId("swap-refusal")).toHaveCount(0);
    expect((await afterLastApply(page)).filter(isSwapRead), "exactly one re-read").toHaveLength(1);
    expect(
      (await calls(page)).filter(isSwapApply),
      "the stale apply was not retried by the portal"
    ).toHaveLength(2);
    // The row on this tab is untouched by the refused apply (the week is not re-read).
    expect(await mealName(row)).toBe(original);

    // Picking again from the current list succeeds.
    const pick = sheet.locator("button[title]").first();
    const picked = (await pick.getAttribute("title")) as string;
    await pick.click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => mealName(meal(page, M_ROW))).toBe(picked);
  });

  test("edge case 1: the re-read fails → today's options-error state, no line, no generic error", async ({ page, context }) => {
    await signIn(page, DEFAULT_COACH);
    await openNutrition(page, PIA);
    const sheet = await openSheet(page, meal(page, M_ROW));
    await names(sheet);
    await swapFromAnotherTab(context, PIA, false);
    await context.addCookies([{ name: "evoli_fixture_swap", value: "fail", url: page.url() }]);

    await sheet.locator("button[title]").first().click();

    await expect(sheet.getByText(SWAP_NONE, { exact: true })).toBeVisible();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("swap-options-changed")).toHaveCount(0);
    await expect(page.getByText(CHANGED)).toHaveCount(0);
    await expect(page.getByText(SWAP_FAILED)).toHaveCount(0);
    expect((await afterLastApply(page)).filter(isSwapRead)).toHaveLength(1);
  });
});

test.describe("EV-288 AC2 — flag on (the recipes-first Swap sheet)", () => {
  test("a stale apply: the sheet stays open, the suggestions are re-read once, the current ones render with the line, no generic error; the recipes stay; a pick works", async ({ page, context }) => {
    await signIn(page, C1);
    await openNutrition(page, TESS);
    const row = meal(page, M_ROW);
    const original = await mealName(row);
    const sheet = await openSheet(page, row);
    await suggestions(sheet).getByRole("button", { name: SHOW }).click();
    const stale = await names(suggestions(sheet));
    const recipes = sheet.getByTestId("recipe-choices").getByRole("button");
    await expect(recipes).toHaveCount(6);

    const written = await swapFromAnotherTab(context, TESS, true);

    await suggestions(sheet).locator("button[title]").last().click();

    await expect(suggestions(sheet).getByTestId("swap-options-changed")).toHaveText(CHANGED);
    await expect(sheet).toBeVisible();
    const current = await names(suggestions(sheet));
    expect(current).not.toEqual(stale);
    expect(current).not.toContain(written);
    await expect(recipes, "the recipe half is untouched").toHaveCount(6);
    await expect(page.getByText(SWAP_FAILED)).toHaveCount(0);
    await expect(sheet.getByTestId("swap-refusal")).toHaveCount(0);
    expect((await afterLastApply(page)).filter(isSwapRead), "exactly one re-read").toHaveLength(1);
    expect((await calls(page)).filter(isSwapApply)).toHaveLength(2);
    expect(await mealName(row)).toBe(original);

    const pick = suggestions(sheet).locator("button[title]").first();
    const picked = (await pick.getAttribute("title")) as string;
    await pick.click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => mealName(meal(page, M_ROW))).toBe(picked);
  });

  test("edge case 1: the re-read fails → today's options-error state in Suggestions, no line, no generic error", async ({ page, context }) => {
    await signIn(page, C1);
    await openNutrition(page, TESS);
    const sheet = await openSheet(page, meal(page, M_ROW));
    await suggestions(sheet).getByRole("button", { name: SHOW }).click();
    await names(suggestions(sheet));
    await swapFromAnotherTab(context, TESS, true);
    await context.addCookies([{ name: "evoli_fixture_swap", value: "fail", url: page.url() }]);

    await suggestions(sheet).locator("button[title]").first().click();

    await expect(suggestions(sheet).getByText(SWAP_NONE, { exact: true })).toBeVisible();
    await expect(sheet).toBeVisible();
    await expect(page.getByText(CHANGED)).toHaveCount(0);
    await expect(page.getByText(SWAP_FAILED)).toHaveCount(0);
    expect((await afterLastApply(page)).filter(isSwapRead)).toHaveLength(1);
  });
});
