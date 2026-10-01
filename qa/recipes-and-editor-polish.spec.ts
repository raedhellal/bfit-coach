import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInFrench } from "./french";
import { fr } from "../src/lib/copy.fr";
import { parseTarget, readNumber, targetRefusal } from "../src/lib/numberInput";
import { localProblems, parseQuantity, readQuantity, type RecipeDraft } from "../src/lib/recipeDocument";
import { isMealsOwnRecipe, matchesQuery, recipesFor, type MealContent } from "../src/lib/recipeSearch";

/**
 * `fix/recipes-and-editor-polish` — five small rows before the 2026-10-03 demo, each red on
 * `origin/main` (da881af) and green on this branch:
 *
 *   EV-276  — the swap sheet's recipe search folds œ / æ and the apostrophe styles.
 *   BUG-537 — the swap sheet does not offer the meal's own recipe (a no-op swap).
 *   BUG-490 — « Durée » → « Charge et répétitions » → « Durée » keeps the seconds, and
 *             nothing is sent for them while the mode is Charge.
 *   BUG-573 — full-width / Arabic-Indic digits are told the FORMAT sentence, never
 *             "above 0" or the range. They are still refused (the reader's rules are
 *             Raed-approved; only the sentence changed).
 *   BUG-574 — a quantity « 1,500 » is told it can be read two ways, in g / ml, not the
 *             range sentence. Still refused, still never sent.
 *
 * Sentences are LITERALS, never imported for the assertion: an assertion that imports the
 * string it checks agrees with it by construction. (`fr` is imported only as the
 * dictionary `localProblems` renders with.)
 */

const PASSWORD = "Password123!";
const C1 = "coach.c1@evoli.fit";
const TESS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0019";
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const OMAR = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0005";
const CHICKEN_RICE_BOWL = "8e3f1b22-0000-4000-8000-0000000000c1";
const NNBSP = "\u202f";
const NBSP = "\u00a0";
const M_ROW = "Wednesday Lunch";

/** C1's six, in AC2's order for a 600 kcal meal. */
const SIX = ["Salmon quinoa", "Tofu stir-fry", "Chicken rice", "Lentil bowl", "Crêpes aux épinards", "Overnight oats"];

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

function group(page: Page, name: string): Locator {
  return page.getByRole("group", { name, exact: true });
}

async function mealName(row: Locator): Promise<string> {
  return (await row.locator("span[title]").first().getAttribute("title")) ?? "";
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

async function recipeNames(sheet: Locator): Promise<string[]> {
  await expect(sheet.getByLabel("Search your recipes")).toBeVisible();
  return sheet
    .getByTestId("recipe-choices")
    .getByRole("button")
    .evaluateAll((els) => els.map((el) => el.getAttribute("title") ?? ""));
}

/** C1 places Lentil bowl on Tess's Wednesday lunch, through the sheet, as a coach would. */
async function placeLentilBowl(page: Page): Promise<Locator> {
  await page.goto(`/clients/${TESS}/nutrition`);
  const row = group(page, M_ROW);
  const sheet = await openSheet(page, row);
  await sheet.getByLabel("Search your recipes").fill("lent");
  await sheet.getByRole("button", { name: "Choose Lentil bowl", exact: true }).click();
  await sheet.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await mealName(row)).toBe("Lentil bowl");
  await expect(row.getByText("Your recipe", { exact: true })).toBeVisible();
  return row;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * EV-276 — the story's fixture library and its four ACs, on the matcher
 * ═══════════════════════════════════════════════════════════════════════════ */

test.describe("EV-276 — œ / æ and apostrophe styles fold on both sides", () => {
  const LIBRARY = ["Bœuf bourguignon", "Chef\u2019s salad", "Mom's stew", "Crêpes aux épinards", "Lentil bowl"];
  const found = (query: string) => LIBRARY.filter((name) => matchesQuery(name, query));

  test("AC1 — boeuf / bœuf / BOEUF find only « Bœuf bourguignon »", () => {
    for (const query of ["boeuf", "bœuf", "BOEUF", "BŒUF"]) {
      expect(found(query), query).toEqual(["Bœuf bourguignon"]);
    }
    // æ the same way, both directions.
    expect(matchesQuery("Cæsar salad", "caesar")).toBe(true);
    expect(matchesQuery("Caesar salad", "CÆSAR")).toBe(true);
  });

  test("AC2 — chef's (straight) finds « Chef\u2019s salad »; mom\u2019s (curly) finds « Mom's stew »", () => {
    expect(found("chef's")).toEqual(["Chef\u2019s salad"]);
    expect(found("mom\u2019s")).toEqual(["Mom's stew"]);
    // The other three apostrophes the story names: U+2018, U+02BC and the backtick.
    for (const mark of ["\u2018", "\u02bc", "`"]) {
      expect(found(`chef${mark}s`), JSON.stringify(mark)).toEqual(["Chef\u2019s salad"]);
      expect(found(`mom${mark}s`), JSON.stringify(mark)).toEqual(["Mom's stew"]);
    }
  });

  test("AC3 — EV-272 AC3's examples are unchanged; AC4 — still one substring", () => {
    expect(found("crepe")).toEqual(["Crêpes aux épinards"]);
    expect(found("LENT")).toEqual(["Lentil bowl"]);
    expect(matchesQuery("Chicken rice", "  rice ")).toBe(true);
    expect(matchesQuery("Lentil bowl", "bowl oats")).toBe(false);
    expect(found("boeuf salad")).toEqual([]);
    // Nothing else folds (EV-276 NOT-list): a hyphen is not a space.
    expect(matchesQuery("Bœuf-carottes", "boeuf carottes")).toBe(false);
    expect(matchesQuery("Bœuf-carottes", "boeuf-car")).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BUG-537 — the meal's own recipe is not offered back
 * ═══════════════════════════════════════════════════════════════════════════ */

test.describe("BUG-537 — the swap sheet does not offer the meal's own recipe", () => {
  const LENTIL = { name: "Lentil bowl", kcal: 520, proteinG: 28, carbsG: 72, fatG: 13 };
  const placed: MealContent = { ...LENTIL, provenance: "COACH_RECIPE", placedByYou: true };

  test("the rule: same name and numbers on a meal THIS coach placed — anything else is a real write", () => {
    expect(isMealsOwnRecipe(LENTIL, placed)).toBe(true);
    expect(isMealsOwnRecipe(LENTIL, null)).toBe(false);
    // An engine meal that happens to share the name: placing makes it the coach's.
    expect(isMealsOwnRecipe(LENTIL, { ...placed, provenance: "ENGINE", placedByYou: false })).toBe(false);
    // Another coach's placement: placing makes it « Your recipe ».
    expect(isMealsOwnRecipe(LENTIL, { ...placed, placedByYou: false })).toBe(false);
    // The recipe edited since it was placed: placing brings the meal up to date.
    expect(isMealsOwnRecipe({ ...LENTIL, kcal: 540 }, placed)).toBe(false);
    expect(isMealsOwnRecipe({ ...LENTIL, fatG: 14 }, placed)).toBe(false);
    expect(isMealsOwnRecipe({ ...LENTIL, name: "Lentil bowl 2" }, placed)).toBe(false);
    // The ordering itself is untouched by the rule.
    expect(recipesFor([LENTIL], 600, "")).toEqual([LENTIL]);
  });

  test("placed, then reopened: Lentil bowl is not in the list; the other five are", async ({ page }) => {
    await signIn(page, C1);
    const row = await placeLentilBowl(page);

    // The server's week, not the card's optimism.
    await page.reload();
    const sheet = await openSheet(page, group(page, M_ROW));
    // The other five, in AC2's order for the meal as it now is (Lentil bowl, 520 kcal).
    expect(await recipeNames(sheet)).toEqual([
      "Tofu stir-fry",
      "Crêpes aux épinards",
      "Salmon quinoa",
      "Chicken rice",
      "Overnight oats",
    ]);
    await expect(sheet.getByRole("button", { name: "Choose Lentil bowl", exact: true })).toHaveCount(0);
    // A search that only the meal's own recipe would match says so — it is not hidden as "no recipes".
    await sheet.getByLabel("Search your recipes").fill("lent");
    await expect(sheet.getByText("No recipe matches “lent”.", { exact: true })).toBeVisible();
    expect(await mealName(row)).toBe("Lentil bowl");
  });

  test("the library's only recipe is the one on the meal: the sheet says so, not « no recipes yet »", async ({ page }) => {
    await signIn(page, C1);
    await placeLentilBowl(page);

    // Delete the other five; the placed meal keeps its content (EV-256b's promise).
    await page.goto("/recipes");
    for (const name of SIX.filter((n) => n !== "Lentil bowl")) {
      await group(page, name).getByRole("button", { name: "Delete" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
      await expect(group(page, name)).toHaveCount(0);
    }

    await page.goto(`/clients/${TESS}/nutrition`);
    const sheet = await openSheet(page, group(page, M_ROW));
    await expect(sheet.getByText("Your only recipe is already on this meal.", { exact: true })).toBeVisible();
    await expect(sheet.getByText("You have no recipes yet.", { exact: true })).toHaveCount(0);
    await expect(sheet.getByRole("link", { name: "New recipe" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^Choose / })).toHaveCount(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BUG-490 — the seconds survive a round trip through « Charge et répétitions »
 * ═══════════════════════════════════════════════════════════════════════════ */

async function addPlank(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Add exercise" }).nth(1).click();
  const picker = page.getByRole("dialog");
  await picker.getByLabel("Search the catalog").fill("Plank");
  await picker.getByRole("button", { name: /^Plank/ }).click();
  await expect(picker.getByText("Added Plank.")).toBeVisible();
  await picker.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return group(page, "Plank");
}

async function saveDraftAndReload(page: Page) {
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/^Draft saved /)).toBeVisible();
  await page.reload();
  await expect(page.getByText("Draft — not yet published")).toBeVisible();
}

test.describe("BUG-490 — Duration → Weight & reps → Duration keeps the seconds", () => {
  test("the round trip brings 45 back, and Save draft stores 45", async ({ page }) => {
    await signIn(page, "coach@evoli.fit");
    await page.goto(`/clients/${LINA}/routine`);
    await expect(page.getByText("Published plan")).toBeVisible();
    const plank = await addPlank(page);
    await plank.getByLabel("Seconds").fill("45");

    await plank.getByLabel("Tracked as").selectOption("WEIGHT_REPS");
    await expect(plank.getByLabel("Seconds")).toHaveCount(0);
    await expect(plank.getByLabel("Reps")).toBeVisible();
    await plank.getByLabel("Tracked as").selectOption("DURATION");
    await expect(plank.getByLabel("Seconds")).toHaveValue("45");

    await saveDraftAndReload(page);
    const after = group(page, "Plank");
    await expect(after.getByLabel("Tracked as")).toHaveValue("DURATION");
    await expect(after.getByLabel("Seconds")).toHaveValue("45");
  });

  test("saved while Weight & reps, the seconds are NOT sent: the reloaded row has none to bring back", async ({ page }) => {
    await signIn(page, "coach@evoli.fit");
    await page.goto(`/clients/${LINA}/routine`);
    await expect(page.getByText("Published plan")).toBeVisible();
    const plank = await addPlank(page);
    await plank.getByLabel("Seconds").fill("45");
    await plank.getByLabel("Tracked as").selectOption("WEIGHT_REPS");
    await plank.getByLabel("Reps").fill("10");

    // The fixture stores the document AS SENT; a stored 45 would come back on the switch.
    await saveDraftAndReload(page);
    const after = group(page, "Plank");
    await expect(after.getByLabel("Tracked as")).toHaveValue("WEIGHT_REPS");
    await after.getByLabel("Tracked as").selectOption("DURATION");
    await expect(after.getByLabel("Seconds")).toHaveValue("");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BUG-573 / BUG-574 — the number fields' refusal sentences
 * ═══════════════════════════════════════════════════════════════════════════ */

/** A valid recipe whose only ingredient's quantity is `quantity`. */
function draft(over: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: "Chicken rice bowl",
    ingredients: [{ key: "chicken_breast", label: "chicken breast", quantity: "150", unit: "g" }],
    kcal: "560",
    proteinG: "50",
    carbsG: "62",
    fatG: "12",
    steps: ["Cook the rice."],
    mealSlots: ["LUNCH", "DINNER"],
    ...over,
  };
}
const withQuantity = (quantity: string) =>
  draft({ ingredients: [{ key: "chicken_breast", label: "chicken breast", quantity, unit: "g" }] });

const FULL_WIDTH = "\uff11\uff18\uff10\uff10"; // full-width 1800
const ARABIC_INDIC = "\u0661\u0668\u0660\u0660"; // Arabic-Indic 1800
const EXTENDED_ARABIC = "\u06f1\u06f8\u06f0\u06f0"; // extended Arabic-Indic (Persian) 1800
const OTHER_SCRIPTS = [FULL_WIDTH, ARABIC_INDIC, EXTENDED_ARABIC, `1${ARABIC_INDIC}`];

const FORMAT_TARGET = `Saisissez un nombre entier, par exemple 1${NNBSP}800.`;
const FORMAT_QUANTITY = `Saisissez une quantité, par exemple 1${NNBSP}000 ou 12,5.`;
const ambiguousQuantity = (typed: string) =>
  `«${NBSP}${typed}${NBSP}» peut se lire de deux façons. Les quantités sont en g, ml ou pièces${NBSP}: écrivez 1${NNBSP}500 pour mille cinq cents, ou 1,5 pour un et demi.`;

test.describe("BUG-573 — digits of another script are told the format, and still refused", () => {
  test.use({ locale: "fr-FR" });
  test("the reader: malformed (a digit, no reading), never notNumber; nothing is accepted", () => {
    for (const typed of OTHER_SCRIPTS) {
      expect(readNumber(typed), JSON.stringify(typed)).toEqual({ kind: "malformed" });
      expect(parseTarget(typed), JSON.stringify(typed)).toEqual({ kind: "malformed" });
      expect(readQuantity(typed), JSON.stringify(typed)).toEqual({ kind: "malformed" });
      expect(parseQuantity(typed), JSON.stringify(typed)).toBeNull();
    }
    // No digit in ANY script stays notNumber: "above 0" / the range is still true of it.
    expect(readNumber("abc")).toEqual({ kind: "notNumber" });
    expect(readNumber("-")).toEqual({ kind: "notNumber" });
    expect(parseTarget("abc")).toEqual({ kind: "invalid" });
    const whole = parseTarget("150");
    expect(targetRefusal([parseTarget(FULL_WIDTH), whole, whole, whole])).toBe("malformed");
  });

  test("a recipe: kcal and quantity in other-script digits get the FORMAT sentences", () => {
    expect(localProblems(draft({ kcal: ARABIC_INDIC }), fr)).toEqual([
      { at: "kcal", message: FORMAT_TARGET },
    ]);
    expect(localProblems(withQuantity(FULL_WIDTH), fr)).toEqual([
      { at: "ingredients.0", message: FORMAT_QUANTITY },
    ]);
  });

  test("the targets card, in French: « \u0661\u0668\u0660\u0660 » is told the format, never « supérieur à 0 », and nothing is sent", async ({
    page,
  }) => {
    await signInFrench(page);
    await page.goto(`/clients/${OMAR}/nutrition`);
    const calories = page.getByLabel("Calories", { exact: true });
    const save = page.getByRole("button", { name: "Enregistrer les objectifs", exact: true });
    const alert = page.locator('p[role="alert"]');
    const sent: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.headers()["next-action"] !== undefined) sent.push(req.url());
    });
    for (const typed of [ARABIC_INDIC, FULL_WIDTH]) {
      await calories.fill(typed);
      await save.click();
      await expect(alert, typed).toHaveText(FORMAT_TARGET);
      await expect(page.getByText(/supérieur à 0/)).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    expect(sent, "no request may leave the browser for a refused target").toEqual([]);
  });
});

test.describe("BUG-574 — « 1,500 » as a quantity says it can be read two ways, in g / ml", () => {
  test.use({ locale: "fr-FR" });
  test("ambiguous, never sent; the sentence names the reading and the units, not the range", () => {
    for (const typed of ["1,500", "1.000", "150.000"]) {
      expect(readQuantity(typed), typed).toEqual({ kind: "ambiguous" });
      expect(parseQuantity(typed), typed).toBeNull();
      expect(localProblems(withQuantity(` ${typed} `), fr), typed).toEqual([
        { at: "ingredients.0", message: ambiguousQuantity(typed) },
      ]);
    }
    // The sentence's own examples are accepted, as written.
    expect(parseQuantity(`1${NNBSP}500`)).toBe(1500);
    expect(parseQuantity("1,5")).toBe(1.5);
    expect(parseQuantity("1.5")).toBe(1.5);
    // The range sentence keeps what IS range territory.
    expect(readQuantity("5 001")).toEqual({ kind: "outOfRange" });
  });

  test("the recipe editor, in French: « 1,500 » is refused beside the line with the ambiguity sentence; nothing is sent", async ({
    page,
  }) => {
    await signInFrench(page);
    await page.goto(`/recipes/${CHICKEN_RICE_BOWL}`);
    const quantity = page.locator('[data-field="ingredients.0"] input').first();
    const line = page.locator('[data-field="ingredients.0"]');
    const save = page.getByRole("button", { name: "Enregistrer la recette" });
    const sent: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.headers()["next-action"] !== undefined) sent.push(req.url());
    });
    await expect(async () => {
      await quantity.fill("1,500");
      await expect(line.getByText(ambiguousQuantity("1,500"), { exact: true })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await expect(line.getByText(/Une quantité est supérieure/)).toHaveCount(0);
    await expect(save).toBeDisabled();
    expect(sent).toEqual([]);
  });
});
