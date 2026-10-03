import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { signInFrench } from "./french";
import { fr } from "../src/lib/copy.fr";
import { parseTarget, readNumber, targetRefusal } from "../src/lib/numberInput";
import { localProblems, parseQuantity, readQuantity, type RecipeDraft } from "../src/lib/recipeDocument";
import { matchesMealContent, matchesQuery, recipesFor, type MealContent } from "../src/lib/recipeSearch";

/**
 * `fix/recipes-and-editor-polish` — five small rows before the 2026-10-03 demo, each with a
 * test red on `origin/main` (8a7ca50) and green on this branch:
 *
 *   EV-276  — the swap sheet's recipe search folds œ / æ and the apostrophe styles.
 *   BUG-537 — the swap sheet MARKS the recipe whose name and numbers the meal already
 *             shows (« On this meal »), so a no-op swap is not made by mistake. It stays
 *             choosable: re-placing it refreshes a meal after the recipe was edited.
 *   BUG-490 — « Durée » → « Charge et répétitions » → « Durée » keeps the seconds, and
 *             nothing is sent for them while the mode is Charge. A Move, Remove, Remove
 *             day or Replace drops them (staff S1: they must never land on ANOTHER
 *             exercise; those two tests are red on this branch's 727edfa, not on main).
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


async function signIn(page: Page, email: string) {
  await signInThroughForm(page, { email: email, password: PASSWORD });
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
 * BUG-537 — the recipe the meal already shows is marked, and still choosable
 * ═══════════════════════════════════════════════════════════════════════════ */

const LENTIL_ID = "8e3f1b22-0000-4000-8000-000000027204";
/** C1's six, in AC2's order for the meal once Lentil bowl (520 kcal) is on it. */
const SIX_AROUND_LENTIL = [
  "Lentil bowl",
  "Tofu stir-fry",
  "Crêpes aux épinards",
  "Salmon quinoa",
  "Chicken rice",
  "Overnight oats",
];

async function calls(page: Page): Promise<string[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { calls: string[] }).calls;
}

/** The recipe rows that carry the mark, by full name. */
async function markedNames(sheet: Locator): Promise<string[]> {
  return sheet
    .getByTestId("recipe-choices")
    .getByRole("button")
    .filter({ has: sheet.page().getByTestId("recipe-on-this-meal") })
    .evaluateAll((els) => els.map((el) => el.getAttribute("title") ?? ""));
}

test.describe("BUG-537 — the swap sheet marks the recipe the meal already shows", () => {
  const LENTIL = { name: "Lentil bowl", kcal: 520, proteinG: 28, carbsG: 72, fatG: 13 };
  const placed: MealContent = { ...LENTIL, provenance: "COACH_RECIPE", placedByYou: true };

  test("the rule: same name and numbers on a meal THIS coach placed", () => {
    expect(matchesMealContent(LENTIL, placed)).toBe(true);
    expect(matchesMealContent(LENTIL, null)).toBe(false);
    // An engine meal that happens to share the name and numbers.
    expect(matchesMealContent(LENTIL, { ...placed, provenance: "ENGINE", placedByYou: false })).toBe(false);
    // Another coach's placement.
    expect(matchesMealContent(LENTIL, { ...placed, placedByYou: false })).toBe(false);
    // Other numbers or another name: not what the meal shows.
    expect(matchesMealContent({ ...LENTIL, kcal: 540 }, placed)).toBe(false);
    expect(matchesMealContent({ ...LENTIL, fatG: 14 }, placed)).toBe(false);
    expect(matchesMealContent({ ...LENTIL, name: "Lentil bowl 2" }, placed)).toBe(false);
    // The ordering itself is untouched by the rule.
    expect(recipesFor([LENTIL], 600, "")).toEqual([LENTIL]);
  });

  test("placed, then reopened: all six are listed; Lentil bowl alone is marked « On this meal »", async ({ page }) => {
    await signIn(page, C1);
    const row = await placeLentilBowl(page);

    // The server's week, not the card's optimism.
    await page.reload();
    const sheet = await openSheet(page, group(page, M_ROW));
    expect(await recipeNames(sheet)).toEqual(SIX_AROUND_LENTIL);
    expect(await markedNames(sheet)).toEqual(["Lentil bowl"]);
    const lentil = sheet.getByRole("button", { name: "Choose Lentil bowl", exact: true });
    await expect(lentil).toHaveAccessibleDescription("On this meal");
    await expect(lentil.getByText("On this meal", { exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Choose Tofu stir-fry", exact: true })).not.toHaveAttribute(
      "aria-describedby",
      /.+/
    );
    expect(await mealName(row)).toBe("Lentil bowl");
  });

  test("staff S2 — the recipe edited after placing (an ingredient, macros unchanged) is still there, marked, and re-placing it writes", async ({
    page,
  }) => {
    await signIn(page, C1);
    const row = await placeLentilBowl(page);
    const mealId = await row.getAttribute("data-meal-id");

    // An ingredient quantity edited, the four numbers left alone.
    await page.goto(`/recipes/${LENTIL_ID}`);
    const quantity = page.locator('[data-field="ingredients.0"] input').first();
    const before = await quantity.inputValue();
    await expect(async () => {
      await quantity.fill(before === "321" ? "320" : "321");
      await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByText("Recipe saved.", { exact: true })).toBeVisible();
    await expect(page.getByText("Unsaved changes", { exact: true })).toHaveCount(0);

    await page.goto(`/clients/${TESS}/nutrition`);
    const sheet = await openSheet(page, group(page, M_ROW));
    expect(await recipeNames(sheet)).toEqual(SIX_AROUND_LENTIL);
    expect(await markedNames(sheet)).toEqual(["Lentil bowl"]);

    // Choosing it still goes through the confirm and places the recipe's CURRENT version.
    const placedBefore = (await calls(page)).filter((c) => c.includes("/recipe ")).length;
    await sheet.getByRole("button", { name: "Choose Lentil bowl", exact: true }).click();
    await expect(
      sheet.getByText("Replace “Lentil bowl” with “Lentil bowl” on Wednesday?", { exact: true })
    ).toBeVisible();
    await sheet.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const placements = (await calls(page)).filter((c) => c.includes("/recipe "));
    expect(placements).toHaveLength(placedBefore + 1);
    expect(placements[placements.length - 1]).toBe(
      `POST /coach-portal/clients/${TESS}/nutrition/week/meals/${mealId}/recipe ${LENTIL_ID}`
    );
    expect(await mealName(group(page, M_ROW))).toBe("Lentil bowl");
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

/**
 * Staff S1 — the stash lives in the row, and a row keyed by name + position stayed
 * mounted when ANOTHER exercise of the same name took its place. Both tests are red on
 * 727edfa (the seconds came back on the wrong Plank) and green from the fix on: a Move,
 * Remove, Remove day or Replace re-keys every row, so the stash is dropped, never moved.
 * Run in the TEMPLATE editor, which is the same component (and a new template starts with
 * two empty days, so the positions are exactly the ones the test builds).
 */
async function addTo(page: Page, dayIndex: number, name: string) {
  await page.getByRole("button", { name: "Add exercise" }).nth(dayIndex).click();
  const picker = page.getByRole("dialog");
  await picker.getByLabel("Search the catalog").fill(name);
  await picker.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(picker.getByText(`Added ${name}.`)).toBeVisible();
  await picker.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test.describe("staff S1 — a structural edit drops the stashed seconds; they never land on another exercise", () => {
  test("(A) two Planks (45 s, 60 s) in one day, both to Weight & reps, Move up, back to Duration: no swapped values", async ({
    page,
  }) => {
    await signIn(page, "coach@evoli.fit");
    await page.goto("/templates/new");
    await addTo(page, 0, "Plank");
    await addTo(page, 0, "Plank");
    const planks = group(page, "Plank");
    await expect(planks).toHaveCount(2);
    await planks.nth(0).getByLabel("Seconds").fill("45");
    await planks.nth(1).getByLabel("Seconds").fill("60");
    await planks.nth(0).getByLabel("Tracked as").selectOption("WEIGHT_REPS");
    await planks.nth(1).getByLabel("Tracked as").selectOption("WEIGHT_REPS");

    await planks.nth(1).getByRole("button", { name: "Move up: Plank" }).click();

    await planks.nth(0).getByLabel("Tracked as").selectOption("DURATION");
    await planks.nth(1).getByLabel("Tracked as").selectOption("DURATION");
    // 727edfa showed 45 on the Plank that had 60, and 60 on the one that had 45.
    await expect(planks.nth(0).getByLabel("Seconds")).toHaveValue("");
    await expect(planks.nth(1).getByLabel("Seconds")).toHaveValue("");
  });

  test("(C) a Plank on day 2 (45 s) and day 3 (20 s), both to Weight & reps, day 2 removed: day 3's Plank is not given 45", async ({
    page,
  }) => {
    await signIn(page, "coach@evoli.fit");
    await page.goto("/templates/new");
    await page.getByRole("button", { name: "Add day" }).click();
    await expect(page.getByRole("button", { name: "Add exercise" })).toHaveCount(3);
    await addTo(page, 1, "Plank");
    await addTo(page, 2, "Plank");
    const planks = group(page, "Plank");
    await expect(planks).toHaveCount(2);
    await planks.nth(0).getByLabel("Seconds").fill("45");
    await planks.nth(1).getByLabel("Seconds").fill("20");
    await planks.nth(0).getByLabel("Tracked as").selectOption("WEIGHT_REPS");
    await planks.nth(1).getByLabel("Tracked as").selectOption("WEIGHT_REPS");

    await page.getByRole("button", { name: /^Remove day/ }).nth(1).click();
    await expect(page.getByRole("button", { name: "Add exercise" })).toHaveCount(2);
    await expect(planks).toHaveCount(1);

    await planks.nth(0).getByLabel("Tracked as").selectOption("DURATION");
    // 727edfa showed 45 — the REMOVED day's number — on the remaining Plank.
    await expect(planks.nth(0).getByLabel("Seconds")).toHaveValue("");
  });

  test("an edit that moves nothing keeps the stash: a sets change, then back to Duration, is 45", async ({
    page,
  }) => {
    await signIn(page, "coach@evoli.fit");
    await page.goto("/templates/new");
    await addTo(page, 0, "Plank");
    const plank = group(page, "Plank");
    await plank.getByLabel("Seconds").fill("45");
    await plank.getByLabel("Tracked as").selectOption("WEIGHT_REPS");
    await plank.getByLabel("Sets").fill("4");
    await plank.getByLabel("Tracked as").selectOption("DURATION");
    await expect(plank.getByLabel("Seconds")).toHaveValue("45");
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

  test("staff N1 — a leading 0 is never a thousands grouping: « 0,001 » is three decimals, told the range", () => {
    for (const typed of ["0,001", "0.500", "00,500", "012.345"]) {
      expect(readQuantity(typed), typed).toEqual({ kind: "outOfRange" });
      expect(parseQuantity(typed), typed).toBeNull();
    }
    expect(localProblems(withQuantity("0,001"), fr)).toEqual([
      { at: "ingredients.0", message: `Une quantité est supérieure à 0 et au plus égale à 5${NNBSP}000, avec 2 décimales au plus.` },
    ]);
    // A 1-3 digit integer that does not start with 0 stays ambiguous.
    for (const typed of ["1,500", "10.000", "100,000"]) {
      expect(readQuantity(typed), typed).toEqual({ kind: "ambiguous" });
    }
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
