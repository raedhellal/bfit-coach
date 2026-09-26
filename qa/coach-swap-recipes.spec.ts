import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { atEachWidth, expectNoSidewaysScroll } from "./layout";

/**
 * EV-272 — "the coach's meal swap searches the coach's own recipes first", in
 * **fixture mode**, with both values of the placement flag.
 *
 * The story's fixtures, as the fixture serves them (`src/lib/coachApi.fixture.ts`):
 *   · C1 = `coach.c1@evoli.fit`: EXACTLY six recipes (Salmon quinoa 610, Tofu stir-fry 560,
 *     Chicken rice 650, Lentil bowl 520, Crêpes aux épinards 430, Overnight oats 380).
 *   · C0 = `coach.c0@evoli.fit`: zero recipes.  · `coach.c100@evoli.fit`: 100 (edge 5).
 *   · T-veg = Tess V.: VEGETARIAN, no allergies, NUTRITION only, no recipe meal.
 *     Wednesday lunch M = "Halloumi and chickpea wrap", 600 kcal, unlocked.
 *     Thursday dinner L is locked by her.
 *   · The flag: ON for every trainee but Pia O. (fixture affordance — the real flag is
 *     server-wide; see `PLACEMENT_OFF_IDS`).
 *
 * The browser only ever sees server actions (a POST to the page's own URL), never an api
 * path. So every "the network log shows" clause is witnessed TWICE: in the browser (how
 * many server-action POSTs), and in the fixture's call journal (`/api/fixture/calls`,
 * which records the api request each action stands for).
 *
 * Every AC sentence is a LITERAL here, never imported from `copy.ts`.
 * `EV272_SHOTS=<dir>` writes evidence screenshots and the flag-off sheet's text + paths.
 */

const PASSWORD = "Password123!";
const C1 = "coach.c1@evoli.fit";
const C0 = "coach.c0@evoli.fit";
const C100 = "coach.c100@evoli.fit";
const DEFAULT_COACH = "coach@evoli.fit";

const TESS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0019";
const PIA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0018";

const M_ROW = "Wednesday Lunch";
const M_NAME = "Halloumi and chickpea wrap";
const L_ROW = "Thursday Dinner";
const LENTIL_ID = "8e3f1b22-0000-4000-8000-000000027204";

/** AC2's order: |kcal − 600| ascending, ties by name A→Z. */
const SIX = [
  "Salmon quinoa",
  "Tofu stir-fry",
  "Chicken rice",
  "Lentil bowl",
  "Crêpes aux épinards",
  "Overnight oats",
];
/** copy.nutrition.macros(kcal, P, C, F), written out. */
const MACROS: Record<string, string> = {
  "Salmon quinoa": "610 kcal · 42 g protein · 50 g carbs · 26 g fat",
  "Tofu stir-fry": "560 kcal · 30 g protein · 60 g carbs · 22 g fat",
  "Chicken rice": "650 kcal · 52 g protein · 70 g carbs · 18 g fat",
  "Lentil bowl": "520 kcal · 28 g protein · 72 g carbs · 13 g fat",
  "Crêpes aux épinards": "430 kcal · 22 g protein · 48 g carbs · 16 g fat",
  "Overnight oats": "380 kcal · 20 g protein · 56 g carbs · 8 g fat",
};

/* ── AC sentences, verbatim ─────────────────────────────────────────────── */
const SEARCH_LABEL = "Search your recipes";
const SUGGESTIONS = "Suggestions";
const SHOW = "Show suggestions";
const noMatch = (q: string) => `No recipe matches “${q}”.`;
const confirmSentence = (meal: string, recipe: string, weekday: string) =>
  `Replace “${meal}” with “${recipe}” on ${weekday}?`;
const lockedSentence = (first: string) => `${first} has already locked this meal, so it can't be replaced.`;
const excludedIngredient = (recipe: string, first: string, value: string) =>
  `“${recipe}” can't be used for ${first}: ${value} conflicts with their dietary settings.`;
const EMPTY = "You have no recipes yet.";
const LOAD_FAILED = "Your recipes could not be loaded.";
const SWAP_LOADING = "Loading options…";
const SWAP_NONE = "No swap options are available for this meal.";
const applyWarning1 = (first: string) =>
  `This replaces up to 1 meal placed from coach recipes. Meals ${first} has eaten are kept.`;

test.describe.configure({ mode: "serial" });

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
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

function sheetOf(page: Page): Locator {
  return page.getByRole("dialog", { name: "Swap meal" });
}

/** Retried until the dialog answers: a click before hydration is a no-op. */
async function openSheet(page: Page, row: Locator): Promise<Locator> {
  const sheet = sheetOf(page);
  await expect(async () => {
    await row.getByRole("button", { name: /^Swap meal: / }).click();
    await expect(sheet).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  return sheet;
}

/** The recipe rows, in DOM order, by full name. */
function recipeRows(sheet: Locator): Locator {
  return sheet.getByTestId("recipe-choices").getByRole("button");
}
async function recipeNames(sheet: Locator): Promise<string[]> {
  return recipeRows(sheet).evaluateAll((els) => els.map((el) => el.getAttribute("title") ?? ""));
}

function suggestions(sheet: Locator): Locator {
  return sheet.getByRole("region", { name: SUGGESTIONS });
}

/** Server-action POSTs the browser sends — the browser's own network log. */
function actionLog(page: Page): string[] {
  const log: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"] !== undefined) log.push(r.url());
  });
  return log;
}

/** The fixture's call journal: the api requests it answered since the test's reset. */
async function calls(page: Page): Promise<string[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status(), "GET /api/fixture/calls — fixture mode only").toBe(200);
  return ((await res.json()) as { calls: string[] }).calls;
}
const isLibraryRead = (c: string) => c === "GET /coach-portal/recipes";
const isSwapRead = (c: string) => /^GET \/coach-portal\/clients\/[^/]+\/nutrition\/week\/meals\/[^/]+\/swap$/.test(c);

/** Settle: give any stray request a chance to leave before we count. */
async function quiet(page: Page) {
  await page.waitForTimeout(400);
}

/** R4 — no word claiming a model, in the rendered DOM of the sheet. */
async function expectNoAiClaim(sheet: Locator) {
  const html = await sheet.evaluate((el) => el.outerHTML);
  const text = await sheet.innerText();
  for (const s of [html, text]) {
    expect(s).not.toMatch(/\bAI\b/);
    expect(s).not.toMatch(/A\.I\./);
    expect(s).not.toMatch(/artificial/i);
  }
}

function shotDir(): string | null {
  const dir = process.env.EV272_SHOTS;
  if (!dir) return null;
  mkdirSync(dir, { recursive: true });
  return dir;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * AC1 — flag off: nothing changes
 * ═══════════════════════════════════════════════════════════════════════════ */

test.describe("AC1 — flag off: the sheet as it was", () => {
  test("Swap loads suggestions at once; no search, no recipe list, no Show suggestions, no second button", async ({ page }) => {
    await signIn(page, C1);
    await openNutrition(page, PIA);
    await expect(page.getByText("Use one of my recipes")).toHaveCount(0);
    const row = meal(page, M_ROW);
    const posts = actionLog(page);

    const sheet = await openSheet(page, row);
    // Today's candidates, straight away.
    await expect(sheet.locator("button[title]").first()).toBeVisible();
    await quiet(page);
    expect(posts, "one server action: the suggestions").toHaveLength(1);
    const journal = await calls(page);
    expect(journal.filter(isSwapRead)).toHaveLength(1);
    expect(journal.filter(isSwapRead)[0]).toContain(`/clients/${PIA}/`);
    expect(journal.filter(isLibraryRead), "the library is never read").toHaveLength(0);

    await expect(sheet.getByLabel(SEARCH_LABEL)).toHaveCount(0);
    await expect(sheet.getByTestId("recipe-choices")).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: SHOW })).toHaveCount(0);
    await expect(sheet.getByText(SUGGESTIONS, { exact: true })).toHaveCount(0);
    await expectNoAiClaim(sheet);
  });

  /**
   * The evidence half of AC1 ("the same visible text and the same distinct request
   * paths at every width, and pixel-identical at ≥ 768 px" against ab14f02): with
   * `EV272_SHOTS` set, this writes each width's screenshot, the sheet's text and the
   * distinct browser request paths, for a diff against the same test run on ab14f02.
   * Uses only what ab14f02 already had (Pia, the default coach), so it runs there too.
   */
  test("flag-off evidence: text, request paths and a screenshot at each width", async ({ page }) => {
    const dir = shotDir();
    await signIn(page, DEFAULT_COACH);
    const paths = new Set<string>();
    page.on("request", (r) => paths.add(`${r.method()} ${new URL(r.url()).pathname}`));
    await openNutrition(page, PIA);
    const sheet = await openSheet(page, meal(page, M_ROW));
    await expect(sheet.locator("button[title]").first()).toBeVisible();
    const out: Record<string, unknown> = {};
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.mouse.move(0, 0);
      await page.waitForTimeout(150);
      out[`text@${width}`] = await sheet.innerText();
      if (dir) await page.screenshot({ path: join(dir, `flag-off-sheet-${width}.png`) });
    }
    out.paths = [...paths].filter((p) => !p.includes("/_next/static/webpack/")).sort();
    if (dir) writeFileSync(join(dir, "flag-off-sheet.json"), JSON.stringify(out, null, 2));
    expect(Object.keys(out)).toHaveLength(6);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * AC2 — flag on: the sheet opens on my recipes and fetches no suggestions
 * ═══════════════════════════════════════════════════════════════════════════ */

test.describe("AC2 — flag on: my recipes first", () => {
  test("title, focused search, six recipes in kcal-distance order with macros, Suggestions + Show suggestions; one library read, zero swap reads", async ({ page }) => {
    await signIn(page, C1);
    await openNutrition(page, TESS);
    // R1 — one replace action per meal.
    await expect(page.getByText("Use one of my recipes")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Use one of my recipes/ })).toHaveCount(0);
    const row = meal(page, M_ROW);
    expect(await mealName(row)).toBe(M_NAME);
    await expect(row.getByText("600 kcal · 28 g protein · 62 g carbs · 26 g fat")).toBeVisible();

    const posts = actionLog(page);
    const sheet = await openSheet(page, row);
    await expect(sheet.getByText(M_NAME, { exact: true })).toBeVisible(); // the sub-title
    const search = sheet.getByLabel(SEARCH_LABEL);
    await expect(search).toBeVisible();
    await expect(search).toBeFocused();

    await expect(recipeRows(sheet)).toHaveCount(6);
    expect(await recipeNames(sheet)).toEqual(SIX);
    for (const [i, name] of SIX.entries()) {
      await expect(recipeRows(sheet).nth(i)).toContainText(name);
      await expect(recipeRows(sheet).nth(i)).toContainText(MACROS[name]);
    }
    const region = suggestions(sheet);
    await expect(region.getByRole("heading", { name: SUGGESTIONS, exact: true })).toBeVisible();
    await expect(region.getByRole("button", { name: SHOW, exact: true })).toBeVisible();
    // Below the list.
    const listBox = await sheet.getByTestId("recipe-choices").boundingBox();
    const regionBox = await region.boundingBox();
    expect(regionBox!.y).toBeGreaterThanOrEqual(listBox!.y + listBox!.height);

    await quiet(page);
    expect(posts, "exactly one server action on opening: the library read").toHaveLength(1);
    const journal = await calls(page);
    expect(journal.filter(isLibraryRead)).toHaveLength(1);
    expect(journal.filter(isSwapRead), "R5: no suggestion request on open").toHaveLength(0);
    expect(journal).toHaveLength(1);
    await expectNoAiClaim(sheet);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * AC3 — type-ahead, ignoring case and accents, no request per keystroke
 * ═══════════════════════════════════════════════════════════════════════════ */

test.describe("AC3 — type-ahead", () => {
  test("crepe / LENT / '  rice ' / 'bowl oats' / spaces / clear — and not one request while typing", async ({ page }) => {
    await signIn(page, C1);
    await openNutrition(page, TESS);
    const sheet = await openSheet(page, meal(page, M_ROW));
    await expect(recipeRows(sheet)).toHaveCount(6);
    await quiet(page);
    const posts = actionLog(page);
    const before = await calls(page);
    const search = sheet.getByLabel(SEARCH_LABEL);

    // pressSequentially: one real keystroke at a time, each one filtering.
    await search.pressSequentially("crepe", { delay: 30 });
    expect(await recipeNames(sheet)).toEqual(["Crêpes aux épinards"]);

    await search.fill("");
    await search.pressSequentially("LENT", { delay: 30 });
    expect(await recipeNames(sheet)).toEqual(["Lentil bowl"]);

    await search.fill("  rice ");
    expect(await recipeNames(sheet)).toEqual(["Chicken rice"]);

    // An accented QUERY matches too, both ways.
    await search.fill("ÉPINARDS");
    expect(await recipeNames(sheet)).toEqual(["Crêpes aux épinards"]);

    // Keeps AC2's order among matches: "o" is in five of the six names.
    await search.fill("o");
    expect(await recipeNames(sheet)).toEqual(SIX.filter((n) => n.toLowerCase().includes("o")));

    await search.fill("bowl oats");
    await expect(recipeRows(sheet)).toHaveCount(0);
    await expect(sheet.getByText(noMatch("bowl oats"), { exact: true })).toBeVisible();
    await expect(suggestions(sheet).getByRole("button", { name: SHOW })).toBeVisible();

    // Edge case 7 — only spaces is the empty query.
    await search.fill("    ");
    expect(await recipeNames(sheet)).toEqual(SIX);

    await search.fill("");
    expect(await recipeNames(sheet)).toEqual(SIX);

    await quiet(page);
    expect(posts, "no server action while typing").toEqual([]);
    expect(await calls(page), "no api request while typing").toEqual(before);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * AC4 + AC9 — choosing a recipe places it through EV-256c
 * ═══════════════════════════════════════════════════════════════════════════ */

test.describe("AC4 — choosing a recipe", () => {
  test("confirm verbatim; Cancel keeps the query; Confirm POSTs …/recipe, closes, 'Your recipe'; AC9 then reads 'up to 1 meal'", async ({ page }) => {
    await signIn(page, C1);
    await openNutrition(page, TESS);
    const row = meal(page, M_ROW);
    const sheet = await openSheet(page, row);
    const search = sheet.getByLabel(SEARCH_LABEL);
    await search.fill("lent");
    await sheet.getByRole("button", { name: "Choose Lentil bowl", exact: true }).click();
    await expect(sheet.getByText(confirmSentence(M_NAME, "Lentil bowl", "Wednesday"), { exact: true })).toBeVisible();

    await sheet.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(sheet.getByLabel(SEARCH_LABEL)).toHaveValue("lent");
    expect(await recipeNames(sheet)).toEqual(["Lentil bowl"]);
    expect((await calls(page)).filter((c) => c.startsWith("POST ")), "Cancel wrote nothing").toEqual([]);

    await sheet.getByRole("button", { name: "Choose Lentil bowl", exact: true }).click();
    await sheet.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await mealName(row)).toBe("Lentil bowl");
    await expect(row.getByText("Your recipe", { exact: true })).toBeVisible();
    expect((await calls(page)).filter((c) => c.startsWith("POST "))).toEqual([
      `POST /coach-portal/clients/${TESS}/nutrition/week/meals/${await row.getAttribute("data-meal-id")}/recipe ${LENTIL_ID}`,
    ]);

    // The server's week, not the card's optimism.
    await page.reload();
    expect(await mealName(meal(page, M_ROW))).toBe("Lentil bowl");

    // AC9 — EV-256e AC5's warning, unchanged, now counting this one meal.
    await page.getByRole("button", { name: "Apply to Tess V." }).click();
    const apply = page.getByRole("dialog", { name: "Apply this meal week?" });
    await expect(apply.getByText(applyWarning1("Tess"), { exact: true })).toBeVisible();
  });

  test("a refusal shows EV-256e's sentence INSIDE the sheet, which stays open on the list; the week is unchanged", async ({ page }) => {
    await signIn(page, C1);
    await openNutrition(page, TESS);
    const row = meal(page, M_ROW);
    const sheet = await openSheet(page, row);
    await sheet.getByLabel(SEARCH_LABEL).fill("chick");
    await sheet.getByRole("button", { name: "Choose Chicken rice", exact: true }).click();
    await sheet.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(sheet.getByTestId("placement-refusal")).toHaveText(
      excludedIngredient("Chicken rice", "Tess", "chicken breast")
    );
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel(SEARCH_LABEL)).toHaveValue("chick");
    expect(await recipeNames(sheet)).toEqual(["Chicken rice"]);
    await expect(suggestions(sheet).getByRole("button", { name: SHOW })).toBeVisible();
    expect(await mealName(row)).toBe(M_NAME);
    await page.reload();
    expect(await mealName(meal(page, M_ROW)), "nothing was written").toBe(M_NAME);
  });

  test("edge case 6 — the same recipe twice on one day is allowed", async ({ page }) => {
    await signIn(page, C1);
    await openNutrition(page, TESS);
    for (const where of [M_ROW, "Wednesday Breakfast"]) {
      const sheet = await openSheet(page, meal(page, where));
      await sheet.getByRole("button", { name: "Choose Lentil bowl", exact: true }).click();
      await sheet.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(await mealName(meal(page, where))).toBe("Lentil bowl");
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * AC5 — suggestions only when asked
 * ═══════════════════════════════════════════════════════════════════════════ */

test.describe("AC5 — Show suggestions", () => {
  test("one GET …/swap, the loading line, today's candidates; the button goes; choosing one POSTs …/swap", async ({ page }) => {
    await signIn(page, C1);
    await openNutrition(page, TESS);
    const row = meal(page, M_ROW);
    const mealId = await row.getAttribute("data-meal-id");
    const sheet = await openSheet(page, row);
    await expect(recipeRows(sheet)).toHaveCount(6);
    await quiet(page);
    expect((await calls(page)).filter(isSwapRead)).toHaveLength(0);

    // Record every text the Suggestions region ever shows, however briefly.
    await page.evaluate(() => {
      const w = window as unknown as { __seen: string[] };
      w.__seen = [];
      new MutationObserver(() => {
        const region = document.querySelector('[data-testid="swap-suggestions-region"]');
        if (region) w.__seen.push(region.textContent ?? "");
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    const region = suggestions(sheet);
    await region.getByRole("button", { name: SHOW, exact: true }).click();
    const candidates = region.locator("button[title]");
    await expect(candidates).toHaveCount(3);
    const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
    expect(seen.some((t) => t.includes(SWAP_LOADING)), "the loading line was shown").toBe(true);

    // Exactly as today: name + copy.nutrition.macros.
    await expect(candidates.nth(0)).toContainText("Halloumi, quinoa and roasted vegetables");
    await expect(candidates.nth(0)).toContainText("610 kcal · 30 g protein · 58 g carbs · 26 g fat");
    await expect(region.getByRole("button", { name: SHOW })).toHaveCount(0);
    await quiet(page);
    expect((await calls(page)).filter(isSwapRead)).toEqual([
      `GET /coach-portal/clients/${TESS}/nutrition/week/meals/${mealId}/swap`,
    ]);
    await expectNoAiClaim(sheet);

    await candidates.nth(1).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await mealName(row)).toBe("Chickpea and white bean salad");
    expect((await calls(page)).filter((c) => c.startsWith("POST "))).toEqual([
      `POST /coach-portal/clients/${TESS}/nutrition/week/meals/${mealId}/swap`,
    ]);
  });

  test("an empty result shows today's swapNone", async ({ browser }) => {
    // The meal is regenerated in another tab after the sheet opened: the api has no
    // candidates for an id that is gone (the fixture answers `[]`, like a cache miss
    // on a vanished meal).
    const context = await browser.newContext();
    const a = await context.newPage();
    await signIn(a, C1);
    await openNutrition(a, TESS);
    const sheet = await openSheet(a, meal(a, "Sunday Dinner"));
    const b = await context.newPage();
    await openNutrition(b, TESS);
    const before = await mealName(meal(b, "Sunday Dinner"));
    await expect(async () => {
      await b.getByRole("button", { name: "Regenerate day: Sunday" }).click();
      await expect.poll(() => mealName(meal(b, "Sunday Dinner")), { timeout: 2_000 }).not.toBe(before);
    }).toPass({ timeout: 20_000 });
    await suggestions(sheet).getByRole("button", { name: SHOW }).click();
    await expect(suggestions(sheet).getByText(SWAP_NONE, { exact: true })).toBeVisible();
    await context.close();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * AC6 — a meal the trainee locked
 * ═══════════════════════════════════════════════════════════════════════════ */

test.describe("AC6 — a locked meal", () => {
  test("only the locked sentence; no search, no list, no Show suggestions; no request at all", async ({ page }) => {
    await signIn(page, C1);
    await openNutrition(page, TESS);
    const row = meal(page, L_ROW);
    await expect(row.getByText("Kept", { exact: true })).toBeVisible();
    const posts = actionLog(page);
    const sheet = await openSheet(page, row);
    await expect(sheet.getByText(lockedSentence("Tess"), { exact: true })).toBeVisible();
    await expect(sheet.getByLabel(SEARCH_LABEL)).toHaveCount(0);
    await expect(sheet.getByTestId("recipe-choices")).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: SHOW })).toHaveCount(0);
    await expect(sheet.locator("button[title]")).toHaveCount(0);
    await quiet(page);
    expect(posts).toEqual([]);
    expect(await calls(page)).toEqual([]);
    await expectNoAiClaim(sheet);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * AC7 — an empty library, a library that fails, and an access that ended
 * ═══════════════════════════════════════════════════════════════════════════ */

test.describe("AC7 — empty and failed library", () => {
  test("C0: 'You have no recipes yet.' + a link to /recipes/new, then Show suggestions; nothing fetched until pressed", async ({ page }) => {
    await signIn(page, C0);
    await openNutrition(page, TESS);
    const sheet = await openSheet(page, meal(page, M_ROW));
    await expect(sheet.getByText(EMPTY, { exact: true })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "New recipe" })).toHaveAttribute("href", "/recipes/new");
    await expect(recipeRows(sheet)).toHaveCount(0);
    await quiet(page);
    expect((await calls(page)).filter(isSwapRead), "R5 holds for an empty library").toHaveLength(0);
    await suggestions(sheet).getByRole("button", { name: SHOW }).click();
    await expect(suggestions(sheet).locator("button[title]")).toHaveCount(3);
    expect((await calls(page)).filter(isSwapRead)).toHaveLength(1);
    await sheet.getByRole("link", { name: "New recipe" }).click();
    await page.waitForURL("/recipes/new");
  });

  test("the library read fails: 'Your recipes could not be loaded.', and Show suggestions still works", async ({ page, context }) => {
    await signIn(page, C1);
    await openNutrition(page, TESS);
    await context.addCookies([{ name: "evoli_fixture_recipes", value: "fail", url: page.url() }]);
    const sheet = await openSheet(page, meal(page, M_ROW));
    await expect(sheet.getByText(LOAD_FAILED, { exact: true })).toBeVisible();
    await expect(recipeRows(sheet)).toHaveCount(0);
    await suggestions(sheet).getByRole("button", { name: SHOW }).click();
    await expect(suggestions(sheet).locator("button[title]")).toHaveCount(3);
  });

  test("the link ended: pressing Show suggestions leaves for the access-lost page, as openSwap does", async ({ page, context }) => {
    await signIn(page, C1);
    await openNutrition(page, TESS);
    const sheet = await openSheet(page, meal(page, M_ROW));
    await expect(recipeRows(sheet)).toHaveCount(6);
    await context.addCookies([{ name: "evoli_fixture_link", value: "ended", url: page.url() }]);
    await suggestions(sheet).getByRole("button", { name: SHOW }).click();
    await page.waitForURL("**/clients/denied");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * AC8 — keyboard, touch, 320 px
 * ═══════════════════════════════════════════════════════════════════════════ */

/** What has focus, as a short label. */
async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return "";
    return el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText.split("\n")[0] || el.tagName;
  });
}

test.describe("AC8 — keyboard and touch", () => {
  test("Tab: search → each recipe → Show suggestions → each suggestion; Enter and Space open the confirm", async ({ page }) => {
    await signIn(page, C1);
    await openNutrition(page, TESS);
    const sheet = await openSheet(page, meal(page, M_ROW));
    await expect(sheet.getByLabel(SEARCH_LABEL)).toBeFocused();
    const order: string[] = [];
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press("Tab");
      order.push(await focused(page));
    }
    expect(order).toEqual([...SIX.map((n) => `Choose ${n}`), SHOW]);
    await page.keyboard.press("Enter");
    const candidates = suggestions(sheet).locator("button[title]");
    await expect(candidates).toHaveCount(3);
    // From the last recipe, the next stops are the suggestions.
    await recipeRows(sheet).nth(5).focus();
    const after: string[] = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Tab");
      after.push(await focused(page));
    }
    expect(after).toEqual(await candidates.evaluateAll((els) => els.map((el) => el.getAttribute("title") ?? "")));

    // Enter on a recipe → the confirm; Cancel; Space on a recipe → the confirm.
    await recipeRows(sheet).nth(3).focus();
    await page.keyboard.press("Enter");
    await expect(sheet.getByText(confirmSentence(M_NAME, "Lentil bowl", "Wednesday"), { exact: true })).toBeVisible();
    await sheet.getByRole("button", { name: "Cancel", exact: true }).click();
    await recipeRows(sheet).nth(0).focus();
    await page.keyboard.press(" ");
    await expect(sheet.getByText(confirmSentence(M_NAME, "Salmon quinoa", "Wednesday"), { exact: true })).toBeVisible();
  });

  test("every recipe and suggestion row ≥ 44 px; at 320 px no sideways scroll and a 40-character name wraps, never cut", async ({ page }) => {
    const LONG = "Smoky roasted pepper and white bean stew";
    expect(LONG).toHaveLength(40);
    await signIn(page, C1);
    // C1 writes one more recipe of its own through the editor (the six stay the seed).
    await page.goto("/recipes/new");
    const name = page.getByLabel("Recipe name");
    await expect(async () => {
      await name.fill(LONG);
      await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await page.getByLabel("Find an ingredient").fill("white");
    await page.getByRole("button", { name: "Add white beans", exact: true }).click();
    await page.getByRole("group", { name: "white beans", exact: true }).getByLabel("Quantity").fill("200");
    await page.getByLabel("Calories (kcal)").fill("420");
    await page.getByLabel("Protein (g)").fill("22");
    await page.getByLabel("Carbs (g)").fill("60");
    await page.getByLabel("Fat (g)").fill("10");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByText("Recipe saved.", { exact: true })).toBeVisible();

    await openNutrition(page, TESS);
    const sheet = await openSheet(page, meal(page, M_ROW));
    await suggestions(sheet).getByRole("button", { name: SHOW }).click();
    await expect(suggestions(sheet).locator("button[title]")).toHaveCount(3);
    const rows = sheet.locator('[data-testid="recipe-choices"] button, [data-testid="swap-suggestions-region"] button[title]');
    await expect(rows).toHaveCount(10);

    const check = async (width: number) => {
      await expectNoSidewaysScroll(page, `the swap sheet at ${width}`);
      const heights = await rows.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
      expect(heights.every((h) => h >= 44), `row heights at ${width}: ${heights.join(",")}`).toBe(true);
      const long = sheet.getByRole("button", { name: `Choose ${LONG}`, exact: true });
      const probe = await long.locator("span").first().evaluate((el) => ({
        text: el.textContent,
        cut: el.scrollWidth > el.clientWidth + 1,
        lines: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight || "18")),
        ellipsis: getComputedStyle(el).textOverflow,
      }));
      expect(probe.text, "the whole name, never truncated").toBe(LONG);
      expect(probe.cut, "no clipped overflow").toBe(false);
      expect(probe.ellipsis).not.toBe("ellipsis");
      if (width === 320) expect(probe.lines, "at 320 px the long name wraps").toBeGreaterThanOrEqual(2);
      const dir = shotDir();
      if (dir && (width === 320 || width === 1440)) await page.screenshot({ path: join(dir, `flag-on-sheet-${width}.png`) });
    };
    await atEachWidth(page, check);
    for (const width of [768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await check(width);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Edge case 5 — 100 recipes
 * ═══════════════════════════════════════════════════════════════════════════ */

test.describe("Edge case 5 — a full library", () => {
  test("100 recipes render; a keystroke filters them (time reported, gates nothing)", async ({ page }, info) => {
    await signIn(page, C100);
    await openNutrition(page, TESS);
    const sheet = await openSheet(page, meal(page, M_ROW));
    await expect(recipeRows(sheet)).toHaveCount(100);
    const ms = await page.evaluate(async () => {
      const input = document.querySelector('[role="dialog"] input') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      const t0 = performance.now();
      setter.call(input, "Batch recipe 05");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise<void>((resolve) => {
        const tick = () =>
          document.querySelectorAll('[data-testid="recipe-choices"] li').length === 10
            ? resolve()
            : requestAnimationFrame(tick);
        tick();
      });
      return performance.now() - t0;
    });
    await expect(recipeRows(sheet)).toHaveCount(10);
    info.annotations.push({ type: "keystroke-filter-ms", description: ms.toFixed(1) });
    process.stdout.write(`EV-272 edge case 5: one keystroke over 100 recipes filtered in ${ms.toFixed(1)} ms\n`);
  });
});
