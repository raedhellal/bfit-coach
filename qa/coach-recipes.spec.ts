import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { atEachWidth, expectNoSidewaysScroll, expectUnoccluded } from "./layout";

/**
 * EV-256b — the coach's recipe library, in **fixture mode** (playwright.config.ts).
 *
 * The fixture ports b-fit-api `a3249bd`'s recipe rules from the Java (see the EV-256b
 * block in `src/lib/coachApi.fixture.ts`) and seeds three recipes:
 *   · "Chicken rice bowl" — EV-256a AC1's own example;
 *   · "Overnight oats";
 *   · "Quark pancakes" — holds `quark`, a key NOT in the vocabulary, standing for one the
 *     api retired after the recipe was saved. It is the only way a portal whose lines all
 *     come from search results can meet `COACH_RECIPE_UNKNOWN_INGREDIENT`.
 *
 * Every AC sentence is a LITERAL here, never imported from `copy.ts`.
 *
 * ⚠ SERIAL, and the LAST describe is TERMINAL: it deletes every recipe to reach AC1's
 * empty state. Anything that needs a populated library goes above it. Recipes read no
 * trainee, so this file is untouched by `coach-routine.spec.ts`'s process-wide revoke.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

const BOWL = "Chicken rice bowl";
const OATS = "Overnight oats";
const QUARK = "Quark pancakes";
/** BUG-244 — a realistic long name (64 characters), the kind senior-qa measured with. */
const LONG_NAME = "Slow-roasted chicken thighs with lemon, garlic and herbed quinoa";
const QUARK_ID = "8e3f1b22-0000-4000-8000-0000000000c3";

/* ── AC sentences, verbatim, as literals ──────────────────────────────────── */
const EMPTY = "No recipes yet.";
const NEW_RECIPE = "New recipe";
const TAHINI = "Evoli only lists ingredients it can safety-check, and “tahini” isn't one yet.";
const macrosSentence = (computed: number, kcal: number) =>
  `These macros add up to ${computed} kcal, not ${kcal}. Check the numbers.`;
const deleteSentence = (name: string) =>
  `Delete “${name}”? Meals you already put on a trainee's plan keep this recipe.`;
const FUTURE_ONLY =
  "Changes apply to future uses only. Meals you already placed keep the version you placed.";

test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

function row(page: Page, name: string): Locator {
  return page.getByRole("group", { name, exact: true });
}

/** The container a control and its messages live in — "next to its field" (AC4). */
function field(page: Page, address: string): Locator {
  return page.locator(`[data-field="${address}"]`);
}

/**
 * `fill()` before hydration is a no-op for React state (see qa/warm-routes.ts), and an
 * editor whose state never saw the name looks filled and behaves blank. The first edit
 * on a freshly loaded editor is therefore retried until the island reports it — the
 * "Unsaved changes" badge is the island's own statement that it has the value.
 */
async function firstEdit(page: Page, target: Locator, value: string) {
  await expect(async () => {
    await target.fill(value);
    await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** Search, then press the result for `label`. The ONLY way a line enters (AC2). */
async function addIngredient(page: Page, query: string, label: string, quantity: string) {
  await page.getByLabel("Find an ingredient").fill(query);
  await page.getByRole("button", { name: `Add ${label}`, exact: true }).click();
  await row(page, label).getByLabel("Quantity").fill(quantity);
}

async function fillMacros(page: Page, kcal: string, p: string, c: string, f: string) {
  await page.getByLabel("Calories (kcal)").fill(kcal);
  await page.getByLabel("Protein (g)").fill(p);
  await page.getByLabel("Carbs (g)").fill(c);
  await page.getByLabel("Fat (g)").fill(f);
}

/** The step texts, in the order they are on screen. */
async function stepValues(page: Page): Promise<string[]> {
  return page
    .locator('[data-field^="steps."] textarea')
    .evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));
}

/** Every rendered control under 44 px in either dimension (coach-a11y-targets.spec.ts). */
async function undersized(scope: Locator | Page) {
  return await scope.locator("button, input, select, textarea").evaluateAll((els) =>
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

test.describe("AC1 — Recipes is in the nav, and the library lists the coach's recipes", () => {
  test("Recipes sits next to Templates and opens the library", async ({ page }) => {
    await signIn(page);
    const nav = page.getByRole("navigation", { name: "Portal" });
    // "next to Templates": adjacent, immediately after it.
    await expect(nav.getByRole("link")).toHaveText(["Roster", "Templates", "Recipes"]);

    await nav.getByRole("link", { name: "Recipes" }).click();
    await page.waitForURL("/recipes");
    await expect(page.getByRole("heading", { name: "Recipes", level: 1 })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Recipes" })).toHaveAttribute("aria-current", "page");
  });

  test("the three-link nav does not collide with the header at 320 / 360 / 390 / 414", async ({ page }) => {
    await signIn(page);
    await page.goto("/recipes");
    const nav = page.getByRole("navigation", { name: "Portal" });
    const signOut = page.getByRole("button", { name: "Sign out" });
    await atEachWidth(page, async () => {
      for (const name of ["Templates", "Recipes"]) {
        await expectUnoccluded(page, nav.getByRole("link", { name }), { over: signOut, label: `${name} nav link` });
      }
      await expectNoSidewaysScroll(page, "the recipe library");
    });
  });

  test("rows are alphabetical with name, kcal, P/C/F and ingredient count, under '3 of 100 recipes'", async ({ page }) => {
    await signIn(page);
    const res = await page.goto("/recipes");
    expect(res?.status()).toBe(200);

    await expect(page.getByText("3 of 100 recipes", { exact: true })).toBeVisible();
    const order = await page
      .getByRole("group")
      .evaluateAll((groups) => groups.map((g) => g.getAttribute("aria-label") ?? ""));
    expect(order).toEqual([BOWL, OATS, QUARK]);

    const bowl = row(page, BOWL);
    await expect(bowl.getByText(BOWL, { exact: true })).toBeVisible();
    await expect(bowl.getByText("560 kcal · P 50 g · C 62 g · F 12 g", { exact: true })).toBeVisible();
    await expect(bowl.getByText("3 ingredients", { exact: true })).toBeVisible();
    await expect(bowl.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/recipes/8e3f1b22-0000-4000-8000-0000000000c1"
    );
    await expect(bowl.getByRole("button", { name: "Delete" })).toBeVisible();
    await expect(page.getByRole("button", { name: NEW_RECIPE })).toBeVisible();
  });
});

test.describe("AC2 / AC3 — the editor: ingredients only from search results", () => {
  test("typing a word and pressing Enter adds nothing; a result does", async ({ page }) => {
    await signIn(page);
    await page.goto("/recipes/new");
    const search = page.getByLabel("Find an ingredient");
    const lines = page.locator('[data-field^="ingredients."]');

    // AC2 — QA types and presses Enter. Nothing is added, for a known word or an unknown one.
    await firstEdit(page, page.getByLabel("Recipe name"), "Enter test");
    await search.fill("tahini");
    await search.press("Enter");
    await expect(page.getByText(TAHINI, { exact: true })).toBeVisible(); // AC3, verbatim
    await expect(lines).toHaveCount(0);

    await search.fill("chick");
    await expect(page.getByRole("button", { name: "Add chicken breast", exact: true })).toBeVisible();
    await search.press("Enter");
    await expect(lines).toHaveCount(0);

    // ONE announced line per search, and the result list is not itself a live region.
    await expect(page.getByRole("status").filter({ hasText: "ingredients found" })).toHaveText(
      "4 ingredients found"
    );
    await expect(page.getByTestId("ingredient-results")).not.toHaveAttribute("aria-live", /.*/);
    await expect(page.locator('[aria-live] button, [role="status"] button')).toHaveCount(0);

    // The results are exactly the api's matches — prefix matches first, and `_` is a space.
    const offered = await page.getByTestId("ingredient-results").getByRole("button").allInnerTexts();
    expect(offered).toEqual(["chicken", "chicken breast", "chicken sausage", "chickpeas"]);
    await search.fill("chicken_bre");
    await expect(page.getByTestId("ingredient-results").getByRole("button")).toHaveText(["chicken breast"]);

    await page.getByRole("button", { name: "Add chicken breast", exact: true }).click();
    await expect(lines).toHaveCount(1);
    const line = row(page, "chicken breast");
    // The new line's quantity is focused and EMPTY — no invented default.
    await expect(line.getByLabel("Quantity")).toBeFocused();
    await expect(line.getByLabel("Quantity")).toHaveValue("");
    // Each line has a quantity and a unit select offering exactly g, ml, piece.
    await expect(line.getByLabel("Unit").locator("option")).toHaveText(["g", "ml", "piece"]);

    // A picked ingredient is offered again only as "Added", never as a second line.
    await search.fill("chicken b");
    await expect(page.getByRole("button", { name: "chicken breast: Added" })).toBeDisabled();
  });

  test("zero results says AC3's sentence verbatim, quoting what was searched", async ({ page }) => {
    await signIn(page);
    await page.goto("/recipes/new");
    await firstEdit(page, page.getByLabel("Recipe name"), "Zero results");
    await page.getByLabel("Find an ingredient").fill("  tahini ");
    await expect(page.getByText(TAHINI, { exact: true })).toBeVisible();
    // …and it is the search's one announced line.
    await expect(page.getByRole("status").filter({ hasText: "tahini" })).toHaveText(TAHINI);
  });

  test("a new recipe is written, saved, and every value — steps in order — survives a reload", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await signIn(page);
    await page.goto("/recipes/new");
    // AC6's sentence is for an EXISTING recipe; a new one has no placed meals to speak of.
    await expect(page.getByText(FUTURE_ONLY, { exact: true })).toHaveCount(0);

    await firstEdit(page, page.getByLabel("Recipe name"), "Salmon quinoa");
    await addIngredient(page, "salmon", "salmon fillet", "140");
    await addIngredient(page, "quin", "quinoa", "70.5");
    await row(page, "quinoa").getByLabel("Unit").selectOption("g");
    await addIngredient(page, "lemon", "lemon", "1");
    await row(page, "lemon").getByLabel("Unit").selectOption("piece");
    // 4·42 + 4·48 + 9·18 = 522.
    await fillMacros(page, "520", "42", "48", "18");

    // Steps are added, removed, and KEEP THE ORDER they were entered in.
    for (const text of ["Rinse the quinoa.", "This one goes.", "Bake the salmon.", "Squeeze the lemon."]) {
      await page.getByRole("button", { name: "Add a step" }).click();
      const steps = page.locator('[data-field^="steps."] textarea');
      await steps.last().fill(text);
    }
    await page.getByRole("button", { name: "Remove step 2" }).click();
    await expect.poll(() => stepValues(page)).toEqual([
      "Rinse the quinoa.",
      "Bake the salmon.",
      "Squeeze the lemon.",
    ]);

    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByText("Recipe saved.", { exact: true })).toBeVisible();
    // The create became an edit: the URL names the recipe and AC6 now applies.
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
    await expect(page.getByText(FUTURE_ONLY, { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Recipe name")).toHaveValue("Salmon quinoa");
    await expect(page.locator('[data-field^="ingredients."]')).toHaveCount(3);
    await expect(row(page, "quinoa").getByLabel("Quantity")).toHaveValue("70.5");
    await expect(row(page, "lemon").getByLabel("Unit")).toHaveValue("piece");
    await expect(page.getByLabel("Calories (kcal)")).toHaveValue("520");
    await expect.poll(() => stepValues(page)).toEqual([
      "Rinse the quinoa.",
      "Bake the salmon.",
      "Squeeze the lemon.",
    ]);

    await page.goto("/recipes");
    await expect(page.getByText("4 of 100 recipes", { exact: true })).toBeVisible();
    await expect(row(page, "Salmon quinoa").getByText("520 kcal · P 42 g · C 48 g · F 18 g")).toBeVisible();
  });
});

test.describe("AC4 — refusals appear next to their field, and the form keeps what was typed", () => {
  test("the macro refusal is AC4's sentence under the macros, and nothing typed is lost", async ({ page }) => {
    await signIn(page);
    await page.goto("/recipes/new");
    await firstEdit(page, page.getByLabel("Recipe name"), "Macro check");
    await addIngredient(page, "oats", "oats", "80");
    // EV-256a AC3's refused example: computed 680, off by 180, tolerance 75.
    await fillMacros(page, "500", "30", "50", "40");
    await page.getByRole("button", { name: "Save recipe" }).click();

    const message = field(page, "macros").getByText(macrosSentence(680, 500), { exact: true });
    await expect(message).toBeVisible();
    // Next to its field: inside the macros group, and not under Save.
    await expect(field(page, "form").getByText(macrosSentence(680, 500))).toHaveCount(0);
    // The form keeps everything the coach typed.
    await expect(page.getByLabel("Recipe name")).toHaveValue("Macro check");
    await expect(row(page, "oats").getByLabel("Quantity")).toHaveValue("80");
    await expect(page.getByLabel("Calories (kcal)")).toHaveValue("500");
    await expect(page.getByLabel("Fat (g)")).toHaveValue("40");
    await expect(page).toHaveURL(/\/recipes\/new$/);
    await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();

    // Fixing the numbers clears the sentence, and the accepted example saves.
    await page.getByLabel("Fat (g)").fill("20");
    await expect(message).toHaveCount(0);
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByText("Recipe saved.", { exact: true })).toBeVisible();
  });

  test("a name the coach already uses — any case — is refused beside the name", async ({ page }) => {
    await signIn(page);
    await page.goto("/recipes/new");
    await firstEdit(page, page.getByLabel("Recipe name"), "  chicken RICE bowl ");
    await addIngredient(page, "rice", "rice", "80");
    await fillMacros(page, "300", "6", "64", "1");
    await page.getByRole("button", { name: "Save recipe" }).click();

    await expect(
      field(page, "name").getByText("You already have a recipe called that.", { exact: true })
    ).toBeVisible();
    await expect(page.getByLabel("Recipe name")).toHaveValue("  chicken RICE bowl ");
    await expect(page.getByLabel("Calories (kcal)")).toHaveValue("300");
  });

  test("a fractional macro is refused beside its field and Save is unavailable — 50.0 is fine", async ({ page }) => {
    await signIn(page);
    await page.goto("/recipes/new");
    await firstEdit(page, page.getByLabel("Recipe name"), "Whole numbers");
    await addIngredient(page, "tofu", "tofu", "200");
    await fillMacros(page, "330", "50.7", "10", "9");

    const save = page.getByRole("button", { name: "Save recipe" });
    await expect(field(page, "proteinG").getByText("Whole numbers only. Use 50 or 51.", { exact: true })).toBeVisible();
    await expect(field(page, "proteinG").getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    await expect(save).toBeDisabled();
    await expect(page.getByText("Complete the fields marked above to save.", { exact: true })).toBeVisible();

    await page.getByLabel("Protein (g)").fill("50.0");
    await expect(field(page, "proteinG").getByText(/Whole numbers only/)).toHaveCount(0);
    await expect(save).toBeEnabled();
  });

  test("the name bound counts what the api counts: 80 after trimming, an emoji is 2", async ({ page }) => {
    await signIn(page);
    await page.goto("/recipes/new");
    const name = page.getByLabel("Recipe name");
    const tooLong = field(page, "name").getByText("A recipe name is at most 80 characters.", { exact: true });

    await firstEdit(page, name, `  ${"a".repeat(80)}  `);
    await expect(tooLong).toHaveCount(0);
    await name.fill(`${"a".repeat(79)}\u{1F957}`);
    await expect(tooLong).toBeVisible();
    await name.fill(`${"a".repeat(78)}\u{1F957}`);
    await expect(tooLong).toHaveCount(0);
  });

  test("a retired ingredient: marked on load, and the api's refusal lands on THAT line", async ({ page }) => {
    await signIn(page);
    await page.goto(`/recipes/${QUARK_ID}`);
    const quark = row(page, "quark");
    await expect(quark.getByText("No longer on Evoli's list", { exact: true })).toBeVisible();

    await firstEdit(page, page.getByLabel("Recipe name"), "Quark pancakes!");
    await page.getByRole("button", { name: "Save recipe" }).click();

    const refusal = "“quark” is no longer on Evoli's ingredient list. Remove it to save.";
    await expect(quark.getByText(refusal, { exact: true })).toBeVisible();
    await expect(field(page, "form").getByText(refusal)).toHaveCount(0);
    await expect(row(page, "oats").getByText(refusal)).toHaveCount(0);

    // Removing the line is the way through, and the recipe then saves.
    await page.getByRole("button", { name: "Remove quark" }).click();
    await expect(page.getByText(refusal)).toHaveCount(0);
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByText("Recipe saved.", { exact: true })).toBeVisible();
  });
});

test.describe("AC6 and the by-id denial", () => {
  test("editing shows AC6's sentence above the form", async ({ page }) => {
    await signIn(page);
    await page.goto("/recipes/8e3f1b22-0000-4000-8000-0000000000c1");
    const sentence = page.getByText(FUTURE_ONLY, { exact: true });
    await expect(sentence).toBeVisible();
    const sentenceBox = await sentence.boundingBox();
    const nameBox = await page.getByLabel("Recipe name").boundingBox();
    expect(sentenceBox!.y).toBeLessThan(nameBox!.y);
  });

  test("an id that is not the coach's reads one sentence, never a 404", async ({ page }) => {
    await signIn(page);
    const res = await page.goto("/recipes/00000000-0000-4000-8000-000000000000");
    expect(res?.status()).toBe(200);
    await expect(page.getByText("That recipe is not in your library.", { exact: true })).toBeVisible();
    // The way back is to the recipes, not the roster.
    await expect(page.getByRole("link", { name: "Back to recipes" }).last()).toHaveAttribute("href", "/recipes");
  });

  test("a path that is not a recipe id reads the same sentence, not a load error", async ({ page }) => {
    await signIn(page);
    const res = await page.goto("/recipes/not-a-recipe");
    expect(res?.status()).toBe(200);
    await expect(page.getByText("That recipe is not in your library.", { exact: true })).toBeVisible();
    await expect(page.getByText(/could not be loaded/)).toHaveCount(0);
  });
});

test.describe("layout and touch targets", () => {
  /**
   * BUG-244 — a realistic long name widened the list's grid track to the UNWRAPPED
   * title, so the page scrolled sideways (55 px at 320) and every card was clipped on
   * its right edge. The seeded names are short, which is why the sweep below was green;
   * this test inserts the name senior-qa measured with, through the editor.
   */
  test("BUG-244: a long recipe name neither scrolls the list sideways nor clips a card", async ({ page }) => {
    await signIn(page);
    await page.goto("/recipes/new");
    await firstEdit(page, page.getByLabel("Recipe name"), LONG_NAME);
    await addIngredient(page, "chicken", "chicken breast", "150");
    await fillMacros(page, "560", "50", "62", "12");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByText("Recipe saved.", { exact: true })).toBeVisible();

    await page.goto("/recipes");
    await expect(row(page, LONG_NAME)).toBeVisible();
    await atEachWidth(page, async (width) => {
      await expectNoSidewaysScroll(page, "library with a long name");
      // No card extends past the viewport: a clipped card is the same defect even where
      // the document happens not to scroll.
      const overhang = await page
        .getByRole("list")
        .locator(":scope > li")
        .evaluateAll((items) =>
          items.map((li) => li.getBoundingClientRect().right - document.documentElement.clientWidth)
        );
      expect(overhang.length).toBeGreaterThan(0);
      expect(Math.max(...overhang), `a card overhangs the viewport at ${width}px`).toBeLessThanOrEqual(0.5);
      const long = row(page, LONG_NAME);
      await expectUnoccluded(page, long.getByRole("button", { name: "Delete" }), {
        over: long.getByRole("link", { name: "Edit" }),
        label: "long-name row Delete",
      });
    });

    // The editor titles the page with the same name.
    await row(page, LONG_NAME).getByRole("link", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { name: LONG_NAME, level: 1 })).toBeVisible();
    await atEachWidth(page, async () => {
      await expectNoSidewaysScroll(page, "editor with a long name");
    });
  });

  test("no control under 44 px on the library, the editor and its search results, at 390 px", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto("/recipes");
    expect(await undersized(page), "library").toEqual([]);

    await page.goto(`/recipes/${QUARK_ID}`);
    await firstEdit(page, page.getByLabel("Recipe name"), "Quark pancakes, measured");
    await page.getByRole("button", { name: "Add a step" }).click();
    await page.getByLabel("Find an ingredient").fill("chick");
    await expect(page.getByRole("button", { name: "Add chickpeas" })).toBeVisible();
    expect(await undersized(page), "editor with results").toEqual([]);

    await page.goto("/recipes");
    await row(page, BOWL).getByRole("button", { name: "Delete" }).click();
    expect(await undersized(page.getByRole("dialog")), "delete dialog").toEqual([]);
  });

  test("no sideways scroll, and row / line controls unoccluded, at 320 / 360 / 390 / 414", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    await signIn(page);
    await page.goto("/recipes");
    await atEachWidth(page, async () => {
      await expectNoSidewaysScroll(page, "library");
      await expectUnoccluded(page, row(page, OATS).getByRole("button", { name: "Delete" }), {
        over: row(page, OATS).getByRole("link", { name: "Edit" }),
        label: "row Delete",
      });
    });

    await page.goto("/recipes/8e3f1b22-0000-4000-8000-0000000000c2");
    await atEachWidth(page, async () => {
      await expectNoSidewaysScroll(page, "editor");
      const line = row(page, "greek yogurt");
      await expectUnoccluded(page, line.getByLabel("Unit"), { over: line.getByLabel("Quantity"), label: "unit select" });
      await expectUnoccluded(page, line.getByRole("button", { name: "Remove greek yogurt" }), {
        over: line.getByLabel("Unit"),
        label: "line Remove",
      });
      await expectUnoccluded(page, page.getByLabel("Fat (g)"), { over: page.getByLabel("Carbs (g)"), label: "fat input" });
    });
  });

  test("1440 px: nothing overflows the document", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    for (const path of ["/recipes", "/recipes/new", "/recipes/8e3f1b22-0000-4000-8000-0000000000c1"]) {
      await page.goto(path);
      await expectNoSidewaysScroll(page, path);
    }
  });
});

test.describe("AC5 — delete (TERMINAL: empties the library)", () => {
  test("the confirm reads AC5 verbatim; Cancel keeps the recipe, Delete removes it", async ({ page }) => {
    await signIn(page);
    await page.goto("/recipes");

    await row(page, OATS).getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(deleteSentence(OATS), { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(row(page, OATS)).toBeVisible();

    await row(page, OATS).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(row(page, OATS)).toHaveCount(0);
    await page.reload();
    await expect(row(page, OATS)).toHaveCount(0);
  });

  test("deleting the rest renders 'No recipes yet.' and a New recipe button", async ({ page }) => {
    await signIn(page);
    await page.goto("/recipes");
    const rows = page.getByRole("group");
    while ((await rows.count()) > 0) {
      const before = await rows.count();
      await rows.first().getByRole("button", { name: "Delete" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
      await expect(rows).toHaveCount(before - 1);
    }
    await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: NEW_RECIPE })).toBeVisible();
    await page.getByRole("button", { name: NEW_RECIPE }).click();
    await page.waitForURL("/recipes/new");
  });
});
