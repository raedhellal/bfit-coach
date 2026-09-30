import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { atEachWidth, expectNoSidewaysScroll, expectUnoccluded } from "./layout";
import { en } from "../src/lib/copy";
import {
  addressOf,
  effectiveSlots,
  forSave,
  localProblems,
  recipeFieldOf,
  serverProblem,
  slotsForSave,
  type RecipeDraft,
} from "../src/lib/recipeDocument";

/**
 * EV-320c (provisional ID; the story's portal row is EV-320b) — meal-slot tags on the
 * coach's recipes, in fixture mode. The api half is EV-320a (b-fit-api `0d58432`):
 *   · `mealSlots` is 1..4 of BREAKFAST | LUNCH | DINNER | SNACK, `[]` is a 400;
 *   · `null` on a read is UNTAGGED, and the week fill uses it for LUNCH + DINNER;
 *   · omitted on CREATE → untagged; omitted on UPDATE → the stored tags are KEPT.
 *
 * The fixture ports those semantics from the Java and seeds the default library with:
 *   Chicken rice bowl → null (untagged) · Overnight oats → BREAKFAST, SNACK
 *   · Quark pancakes → BREAKFAST · Wine-braised lentils → DINNER
 *   · the 80-character traybake → LUNCH, DINNER (explicit, so it is NOT "(default)").
 *
 * Sentences are LITERALS, never imported from `copy.ts` (the pure section imports `en`
 * only to pass it to the module under test, and asserts literals).
 */

const BOWL = "Chicken rice bowl";
const OATS = "Overnight oats";
const QUARK = "Quark pancakes";
const WINE = "Wine-braised lentils";
const OVEN = "Oven-baked sweet potato and chickpea traybake with spinach, lemon and garlic oil";
const BOWL_ID = "8e3f1b22-0000-4000-8000-0000000000c1";
const OATS_ID = "8e3f1b22-0000-4000-8000-0000000000c2";

/** EV-320 AC16, verbatim. */
const NONE_EN = "Choose at least one meal type.";
const NONE_FR = "Choisissez au moins un type de repas.";
const UNTAGGED_NOTE = "No meal time saved yet: this recipe is used for lunch and dinner by default.";

async function signIn(page: Page, email = "coach@evoli.fit") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

function row(page: Page, name: string): Locator {
  return page.getByRole("group", { name, exact: true });
}

function chips(page: Page, heading = "Meal times"): Locator {
  return page.getByRole("group", { name: heading, exact: true });
}

/** The chips that are ON, read from the island's own statement of what it drew. */
async function pressed(page: Page, heading = "Meal times"): Promise<string[]> {
  return chips(page, heading)
    .getByRole("button", { pressed: true })
    .evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim()));
}

/** A library row's badge list: what it says, and the value it drew (`data-*`). */
async function badges(page: Page, name: string) {
  const list = row(page, name).getByTestId("recipe-slots");
  return {
    words: await list.getByRole("listitem").evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim())),
    slots: await list.getAttribute("data-slots"),
    isDefault: await list.getAttribute("data-default"),
  };
}

/** The recipe names listed, in order: every row is a named group, and nothing else on /recipes is. */
async function listed(page: Page): Promise<string[]> {
  return page.getByRole("group").evaluateAll((groups) => groups.map((g) => g.getAttribute("aria-label") ?? ""));
}

/**
 * Put one chip in a state, idempotently: a click before hydration does nothing and the
 * server-rendered `aria-pressed` stays, so the click is retried — never repeated once it
 * has landed (a blind retry would toggle it back).
 */
async function setChip(page: Page, name: string, on: boolean, heading = "Meal times") {
  const chip = chips(page, heading).getByRole("button", { name, exact: true });
  await expect(async () => {
    if ((await chip.getAttribute("aria-pressed")) !== String(on)) await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", String(on), { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** Choose a filter value, retried until the list has answered (a change before hydration is lost). */
async function filterBy(page: Page, value: string, expected: string[], label = "Meal time") {
  await expect(async () => {
    await page.getByLabel(label, { exact: true }).selectOption(value);
    expect(await listed(page)).toEqual(expected);
  }).toPass({ timeout: 20_000 });
}

/** See `coach-recipes.spec.ts`: an edit before hydration is lost, so retry until the island has it. */
async function firstEdit(page: Page, target: Locator, value: string, badge = "Unsaved changes") {
  await expect(async () => {
    await target.fill(value);
    await expect(page.getByText(badge, { exact: true })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** Wait for the save's server-action POST to be ANSWERED, not for a notice already on screen. */
async function saveAndSettle(page: Page, button = "Save recipe") {
  const answered = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined
  );
  await page.getByRole("button", { name: button }).click();
  await answered;
}

/* ── the rules, without a browser ─────────────────────────────────────────── */

const filled = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({
  name: "Chicken rice bowl",
  ingredients: [{ key: "chicken_breast", label: "chicken breast", quantity: "150", unit: "g" }],
  kcal: "560",
  proteinG: "50",
  carbsG: "62",
  fatG: "12",
  steps: [],
  mealSlots: ["LUNCH", "DINNER"],
  ...over,
});

test.describe("the rules: null is untagged, and an update sends the tags only when they changed", () => {
  test("null reads as Lunch + Dinner — never as an empty list", () => {
    expect(effectiveSlots(null)).toEqual(["LUNCH", "DINNER"]);
    expect(effectiveSlots(["SNACK", "BREAKFAST"])).toEqual(["BREAKFAST", "SNACK"]);
  });

  test("a NEW recipe always sends the chips, in the api's order", () => {
    expect(slotsForSave(["SNACK", "BREAKFAST"], { recipe: "new" })).toEqual(["BREAKFAST", "SNACK"]);
    // Even the default pair: the coach saw two chips on and saved them.
    expect(forSave(filled(), { recipe: "new" }).mealSlots).toEqual(["LUNCH", "DINNER"]);
  });

  test("an UPDATE omits the KEY when the chips equal the stored tags, in any order", () => {
    const stored = { recipe: "stored", mealSlots: ["BREAKFAST", "SNACK"] } as const;
    expect(slotsForSave(["SNACK", "BREAKFAST"], { ...stored, mealSlots: [...stored.mealSlots] })).toBeUndefined();
    const body = forSave(filled({ mealSlots: ["SNACK", "BREAKFAST"] }), {
      recipe: "stored",
      mealSlots: ["BREAKFAST", "SNACK"],
    });
    // Absent, not `undefined`-valued: "omitted" is the api's keep-the-tags signal.
    expect(Object.keys(body)).not.toContain("mealSlots");
    expect(Object.keys(body).sort()).toEqual(["carbsG", "fatG", "ingredients", "kcal", "name", "proteinG", "steps"]);
  });

  test("an UNTAGGED recipe saved with its default chips stays untagged (no key sent)", () => {
    expect(slotsForSave(["LUNCH", "DINNER"], { recipe: "stored", mealSlots: null })).toBeUndefined();
    expect(slotsForSave(["DINNER"], { recipe: "stored", mealSlots: null })).toEqual(["DINNER"]);
  });

  test("an UPDATE that changed the chips sends the whole new set", () => {
    expect(slotsForSave(["BREAKFAST", "LUNCH"], { recipe: "stored", mealSlots: ["BREAKFAST", "SNACK"] })).toEqual([
      "BREAKFAST",
      "LUNCH",
    ]);
  });

  test("no chip on is AC16's reason, addressed to the chips; one chip is enough", () => {
    expect(localProblems(filled({ mealSlots: [] }), en)).toEqual([{ at: "mealSlots", message: NONE_EN }]);
    expect(localProblems(filled({ mealSlots: ["SNACK"] }), en)).toEqual([]);
  });

  test("the api's 400 naming mealSlots — either shape — lands on the chips", () => {
    expect(recipeFieldOf(null, "mealSlots must hold between 1 and 4 meal slots")).toBe("mealSlots");
    expect(recipeFieldOf(null, "mealSlots[2] must be one of BREAKFAST, LUNCH, DINNER, SNACK")).toBe("mealSlots[2]");
    expect(addressOf("mealSlots[2]")).toBe("mealSlots");
    const none = { key: null, computedKcal: null };
    for (const field of ["mealSlots", "mealSlots[0]"]) {
      expect(
        serverProblem({ code: "INVALID_FIELD", ...none, field }, { kcal: 560, ingredients: [] }, en)
      ).toEqual({ at: "mealSlots", message: "Choose one to four meal times." });
    }
  });
});

/* ── the library ──────────────────────────────────────────────────────────── */

test.describe("the library shows each recipe's meal times", () => {
  test("tagged rows show one badge per slot; an untagged row shows 'Lunch, Dinner (default)'", async ({ page }) => {
    await signIn(page);
    await page.goto("/recipes");
    await expect(row(page, OATS)).toBeVisible();

    expect(await badges(page, OATS)).toEqual({ words: ["Breakfast", "Snack"], slots: "BREAKFAST,SNACK", isDefault: "false" });
    expect(await badges(page, QUARK)).toEqual({ words: ["Breakfast"], slots: "BREAKFAST", isDefault: "false" });
    expect(await badges(page, WINE)).toEqual({ words: ["Dinner"], slots: "DINNER", isDefault: "false" });
    // null is NOT an empty list: the untagged recipe names what the fill uses it for.
    expect(await badges(page, BOWL)).toEqual({ words: ["Lunch, Dinner (default)"], slots: "LUNCH,DINNER", isDefault: "true" });
    // The same two slots tagged EXPLICITLY are two badges, and not "(default)".
    expect(await badges(page, OVEN)).toEqual({ words: ["Lunch", "Dinner"], slots: "LUNCH,DINNER", isDefault: "false" });
  });

  test("the filter uses what the fill reads: an untagged recipe is listed under Lunch and Dinner", async ({ page }) => {
    await signIn(page);
    await page.goto("/recipes");
    await expect(row(page, OATS)).toBeVisible();
    expect(await listed(page)).toEqual([BOWL, OVEN, OATS, QUARK, WINE]);

    await filterBy(page, "BREAKFAST", [OATS, QUARK]);
    await filterBy(page, "LUNCH", [BOWL, OVEN]);
    await filterBy(page, "DINNER", [BOWL, OVEN, WINE]);
    await filterBy(page, "SNACK", [OATS]);
    // The count is the LIBRARY's, not the filter's.
    await expect(page.getByTestId("recipe-count")).toHaveText("5 of 100 recipes");
    await filterBy(page, "ALL", [BOWL, OVEN, OATS, QUARK, WINE]);
  });

  test("a filter that matches nothing says so, and is not the empty-library state", async ({ page }) => {
    // C1's six recipes are all untagged (saved before V74): none is for breakfast.
    await signIn(page, "coach.c1@evoli.fit");
    await page.goto("/recipes");
    await filterBy(page, "BREAKFAST", []);
    await expect(page.getByText("No recipe for this meal time yet.", { exact: true })).toBeVisible();
    await expect(page.getByText("No recipes yet.", { exact: true })).toHaveCount(0);
    expect(await listed(page)).toEqual([]);
  });
});

/* ── the editor ───────────────────────────────────────────────────────────── */

test.describe("the editor's meal-time chips", () => {
  test("create: starts Lunch + Dinner; none on blocks Save with AC16's reason; the chosen tags are stored", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await signIn(page);
    await page.goto("/recipes/new");
    expect(await pressed(page)).toEqual(["Lunch", "Dinner"]);
    // A new recipe has no stored tags, so it has no "default" to explain.
    await expect(page.getByTestId("recipe-slots-default")).toHaveCount(0);

    await firstEdit(page, page.getByLabel("Recipe name"), "Berry skyr bowl");
    await page.getByLabel("Find an ingredient").fill("greek");
    await page.getByRole("button", { name: "Add greek yogurt", exact: true }).click();
    await row(page, "greek yogurt").getByLabel("Quantity").fill("200");
    // 4·20 + 4·30 + 9·5 = 245.
    await page.getByLabel("Calories (kcal)").fill("245");
    await page.getByLabel("Protein (g)").fill("20");
    await page.getByLabel("Carbs (g)").fill("30");
    await page.getByLabel("Fat (g)").fill("5");
    const save = page.getByRole("button", { name: "Save recipe" });
    await expect(save).toBeEnabled();

    await setChip(page, "Lunch", false);
    await setChip(page, "Dinner", false);
    expect(await pressed(page)).toEqual([]);
    await expect(save).toBeDisabled();
    const reason = page.locator('[data-field="form"]').getByText(NONE_EN, { exact: true });
    await expect(reason).toBeVisible();
    // Said ONCE on the page (under Save), and the chip group points at it.
    await expect(page.getByText(NONE_EN, { exact: true })).toHaveCount(1);
    await expect(chips(page)).toHaveAttribute("aria-describedby", "recipe-slots-reason");

    // Clicked in reverse order; drawn and stored in the api's order.
    await setChip(page, "Snack", true);
    await setChip(page, "Breakfast", true);
    await expect(reason).toHaveCount(0);
    expect(await pressed(page)).toEqual(["Breakfast", "Snack"]);
    await saveAndSettle(page);
    await expect(page.getByText("Recipe saved.", { exact: true })).toBeVisible();

    await page.reload();
    expect(await pressed(page)).toEqual(["Breakfast", "Snack"]);
    await page.goto("/recipes");
    expect(await badges(page, "Berry skyr bowl")).toEqual({
      words: ["Breakfast", "Snack"],
      slots: "BREAKFAST,SNACK",
      isDefault: "false",
    });
  });

  test("an untagged recipe shows Lunch + Dinner as the default, and a save that leaves them keeps it untagged", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await signIn(page);
    await page.goto(`/recipes/${BOWL_ID}`);
    expect(await pressed(page)).toEqual(["Lunch", "Dinner"]);
    const note = page.getByTestId("recipe-slots-default");
    await expect(note).toHaveText(UNTAGGED_NOTE);

    // Touched and restored: nothing will be sent, so the note is still true.
    await setChip(page, "Breakfast", true);
    await expect(note).toHaveCount(0);
    await setChip(page, "Breakfast", false);
    await expect(note).toHaveText(UNTAGGED_NOTE);

    await page.getByLabel("Recipe name").fill("Chicken rice bowl, less rice");
    await saveAndSettle(page);
    await expect(page.getByText("Recipe saved.", { exact: true })).toBeVisible();

    // Still UNTAGGED on the server: had the editor sent ["LUNCH","DINNER"], the row would
    // read two badges and no "(default)".
    await page.goto("/recipes");
    expect(await badges(page, "Chicken rice bowl, less rice")).toEqual({
      words: ["Lunch, Dinner (default)"],
      slots: "LUNCH,DINNER",
      isDefault: "true",
    });
  });

  test("an edit that leaves the chips alone does not overwrite tags another tab saved", async ({ page, context }) => {
    page.on("dialog", (d) => d.accept());
    await signIn(page);
    // Tab A loads Overnight oats (Breakfast, Snack)…
    await page.goto(`/recipes/${OATS_ID}`);
    expect(await pressed(page)).toEqual(["Breakfast", "Snack"]);

    // …tab B re-tags it Snack only and saves…
    const other = await context.newPage();
    other.on("dialog", (d) => d.accept());
    await other.goto(`/recipes/${OATS_ID}`);
    await setChip(other, "Breakfast", false);
    expect(await pressed(other)).toEqual(["Snack"]);
    await saveAndSettle(other);
    await expect(other.getByText("Recipe saved.", { exact: true })).toBeVisible();
    await other.close();

    // …and tab A, still showing Breakfast + Snack, saves a NAME change only.
    await firstEdit(page, page.getByLabel("Recipe name"), "Overnight oats with honey");
    await saveAndSettle(page);
    await expect(page.getByText("Recipe saved.", { exact: true })).toBeVisible();

    // The key was omitted, so the api kept tab B's tags. "Always send the full set" would
    // have put Breakfast back.
    await page.reload();
    expect(await pressed(page)).toEqual(["Snack"]);
  });

  test("changed chips are sent, and still sent after a REFUSED save", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await signIn(page);
    await page.goto(`/recipes/${OATS_ID}`);
    await setChip(page, "Snack", false);
    await setChip(page, "Lunch", true);
    expect(await pressed(page)).toEqual(["Breakfast", "Lunch"]);

    // A name the coach already uses: 409, nothing written — tags included.
    await page.getByLabel("Recipe name").fill(BOWL);
    await saveAndSettle(page);
    await expect(
      page.locator('[data-field="name"]').getByText("You already have a recipe called that.", { exact: true })
    ).toBeVisible();

    await page.getByLabel("Recipe name").fill("Overnight oats, lunch box");
    await saveAndSettle(page);
    await expect(page.getByText("Recipe saved.", { exact: true })).toBeVisible();

    await page.reload();
    expect(await pressed(page)).toEqual(["Breakfast", "Lunch"]);
    await page.goto("/recipes");
    expect(await badges(page, "Overnight oats, lunch box")).toEqual({
      words: ["Breakfast", "Lunch"],
      slots: "BREAKFAST,LUNCH",
      isDefault: "false",
    });
  });

  test("the chips are 44 px toggles, and nothing collides or scrolls sideways at 320 / 360 / 390 / 414", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await signIn(page);
    await page.goto(`/recipes/${BOWL_ID}`);
    const group = chips(page);
    for (const name of ["Breakfast", "Lunch", "Dinner", "Snack"]) {
      const box = await group.getByRole("button", { name, exact: true }).boundingBox();
      expect(box!.height, name).toBeGreaterThanOrEqual(44);
      expect(box!.width, name).toBeGreaterThanOrEqual(44);
    }
    await atEachWidth(page, async () => {
      await expectNoSidewaysScroll(page, "editor with chips");
      await expectUnoccluded(page, group.getByRole("button", { name: "Snack", exact: true }), {
        over: group.getByRole("button", { name: "Dinner", exact: true }),
        label: "Snack chip",
      });
      await expectUnoccluded(page, group.getByRole("button", { name: "Lunch", exact: true }), {
        over: group.getByRole("button", { name: "Breakfast", exact: true }),
        label: "Lunch chip",
      });
    });

    await page.goto("/recipes");
    await atEachWidth(page, async () => {
      await expectNoSidewaysScroll(page, "library with badges and the filter");
      await expectUnoccluded(page, page.getByLabel("Meal time", { exact: true }), {
        over: page.getByRole("button", { name: "New recipe" }),
        label: "filter select",
      });
      // The long-named row still has its badges inside the viewport.
      const list = row(page, OVEN).getByTestId("recipe-slots");
      const box = await list.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    });
  });
});

/* ── French ───────────────────────────────────────────────────────────────── */

test.describe("in French", () => {
  test.use({ locale: "fr-FR" });

  test("the chips, the reason, the badges and the filter read French", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await page.goto("/login");
    await page.getByLabel("E-mail").fill("coach@evoli.fit");
    await page.getByLabel("Mot de passe").fill("Password123!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("/");

    await page.goto("/recipes");
    expect(await badges(page, BOWL)).toEqual({
      words: ["Déjeuner, Dîner (par défaut)"],
      slots: "LUNCH,DINNER",
      isDefault: "true",
    });
    expect(await badges(page, OATS)).toEqual({
      words: ["Petit-déjeuner", "Collation"],
      slots: "BREAKFAST,SNACK",
      isDefault: "false",
    });
    const filter = page.getByLabel("Moment du repas", { exact: true });
    await expect(filter.locator("option")).toHaveText([
      "Tous les moments",
      "Petit-déjeuner",
      "Déjeuner",
      "Dîner",
      "Collation",
    ]);

    await page.goto("/recipes/new");
    const group = chips(page, "Moments du repas");
    await expect(group.getByRole("button")).toHaveText(["Petit-déjeuner", "Déjeuner", "Dîner", "Collation"]);
    expect(await pressed(page, "Moments du repas")).toEqual(["Déjeuner", "Dîner"]);
    await expect(
      page.getByText(
        "Quand vous appliquez une semaine de repas, cette recette ne sert que pour les repas choisis ici.",
        { exact: true }
      )
    ).toBeVisible();
    await setChip(page, "Déjeuner", false, "Moments du repas");
    await setChip(page, "Dîner", false, "Moments du repas");
    await expect(page.locator('[data-field="form"]').getByText(NONE_FR, { exact: true })).toBeVisible();

    await page.goto(`/recipes/${BOWL_ID}`);
    await expect(page.getByTestId("recipe-slots-default")).toHaveText(
      "Aucun moment enregistré pour l'instant : cette recette sert au déjeuner et au dîner par défaut."
    );
  });
});
