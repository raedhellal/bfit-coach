import { expect, type BrowserContext, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { atEachWidth, expectNoSidewaysScroll } from "./layout";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";
import { hasEngineMeal, recipeShare } from "../src/lib/recipeShare";
import type { MealWeekView, PlannedMealView } from "../src/lib/coachApi";

/**
 * EV-320 AC17 — the week view's recipe-share line, in fixture mode.
 *
 * The count is read from what b-fit-api serves on every coach meal: `provenance` and
 * `placedByYou` (`CoachMealWeekResponse`, 741ed39). The EV-320a fill writes
 * `MealProvenance.coachRecipe(applyingCoach)`, so a filled meal is `COACH_RECIPE` +
 * `placedByYou: true`. The fixture's apply runs a reduced port of the fill when the
 * context sets `evoli_fixture_recipe_fill=on` (the api's flag defaults off too).
 *
 * Worlds:
 *   · Dana — an ordinary engine week, placement ON, no locks, no allergy.
 *   · Vera — one meal of THIS coach's recipe, one a PREVIOUS coach placed.
 *   · Pia  — placement OFF (`recipePlacementEnabled: false`), one recipe meal of this coach.
 *   · Libraries by sign-in email: `coach.fill@` (12 slot-tagged recipes that cover every
 *     slot), the default coach (5 seeds, some fit), `coach.c0@` (none).
 *
 * Sentences are LITERALS.
 */

const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";
const VERA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0015";
const PIA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0018";

async function signIn(page: Page, email = "coach@evoli.fit", french = false) {
  await signInThroughForm(page, { email, password: "Password123!", lang: french ? "fr" : "en" });
}

async function fillOn(context: BrowserContext, page: Page) {
  await context.addCookies([{ name: "evoli_fixture_recipe_fill", value: "on", url: page.url() }]);
}

/** Apply the current week through the UI, retried until the dialog opens (hydration). */
async function applyWeek(page: Page, french = false) {
  const open = page.getByRole("button", { name: french ? /^Appliquer à / : /^Apply to / });
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    await open.click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  const answered = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined
  );
  await dialog.getByRole("button", { name: french ? "Appliquer" : "Apply", exact: true }).click();
  await answered;
  await expect(dialog).toHaveCount(0);
}

function line(page: Page) {
  return page.getByTestId("recipe-share");
}

/** The drawn numbers, as the line states them. */
async function drawn(page: Page) {
  return {
    n: Number(await line(page).getAttribute("data-recipe-meals")),
    m: Number(await line(page).getAttribute("data-total-meals")),
  };
}

/* ── the count, without a browser ─────────────────────────────────────────── */

const meal = (over: Partial<PlannedMealView>): PlannedMealView => ({
  mealId: "m",
  slot: "LUNCH",
  name: "x",
  kcal: 500,
  proteinG: 30,
  carbsG: 50,
  fatG: 15,
  locked: false,
  provenance: "ENGINE",
  placedByYou: false,
  ...over,
});

test.describe("the count", () => {
  test("counts the viewing coach's recipe meals only, over every meal of the week", () => {
    const week: MealWeekView = {
      weekStart: "2026-09-28",
      status: "ACTIVE",
      days: [
        {
          index: 0,
          date: "2026-09-28",
          trainingDay: true,
          meals: [
            meal({ provenance: "COACH_RECIPE", placedByYou: true }),
            // Another coach's recipe: COACH_RECIPE, but not "your recipes".
            meal({ provenance: "COACH_RECIPE", placedByYou: false }),
            meal({}),
          ],
        },
        { index: 1, date: "2026-09-29", trainingDay: false, meals: [meal({ provenance: "COACH_RECIPE", placedByYou: true })] },
      ],
    };
    expect(recipeShare(week)).toEqual({ recipeMeals: 2, totalMeals: 4 });
    expect(recipeShare(null)).toEqual({ recipeMeals: 0, totalMeals: 0 });
  });

  test("the sentences, both locales, verb agreeing with n", () => {
    expect(en.nutrition.recipeShare(0, 28)).toBe("0 of 28 meals come from your recipes");
    expect(en.nutrition.recipeShare(1, 28)).toBe("1 of 28 meals comes from your recipes");
    expect(en.nutrition.recipeShare(17, 28)).toBe("17 of 28 meals come from your recipes");
    expect(en.nutrition.recipeShareAll).toBe("The whole week comes from your recipes");
    expect(fr.nutrition.recipeShare(0, 28)).toBe("0 repas sur 28 vient de vos recettes");
    expect(fr.nutrition.recipeShare(1, 28)).toBe("1 repas sur 28 vient de vos recettes");
    expect(fr.nutrition.recipeShare(17, 28)).toBe("17 repas sur 28 viennent de vos recettes");
    expect(fr.nutrition.recipeShareAll).toBe("Toute la semaine vient de vos recettes");
  });
});

/* ── on the week view ─────────────────────────────────────────────────────── */

test.describe("the week view's line (AC17)", () => {
  test("an engine week reads '0 of 28' — the zero is shown, not hidden", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${DANA}/nutrition`);
    await expect(line(page)).toHaveText("0 of 28 meals come from your recipes");
    expect(await drawn(page)).toEqual({ n: 0, m: 28 });
  });

  test("a previous coach's recipe is not counted as yours", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${VERA}/nutrition`);
    // Vera's week holds one "Your recipe" and one "Coach recipe".
    await expect(page.getByText("Your recipe", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Coach recipe", { exact: true })).toHaveCount(1);
    await expect(line(page)).toHaveText("1 of 28 meals comes from your recipes");
  });

  test("hidden while recipe placement is off, even over a week that holds your recipe", async ({ page, context }) => {
    await signIn(page);
    await page.goto(`/clients/${PIA}/nutrition`);
    await expect(page.getByText("Your recipe", { exact: true })).toHaveCount(1);
    await expect(line(page)).toHaveCount(0);

    // The server-wide flag switched off for Dana too: the line goes with it.
    await page.goto(`/clients/${DANA}/nutrition`);
    await expect(line(page)).toBeVisible();
    await context.addCookies([{ name: "evoli_fixture_placement", value: "off", url: page.url() }]);
    await page.reload();
    await expect(page.getByRole("button", { name: /^Apply to / })).toBeVisible();
    await expect(line(page)).toHaveCount(0);
  });

  test("shown on an ACTIVE week only: hidden on a GENERATING, REFUSED or ARCHIVED one", async ({ page, context }) => {
    await signIn(page);
    await page.goto(`/clients/${VERA}/nutrition`);
    await expect(line(page)).toHaveText("1 of 28 meals comes from your recipes");
    for (const status of ["GENERATING", "REFUSED", "ARCHIVED"]) {
      await context.addCookies([{ name: "evoli_fixture_week_status", value: status, url: page.url() }]);
      await page.reload();
      // The week itself is still on screen — only the line is withheld.
      await expect(page.getByText("Your recipe", { exact: true })).toHaveCount(1);
      await expect(line(page), status).toHaveCount(0);
    }
    await context.clearCookies({ name: "evoli_fixture_week_status" });
    await page.reload();
    await expect(line(page)).toHaveText("1 of 28 meals comes from your recipes");
  });

  test("after Apply with a library that covers every slot: 'The whole week comes from your recipes'", async ({ page, context }) => {
    await signIn(page, "coach.fill@evoli.fit");
    await fillOn(context, page);
    await page.goto(`/clients/${DANA}/nutrition`);
    await expect(line(page)).toHaveText("0 of 28 meals come from your recipes");

    await applyWeek(page);
    await expect(line(page)).toHaveText("The whole week comes from your recipes");
    expect(await drawn(page)).toEqual({ n: 28, m: 28 });
    await expect(page.getByText("Your recipe", { exact: true })).toHaveCount(28);

    // The read agrees with the apply response.
    await page.reload();
    await expect(line(page)).toHaveText("The whole week comes from your recipes");
  });

  test("after Apply with a partial library: '{n} of 28', n equal to the 'Your recipe' markers", async ({ page, context }) => {
    await signIn(page);
    await fillOn(context, page);
    await page.goto(`/clients/${DANA}/nutrition`);
    await applyWeek(page);
    await expect.poll(async () => (await drawn(page)).n).toBeGreaterThan(0);
    const { n, m } = await drawn(page);
    expect(m).toBe(28);
    expect(n).toBeLessThan(28);
    await expect(page.getByText("Your recipe", { exact: true })).toHaveCount(n);
    await expect(line(page)).toHaveText(`${n} of 28 meals ${n === 1 ? "comes" : "come"} from your recipes`);
  });

  test("after Apply with an empty library, or with the fill off: '0 of 28'", async ({ page, context }) => {
    await signIn(page, "coach.c0@evoli.fit");
    await fillOn(context, page);
    await page.goto(`/clients/${DANA}/nutrition`);
    await applyWeek(page);
    await expect(line(page)).toHaveText("0 of 28 meals come from your recipes");
  });

  test("with the fill flag off, an apply is engine-only and the line says so", async ({ page }) => {
    await signIn(page, "coach.fill@evoli.fit");
    await page.goto(`/clients/${DANA}/nutrition`);
    await applyWeek(page);
    await expect(page.getByText("Your recipe", { exact: true })).toHaveCount(0);
    await expect(line(page)).toHaveText("0 of 28 meals come from your recipes");
  });

  test("the line wraps inside the card at 320 / 360 / 390 / 414", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${VERA}/nutrition`);
    await atEachWidth(page, async () => {
      await expectNoSidewaysScroll(page, "nutrition week with the recipe line");
      const box = await line(page).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    });
  });
});

test.describe("in French", () => {
  test.use({ locale: "fr-FR" });

  test("zero, one, some and the whole week read French", async ({ page, context }) => {
    await signIn(page, "coach.fill@evoli.fit", true);
    await page.goto(`/clients/${VERA}/nutrition`);
    // The fixture has one coach identity; the email only picks the recipe LIBRARY.
    await expect(line(page)).toHaveText("1 repas sur 28 vient de vos recettes");

    await page.goto(`/clients/${DANA}/nutrition`);
    await expect(line(page)).toHaveText("0 repas sur 28 vient de vos recettes");

    await fillOn(context, page);
    await applyWeek(page, true);
    await expect(line(page)).toHaveText("Toute la semaine vient de vos recettes");
  });

  test("a partial fill uses the plural", async ({ page, context }) => {
    await signIn(page, "coach@evoli.fit", true);
    await fillOn(context, page);
    await page.goto(`/clients/${DANA}/nutrition`);
    await applyWeek(page, true);
    await expect.poll(async () => (await drawn(page)).n).toBeGreaterThan(1);
    const { n } = await drawn(page);
    expect(n).toBeLessThan(28);
    await expect(line(page)).toHaveText(`${n} repas sur 28 viennent de vos recettes`);
  });
});

/* ── EV-320b follow-up: the English-only note (Raed, 2026-09-30), split by BUG-536 ──
 * EV-185 AC3's note holds two claims with two rules:
 *   · "Meal plans are generated in English." is about the ENGINE's meal text. It is shown
 *     while the week holds at least one engine meal, and hidden when every meal is a coach
 *     recipe (any coach's: the words are a coach's own, whoever placed them).
 *   · "Ingredient checks run on the English names." is about the allergy and diet checks,
 *     which read the English ingredient names on EVERY week (BUG-536). Before the split it
 *     was hidden with the first sentence on an all-recipe week, though still true.
 * On an engine or mixed week the paragraph reads AC3's two sentences exactly as before.
 */

const GENERATED_EN = "Meal plans are generated in English.";
const CHECKS_EN = "Ingredient checks run on the English names.";
const NOTE_EN = `${GENERATED_EN} ${CHECKS_EN}`;
const GENERATED_FR = "Les plans de repas sont générés en anglais.";
const CHECKS_FR = "Les vérifications d'ingrédients portent sur les noms anglais.";
const NOTE_FR = `${GENERATED_FR} ${CHECKS_FR}`;

/**
 * Read by TEXT, not by a test id, so the same assertions run on the code before the split
 * (6caecb8): there the engine-week checks pass and only the all-recipe ones fail, on the
 * behaviour BUG-536 is about. `exact` matches the paragraph (both sentences) or, alone on
 * a week of coach recipes, the checks sentence.
 */
function sentence(page: Page, text: string) {
  return page.getByText(text, { exact: true });
}

test.describe("the English-only note follows the engine's meals", () => {
  test("the rule: any engine meal keeps it; a week of coach recipes — any coach's — drops it", () => {
    const day = (meals: PlannedMealView[]) => ({ index: 0, date: "2026-09-28", trainingDay: true, meals });
    const week = (meals: PlannedMealView[]): MealWeekView => ({ weekStart: "2026-09-28", status: "ACTIVE", days: [day(meals)] });
    const mine = meal({ provenance: "COACH_RECIPE", placedByYou: true });
    const previousCoach = meal({ provenance: "COACH_RECIPE", placedByYou: false });
    expect(hasEngineMeal(week([mine, previousCoach]))).toBe(false);
    expect(hasEngineMeal(week([mine, meal({})]))).toBe(true);
    // A provenance the api did not send counts as the engine's: the note stays.
    expect(hasEngineMeal(week([mine, { ...mine, provenance: undefined as unknown as "ENGINE" }]))).toBe(true);
    // No week yet: the next Apply writes engine meals, so the note still applies.
    expect(hasEngineMeal(null)).toBe(true);
  });

  test("an engine-only week shows both sentences, as AC3 words them", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${DANA}/nutrition`);
    await expect(sentence(page, NOTE_EN)).toBeVisible();
    await expect(page.getByText(NOTE_EN)).toHaveCount(1);
  });

  test("a mixed week shows both sentences", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${VERA}/nutrition`);
    await expect(page.getByText("Your recipe", { exact: true })).toHaveCount(1);
    await expect(sentence(page, NOTE_EN)).toBeVisible();
  });

  test("a week that is all coach recipes drops « generated in English », keeps the ingredient checks (BUG-536), and the footer lines stay", async ({ page, context }) => {
    await signIn(page, "coach.fill@evoli.fit");
    await fillOn(context, page);
    await page.goto(`/clients/${DANA}/nutrition`);
    await expect(sentence(page, NOTE_EN)).toBeVisible();

    await applyWeek(page);
    await expect(line(page)).toHaveText("The whole week comes from your recipes");
    await expect(page.getByText(GENERATED_EN)).toHaveCount(0);
    await expect(sentence(page, CHECKS_EN)).toBeVisible();
    await expect(page.getByText(/^Swapping a meal doesn.t use /)).toBeVisible();

    await page.reload();
    await expect(line(page)).toHaveText("The whole week comes from your recipes");
    await expect(page.getByText(GENERATED_EN)).toHaveCount(0);
    await expect(sentence(page, CHECKS_EN)).toBeVisible();
  });
});

test.describe("the English-only note, in French", () => {
  test.use({ locale: "fr-FR" });

  test("both sentences over an engine week; over a week of coach recipes only the ingredient checks (BUG-536)", async ({ page, context }) => {
    await signIn(page, "coach.fill@evoli.fit", true);
    await page.goto(`/clients/${DANA}/nutrition`);
    await expect(sentence(page, NOTE_FR)).toBeVisible();
    await fillOn(context, page);
    await applyWeek(page, true);
    await expect(line(page)).toHaveText("Toute la semaine vient de vos recettes");
    await expect(page.getByText(GENERATED_FR)).toHaveCount(0);
    await expect(sentence(page, CHECKS_FR)).toBeVisible();
  });
});
