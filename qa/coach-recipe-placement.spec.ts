import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { atEachWidth, expectNoSidewaysScroll, expectUnoccluded } from "./layout";

/**
 * EV-256e — "Use one of my recipes" on the portal's meal week, in **fixture mode**.
 *
 * The fixture's placement world (see the block above `VERA_ID` in
 * `src/lib/coachApi.fixture.ts`), each trainee standing for one of the story's:
 *   · Vera G. — T-veg. VEGETARIAN (not on the coach wire), Monday lunch LOCKED, Tuesday
 *     breakfast EATEN (not on the coach wire either), Wednesday dinner placed by another
 *     coach, Thursday lunch placed by this coach from a recipe since deleted.
 *   · Omar T. — T-halal.  · Lina M. — T-allergy ("Peanuts").  · Kofi A. — T-kosher.
 *   · Fay R.  — T-floor (1200; Monday 1240 kcal, Tuesday 900 kcal).
 *   · Pia O.  — placement OFF, with a recipe placed before it was switched off.
 *   · Dana W. — nothing special: the edge-case trainee.
 *
 * Every AC sentence is a LITERAL here, never imported from `copy.ts`.
 *
 * Every test starts from the fixture's SEED (`./fixture-test`, EV-223), so no test here
 * relies on another's writes. The mid-session switches (`evoli_fixture_placement`,
 * `evoli_fixture_link`) are COOKIES on one browser context, not store state: the reset
 * does not touch them, and they cannot leak into the next test's fresh context.
 *
 * `EV256E_SHOTS=<dir>` writes the evidence screenshots (390 and 1440) there.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

const VERA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0015";
const KOFI = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0016";
const FAY = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0017";
const PIA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0018";
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";
const OMAR = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0005";

const BOWL = "Chicken rice bowl";
const OATS = "Overnight oats";
const QUARK = "Quark pancakes";
const QUARK_ID = "8e3f1b22-0000-4000-8000-0000000000c3";
const WINE = "Wine-braised lentils";
/** 80 characters: the longest name the api accepts. */
const OVEN = "Oven-baked sweet potato and chickpea traybake with spinach, lemon and garlic oil";

/* ── AC sentences, verbatim ─────────────────────────────────────────────── */
const ACTION = "Use one of my recipes";
const confirmSentence = (meal: string, recipe: string, weekday: string) =>
  `Replace “${meal}” with “${recipe}” on ${weekday}?`;
// AC2's empty library ("You have no recipes yet.") is asserted in coach-recipes.spec.ts,
// after its terminal delete — the only point in the run where the library IS empty.
const excludedIngredient = (recipe: string, first: string, value: string) =>
  `“${recipe}” can't be used for ${first}: ${value} conflicts with their dietary settings.`;
const excludedName = (recipe: string, first: string) =>
  `“${recipe}” can't be used for ${first}: its name contains a word that conflicts with their dietary settings. Rename the recipe and try again.`;
const kosher = (first: string) =>
  `Recipes can't be used for ${first} yet: Evoli can't check a hand-written recipe for kosher meat-and-dairy combinations. Their generated meals are not affected.`;
const allergies = (first: string) =>
  `Recipes can't be used for ${first} yet: Evoli can't safety-check a hand-written recipe against their dietary settings. Their generated meals are not affected.`;
const belowFloor = (first: string, weekday: string, after: number, floor: number) =>
  `This would bring ${first}'s ${weekday} to ${after} kcal, below their minimum of ${floor} kcal. Choose a recipe with more calories.`;
const eaten = (first: string) => `${first} has already eaten this meal, so it can't be replaced.`;
const locked = (first: string) => `${first} has already locked this meal, so it can't be replaced.`;
const retired = (recipe: string) =>
  `“${recipe}” uses an ingredient Evoli no longer offers. Open the recipe to replace it, then try again.`;
const MEAL_CHANGED = "This meal changed. Pick it again.";
const applyWarning = (n: number, noun: "meal" | "meals", first: string) =>
  `This replaces up to ${n} ${noun} placed from coach recipes. Meals ${first} has eaten are kept.`;

test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

async function openNutrition(page: Page, id: string) {
  const res = await page.goto(`/clients/${id}/nutrition`);
  expect(res?.status()).toBe(200);
}

/** One meal row: "Wednesday Dinner". Every assertion about a meal is scoped to it. */
function meal(page: Page, name: string): Locator {
  return page.getByRole("group", { name, exact: true });
}

/** The meal's full name, from the `title` the row carries beside its truncated text. */
async function mealName(row: Locator): Promise<string> {
  const title = await row.locator("span[title]").first().getAttribute("title");
  expect(title, "the meal row carries its full name").toBeTruthy();
  return title as string;
}

/** Every meal on the page, in order, by full name. */
async function weekNames(page: Page): Promise<string[]> {
  return page
    .getByRole("button", { name: /^Swap meal: / })
    .evaluateAll((els) => els.map((el) => (el.getAttribute("aria-label") ?? "").replace("Swap meal: ", "")));
}

function actionIn(row: Locator): Locator {
  return row.getByRole("button", { name: new RegExp(`^${ACTION}: `) });
}

/**
 * Open the picker on one meal. Retried until the dialog answers, because a click
 * before hydration is a no-op (qa/warm-routes.ts) and would read as "the action does
 * nothing".
 */
async function openPicker(page: Page, row: Locator): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: ACTION });
  await expect(async () => {
    await actionIn(row).click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  return dialog;
}

async function choose(dialog: Locator, recipe: string) {
  await dialog.getByRole("button", { name: `Choose ${recipe}`, exact: true }).click();
}

/** Choose, then confirm. */
async function place(dialog: Locator, recipe: string) {
  await choose(dialog, recipe);
  await dialog.getByRole("button", { name: "Replace", exact: true }).click();
}

function shotDir(): string | null {
  const dir = process.env.EV256E_SHOTS;
  if (!dir) return null;
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function shoot(page: Page, name: string) {
  const dir = shotDir();
  if (dir) await page.screenshot({ path: join(dir, `${name}.png`), fullPage: false });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * READS on Vera — before anything writes to her week.
 * ═══════════════════════════════════════════════════════════════════════════ */

test.describe("AC1 — which meals have the action", () => {
  test("flag on: every meal the trainee has not locked has it; her locked one does not", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, VERA);

    // 7 days × 4 meals, one of them locked by Vera.
    await expect(page.getByRole("button", { name: /^Swap meal: / })).toHaveCount(28);
    await expect(page.getByRole("button", { name: new RegExp(`^${ACTION}: `) })).toHaveCount(27);

    const mondayLunch = meal(page, "Monday Lunch");
    await expect(mondayLunch.getByText("Kept", { exact: true })).toBeVisible();
    await expect(actionIn(mondayLunch)).toHaveCount(0);
    // The locked meal keeps its Swap (AC7 is how a Swap on it is answered).
    await expect(mondayLunch.getByRole("button", { name: /^Swap meal: / })).toHaveCount(1);

    // The EATEN meal (Tuesday breakfast) has the action: the coach wire has no `eaten`.
    await expect(actionIn(meal(page, "Tuesday Breakfast"))).toHaveCount(1);
    // The action names its own meal, so a screen reader hears which one.
    const name = await mealName(meal(page, "Friday Dinner"));
    await expect(actionIn(meal(page, "Friday Dinner"))).toHaveAccessibleName(`${ACTION}: ${name}`);
  });

  test("flag off: no meal has it, and a recipe placed before the switch stays as it was (edge case 14)", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, PIA);

    await expect(page.getByRole("button", { name: /^Swap meal: / })).toHaveCount(28);
    await expect(page.getByRole("button", { name: new RegExp(`^${ACTION}`) })).toHaveCount(0);
    await expect(page.getByText(ACTION, { exact: true })).toHaveCount(0);

    const placed = meal(page, "Wednesday Lunch");
    expect(await mealName(placed)).toBe(BOWL);
    await expect(placed.getByText("Your recipe", { exact: true })).toBeVisible();
  });
});

test.describe("AC4 — provenance in the coach's view", () => {
  test("'Your recipe', 'Coach recipe', and nothing on an engine meal", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, VERA);

    // Placed by this coach from a recipe that is no longer in the library.
    const mine = meal(page, "Thursday Lunch");
    await expect(mine.getByText("Your recipe", { exact: true })).toBeVisible();
    await expect(mine.getByText("Coach recipe", { exact: true })).toHaveCount(0);
    // Placed by another coach.
    const theirs = meal(page, "Wednesday Dinner");
    await expect(theirs.getByText("Coach recipe", { exact: true })).toBeVisible();
    await expect(theirs.getByText("Your recipe", { exact: true })).toHaveCount(0);
    // An engine meal.
    const engine = meal(page, "Monday Breakfast");
    await expect(engine.getByText(/recipe$/)).toHaveCount(0);

    await expect(page.getByText("Your recipe", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Coach recipe", { exact: true })).toHaveCount(1);
    await shoot(page, "vera-week-markers-default");
  });
});

test.describe("AC5 — the apply-week warning", () => {
  test("n recipe meals that are not locked: the sentence says 'up to n', and names the trainee", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, VERA);
    await page.getByRole("button", { name: "Apply to Vera G." }).click();
    const dialog = page.getByRole("dialog", { name: "Apply this meal week?" });
    await expect(dialog.getByText(applyWarning(2, "meals", "Vera"), { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("n = 0: the dialog is unchanged", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, KOFI);
    await page.getByRole("button", { name: "Apply to Kofi A." }).click();
    const dialog = page.getByRole("dialog", { name: "Apply this meal week?" });
    await expect(dialog.getByText("Meals the trainee has locked are kept.")).toBeVisible();
    await expect(dialog.getByText(/placed from coach recipes/)).toHaveCount(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * AC2 — the picker, and a placement
 * ═══════════════════════════════════════════════════════════════════════════ */

test.describe("AC2 — the picker", () => {
  test("lists the coach's recipes with name, kcal and P/C/F, and filters by name", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, VERA);
    const dialog = await openPicker(page, meal(page, "Friday Dinner"));

    const choices = dialog.getByRole("button", { name: /^Choose / });
    await expect(choices).toHaveCount(5);
    // As the api serves them: alphabetical.
    expect(await choices.evaluateAll((els) => els.map((el) => el.getAttribute("title")))).toEqual([
      BOWL,
      OVEN,
      OATS,
      QUARK,
      WINE,
    ]);
    const bowl = dialog.getByRole("button", { name: `Choose ${BOWL}`, exact: true });
    await expect(bowl).toContainText("560 kcal · P 50 g · C 62 g · F 12 g");

    await dialog.getByLabel("Filter your recipes").fill("LENTIL");
    await expect(choices).toHaveCount(1);
    await expect(dialog.getByRole("button", { name: `Choose ${WINE}`, exact: true })).toBeVisible();
    await dialog.getByLabel("Filter your recipes").fill("tahini");
    await expect(choices).toHaveCount(0);
    await expect(dialog.getByText("None of your recipes match “tahini”.")).toBeVisible();
  });

  test("choosing asks AC2's question; Replace puts the recipe on THAT meal, marked 'Your recipe', and nothing else moves", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, VERA);
    const row = meal(page, "Friday Dinner");
    const before = await weekNames(page);
    const target = await mealName(row);
    // By POSITION: meal names repeat across the week, so a name says nothing about which.
    const index = (
      await page.locator("[data-meal-id]").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))
    ).indexOf("Friday Dinner");
    expect(index).toBe(4 * 4 + 2);

    const dialog = await openPicker(page, row);
    // The dialog is about this meal and says so.
    await expect(dialog.locator(`[title="${target}"]`)).toBeVisible();
    await choose(dialog, WINE);
    await expect(dialog.getByText(confirmSentence(target, WINE, "Friday"), { exact: true })).toBeVisible();
    // "Choose another recipe" goes back without writing anything.
    await dialog.getByRole("button", { name: "Choose another recipe" }).click();
    await expect(dialog.getByRole("button", { name: /^Choose / })).toHaveCount(5);
    await place(dialog, WINE);

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row.getByText("Your recipe", { exact: true })).toBeVisible();
    expect(await mealName(row)).toBe(WINE);
    await expect(row.getByText("410 kcal · 24 g protein · 60 g carbs · 8 g fat")).toBeVisible();

    const after = await weekNames(page);
    expect(after).toHaveLength(28);
    expect(after.filter((_, i) => i !== index)).toEqual(before.filter((_, i) => i !== index));
    expect(after[index]).toBe(WINE);

    // It is the server's week, not the card's optimism.
    await page.reload();
    expect(await mealName(meal(page, "Friday Dinner"))).toBe(WINE);
    await expect(meal(page, "Friday Dinner").getByText("Your recipe", { exact: true })).toBeVisible();
    expect(await weekNames(page)).toEqual(after);
  });

  test("an 80-character recipe name: the confirm says it whole; the row shows it truncated with the full name kept", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, VERA);
    const row = meal(page, "Saturday Lunch");
    const target = await mealName(row);
    const dialog = await openPicker(page, row);
    await choose(dialog, OVEN);
    await expect(dialog.getByText(confirmSentence(target, OVEN, "Saturday"), { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Replace", exact: true }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await mealName(row)).toBe(OVEN);
    await expect(row.getByText(`${OVEN.slice(0, 39).trimEnd()}…`, { exact: true })).toBeVisible();
    await expect(row.getByText("Your recipe", { exact: true })).toBeVisible();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * AC3 — every refusal, verbatim, with the dialog left open, about the right meal
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Place `recipe` on the meal at `where`, expect the refusal `sentence` inside the
 * still-open dialog — the dialog that names THAT meal — and the week unchanged, on
 * screen and after a reload.
 */
async function expectRefused(page: Page, where: string, recipe: string, sentence: string) {
  const row = meal(page, where);
  const target = await mealName(row);
  const before = await weekNames(page);

  const dialog = await openPicker(page, row);
  await place(dialog, recipe);

  const refusal = dialog.getByRole("alert");
  await expect(refusal).toHaveText(sentence);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(`[title="${target}"]`).first()).toBeVisible();
  // Back on the list, so the coach can choose another recipe.
  await expect(dialog.getByRole("button", { name: /^Choose / }).first()).toBeVisible();

  expect(await weekNames(page)).toEqual(before);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  expect(await weekNames(page), "nothing was written").toEqual(before);
  expect(await mealName(meal(page, where))).toBe(target);
  return dialog;
}

test.describe("AC3 — the refusals", () => {
  test("COACH_MEAL_EATEN — AC1's eaten meal: offered, and refused by the api", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, VERA);
    await expectRefused(page, "Tuesday Breakfast", OATS, eaten("Vera"));
  });

  test("COACH_RECIPE_EXCLUDED, ingredient — names the ingredient, never the rule", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, VERA);
    await expectRefused(page, "Monday Dinner", BOWL, excludedIngredient(BOWL, "Vera", "chicken breast"));
    await expect(page.locator("body")).not.toContainText("VEGETARIAN");
  });

  test("COACH_RECIPE_EXCLUDED, name — T-halal", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, OMAR);
    await expectRefused(page, "Monday Breakfast", WINE, excludedName(WINE, "Omar"));
  });

  test("COACH_RECIPE_RULE_UNCHECKABLE — KOSHER", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, KOFI);
    await expectRefused(page, "Wednesday Lunch", OATS, kosher("Kofi"));
  });

  test("COACH_RECIPE_ALLERGIES_UNCHECKABLE — a typed allergy", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, LINA);
    await expectRefused(page, "Tuesday Breakfast", OATS, allergies("Lina"));
  });

  test("COACH_RECIPE_UNKNOWN_INGREDIENT at placement — a retired key, with a way to the recipe", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, VERA);
    const row = meal(page, "Sunday Breakfast");
    const dialog = await openPicker(page, row);
    await place(dialog, QUARK);
    await expect(dialog.getByRole("alert")).toContainText(retired(QUARK));
    await expect(dialog.getByRole("alert").getByRole("link", { name: "Open the recipe" })).toHaveAttribute(
      "href",
      `/recipes/${QUARK_ID}`
    );
  });

  test("COACH_RECIPE_BELOW_FLOOR — the day's own weekday and numbers; then a recipe with more calories goes on", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, FAY);
    // Monday 1240 kcal; Overnight oats (390) on the 450 lunch → 1180, under 1200 and lower.
    const row = meal(page, "Monday Lunch");
    const target = await mealName(row);
    const dialog = await openPicker(page, row);
    await place(dialog, OATS);
    await expect(dialog.getByRole("alert")).toHaveText(belowFloor("Fay", "Monday", 1180, 1200));
    expect(await mealName(row)).toBe(target);

    // AC3 tells the coach to choose one with more calories — the dialog is still there.
    await place(dialog, BOWL); // 1240 − 450 + 560 = 1350.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await mealName(row)).toBe(BOWL);
  });

  test("a day already under the floor that the recipe RAISES is accepted (the portal pre-judges nothing)", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, FAY);
    // Tuesday 900 kcal; Overnight oats (390) on the 300 lunch → 990: under 1200, higher.
    const row = meal(page, "Tuesday Lunch");
    const dialog = await openPicker(page, row);
    await place(dialog, OATS);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await mealName(row)).toBe(OATS);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * AC7 — the Swap's refusals (BUG-245; the fixture answers as the fixed api will)
 * ═══════════════════════════════════════════════════════════════════════════ */

async function expectSwapRefused(page: Page, where: string, sentence: string) {
  const row = meal(page, where);
  const target = await mealName(row);
  const before = await weekNames(page);
  const dialog = page.getByRole("dialog", { name: "Swap meal" });
  await expect(async () => {
    await row.getByRole("button", { name: /^Swap meal: / }).click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  const candidate = dialog.locator("button[title]").first();
  await candidate.click();
  await expect(dialog.getByRole("alert")).toHaveText(sentence);
  await expect(dialog).toBeVisible();
  expect(await weekNames(page)).toEqual(before);
  expect(await mealName(row)).toBe(target);
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.reload();
  expect(await weekNames(page), "nothing was written").toEqual(before);
}

test.describe("AC7 — the Swap refuses what the trainee owns", () => {
  test("409 COACH_MEAL_EATEN in the swap dialog, week unchanged", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, VERA);
    await expectSwapRefused(page, "Tuesday Breakfast", eaten("Vera"));
  });

  test("409 COACH_MEAL_LOCKED in the swap dialog, week unchanged", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, VERA);
    await expectSwapRefused(page, "Monday Lunch", locked("Vera"));
  });

  test("AC4: swapping a recipe meal away leaves an engine meal with no marker", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, VERA);
    const row = meal(page, "Thursday Lunch");
    await expect(row.getByText("Your recipe", { exact: true })).toBeVisible();
    const dialog = page.getByRole("dialog", { name: "Swap meal" });
    await expect(async () => {
      await row.getByRole("button", { name: /^Swap meal: / }).click();
      await expect(dialog).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await dialog.locator("button[title]").first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row.getByText(/recipe$/)).toHaveCount(0);
    expect(await mealName(row)).not.toBe("Chickpea and feta salad");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Edge cases the portal owns
 * ═══════════════════════════════════════════════════════════════════════════ */

test.describe("Edge cases", () => {
  test("6 — the meal was regenerated in another tab: 404, 'This meal changed. Pick it again.', and the week is re-read", async ({ browser }) => {
    const context = await browser.newContext();
    const a = await context.newPage();
    await signIn(a);
    await openNutrition(a, DANA);
    const dialog = await openPicker(a, meal(a, "Sunday Dinner"));
    await choose(dialog, OATS);

    // Another tab regenerates Sunday: every Sunday meal gets a new id.
    const b = await context.newPage();
    await openNutrition(b, DANA);
    const beforeB = await weekNames(b);
    await expect(async () => {
      await b.getByRole("button", { name: "Regenerate day: Sunday" }).click();
      await expect.poll(() => weekNames(b), { timeout: 2_000 }).not.toEqual(beforeB);
    }).toPass({ timeout: 20_000 });
    const regenerated = await weekNames(b);

    await dialog.getByRole("button", { name: "Replace", exact: true }).click();
    await expect(a.getByRole("dialog")).toHaveCount(0);
    // Filtered: Next's route announcer is also a `role="alert"` on every page.
    await expect(a.getByRole("alert").filter({ hasText: MEAL_CHANGED })).toHaveText(MEAL_CHANGED);
    // Re-read, not just re-rendered: tab A now shows what tab B produced.
    await expect.poll(() => weekNames(a)).toEqual(regenerated);
    expect(await mealName(meal(a, "Sunday Dinner"))).not.toBe(OATS);
    await context.close();
  });

  test("5 — the recipe was deleted in another tab: the 403 says so and the list forgets it", async ({ browser }) => {
    const context = await browser.newContext();
    const b = await context.newPage();
    b.on("dialog", (d) => d.accept());
    await signIn(b);
    // A recipe of this spec's own, so the library ends the file as it started.
    await b.goto("/recipes/new");
    const name = b.getByLabel("Recipe name");
    await expect(async () => {
      await name.fill("Temporary rice pot");
      await expect(b.getByText("Unsaved changes", { exact: true })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await b.getByLabel("Find an ingredient").fill("rice");
    await b.getByRole("button", { name: "Add rice", exact: true }).click();
    await b.getByRole("group", { name: "rice", exact: true }).getByLabel("Quantity").fill("100");
    await b.getByLabel("Calories (kcal)").fill("130");
    await b.getByLabel("Protein (g)").fill("3");
    await b.getByLabel("Carbs (g)").fill("28");
    await b.getByLabel("Fat (g)").fill("0");
    await b.getByRole("button", { name: "Save recipe" }).click();
    await expect(b.getByText("Recipe saved.", { exact: true })).toBeVisible();

    const a = await context.newPage();
    await openNutrition(a, DANA);
    const dialog = await openPicker(a, meal(a, "Monday Breakfast"));
    await expect(dialog.getByRole("button", { name: "Choose Temporary rice pot", exact: true })).toBeVisible();

    await b.goto("/recipes");
    await b.getByRole("group", { name: "Temporary rice pot", exact: true }).getByRole("button", { name: "Delete" }).click();
    await b.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(b.getByRole("group", { name: "Temporary rice pot", exact: true })).toHaveCount(0);

    await place(dialog, "Temporary rice pot");
    await expect(dialog.getByRole("alert")).toHaveText("That recipe is not in your library any more.");
    await expect(dialog.getByRole("button", { name: /^Choose / })).toHaveCount(5);
    await expect(dialog.getByRole("button", { name: "Choose Temporary rice pot" })).toHaveCount(0);
    await context.close();
  });

  test("14 — the flag is switched off while the picker is open: the sentence, then no action anywhere", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page);
    await openNutrition(page, DANA);
    await expect(page.getByRole("button", { name: new RegExp(`^${ACTION}: `) })).toHaveCount(28);
    const row = meal(page, "Wednesday Snack");
    const target = await mealName(row);
    const dialog = await openPicker(page, row);
    await choose(dialog, OATS);

    // The api's flag goes off (fixture switch, this context only): the POST is now an
    // unmapped 404 and the next read serves `recipePlacementEnabled: false`.
    await context.addCookies([{ name: "evoli_fixture_placement", value: "off", url: page.url() }]);
    await dialog.getByRole("button", { name: "Replace", exact: true }).click();

    await expect(dialog.getByRole("alert")).toHaveText("Recipes can't be put on meals right now.");
    // The refresh re-read the flag: the action is gone from EVERY meal, dialog or not.
    await expect(page.getByRole("button", { name: new RegExp(`^${ACTION}: `) })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect(await mealName(row), "nothing was written").toBe(target);
    await page.reload();
    await expect(page.getByRole("button", { name: /^Swap meal: / })).toHaveCount(28);
    await expect(page.getByRole("button", { name: new RegExp(`^${ACTION}`) })).toHaveCount(0);
    await context.close();
  });

  test("a 403 because the LINK ended never says the recipe is gone; the page leaves for /clients/denied", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page);
    await openNutrition(page, DANA);
    // Record every sentence the dialog ever shows, however briefly (the staff run saw
    // the wrong one FLASH before the redirect).
    // Collected on the NODE side, so a navigation cannot erase what was seen.
    const seen: string[] = [];
    await page.exposeFunction("__sawRefusal", (text: string) => void seen.push(text));
    await page.evaluate(() => {
      const report = (window as unknown as { __sawRefusal: (t: string) => void }).__sawRefusal;
      new MutationObserver(() => {
        document
          .querySelectorAll('[data-testid="placement-refusal"]')
          .forEach((el) => report(el.textContent ?? ""));
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    const dialog = await openPicker(page, meal(page, "Thursday Dinner"));
    await choose(dialog, OATS);

    // The trainee revokes (fixture switch, this context only): every trainee read is 403.
    await context.addCookies([{ name: "evoli_fixture_link", value: "ended", url: page.url() }]);
    await dialog.getByRole("button", { name: "Replace", exact: true }).click();

    await page.waitForURL("**/clients/denied");
    expect(seen.join(" | ")).not.toContain("That recipe is not in your library any more.");
    await context.close();
  });

  test("AC5 singular: one recipe meal reads 'up to 1 meal'", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, DANA);
    const dialog = await openPicker(page, meal(page, "Monday Lunch"));
    await place(dialog, OATS);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Apply to Dana W." }).click();
    const apply = page.getByRole("dialog", { name: "Apply this meal week?" });
    await expect(apply.getByText(applyWarning(1, "meal", "Dana"), { exact: true })).toBeVisible();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Layout and touch targets — 320 → 1440, the longest recipe name the api accepts
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Controls, plus the anchors INSIDE the dialog (the empty library's "New recipe" and a
 * refusal's "Open the recipe" act as controls there). Anchors elsewhere follow
 * coach-a11y-targets.spec.ts's rule — inline links are exempt — which is why the shell's
 * nav links are not measured here (they are 34 px tall; not this row's to change).
 */
async function undersized(scope: Locator | Page) {
  return await scope.locator("button, input, select, textarea, [role='dialog'] a").evaluateAll((els) =>
    els
      .map((el) => {
        const box = el.getBoundingClientRect();
        return {
          what: `${el.tagName.toLowerCase()}:${el.getAttribute("aria-label") || (el as HTMLElement).innerText || "?"}`.slice(0, 60),
          w: Math.round(box.width),
          h: Math.round(box.height),
        };
      })
      .filter((c) => c.w > 0 && c.h > 0)
      .filter((c) => c.h < 44 || c.w < 44)
  );
}

test.describe("Layout — no sideways scroll, 44 px targets, nothing painted over", () => {
  const WIDE = [768, 1024, 1440];

  test("the week with long recipe names, the picker, the confirm and a refusal, 320 → 1440", async ({ page }) => {
    await signIn(page);
    await openNutrition(page, VERA);
    const row = meal(page, "Saturday Lunch");
    // The AC2 test put the 80-character recipe here; run alone, this test puts it there.
    if ((await mealName(row)) !== OVEN) {
      await place(await openPicker(page, row), OVEN);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    expect(await mealName(row)).toBe(OVEN);

    const check = async (label: string) => {
      await expectNoSidewaysScroll(page, label);
      expect(await undersized(page), `${label} at ${page.viewportSize()?.width}px`).toEqual([]);
    };

    const sweep = async (body: (width: number) => Promise<void>) => {
      await atEachWidth(page, body);
      for (const width of WIDE) {
        await page.setViewportSize({ width, height: 900 });
        await body(width);
      }
    };

    // The week: the row with the long name, its marker and its two actions.
    await sweep(async (width) => {
      await check("the meal week");
      await expectUnoccluded(page, actionIn(row), {
        over: row.getByRole("button", { name: /^Swap meal: / }),
        label: `${ACTION} beside Swap`,
      });
      await expectUnoccluded(page, row.getByText("Your recipe", { exact: true }), {
        over: row.locator("span[title]").first(),
        label: "the marker beside the long name",
      });
      if (width === 390 || width === 1440) await shoot(page, `week-${width}`);
    });

    // The picker list, with the 80-character name in it.
    const dialog = await openPicker(page, meal(page, "Sunday Lunch"));
    await sweep(async (width) => {
      await check("the picker");
      await expectUnoccluded(page, dialog.getByRole("button", { name: `Choose ${OVEN}`, exact: true }), {
        label: "the long recipe row",
      });
      if (width === 390 || width === 1440) await shoot(page, `picker-${width}`);
    });

    // The confirm, naming the long recipe.
    await choose(dialog, OVEN);
    await sweep(async (width) => {
      await check("the confirm");
      await expectUnoccluded(page, dialog.getByRole("button", { name: "Replace", exact: true }), {
        over: dialog.getByRole("button", { name: "Choose another recipe" }),
        label: "Replace beside Choose another recipe",
      });
      if (width === 390 || width === 1440) await shoot(page, `confirm-${width}`);
    });
    await dialog.getByRole("button", { name: "Choose another recipe" }).click();

    // A refusal naming a recipe (the chicken one, for a vegetarian).
    await place(dialog, BOWL);
    await expect(dialog.getByRole("alert")).toBeVisible();
    await sweep(async (width) => {
      await check("a refusal");
      if (width === 390 || width === 1440) await shoot(page, `refusal-${width}`);
    });
  });
});
