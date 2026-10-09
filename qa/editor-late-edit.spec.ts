import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { openEveryDay } from "./day-accordion";

/**
 * BUG-735 — the training-template and recipe editors: an edit typed while the save's REQUEST
 * is in flight must stay unsaved.
 *
 * Both editors keep their text fields open during « Saving… » (the recipe editor on purpose,
 * `RecipeEditor.tsx`'s pending comment). Before the fix, any successful answer cleared the
 * unsaved flag: the late edit was shown as saved (no badge, Back left without asking) and the
 * server kept the text the request carried. The two `useCoachForm` forms already kept it
 * unsaved; these specs hold the two older editors to the same row Expected:
 *
 *   (1) after the answer the field keeps the late text AND the unsaved badge is on screen;
 *   (2) Back asks, Stay keeps the text and the URL, Leave lands on the list;
 *   (3) a second Save sends the late text, and a fresh load shows it;
 *   (4) a save with nothing typed during « Saving… » still ends clean.
 *
 * Update and create, in each editor. The create matters on its own: it hands the guard's
 * history step a `then` that STAYS (the id is set, the URL corrected with `replaceState`), so
 * a late edit there also needs the guard entry put back once that step lands.
 *
 * The answer is HELD, not slowed by a sleep: the action's POST reaches the server (the write
 * is committed), and its response is handed to the page only when the test says so, after the
 * late keystrokes are in the field. Real keystrokes, as in QA's repro.
 *
 * Out of scope here: BUG-736, a keystroke inside the save's own history step before React has
 * committed the clean render (`qa/form-leave-guard.spec.ts` holds BUG-730's side of that step).
 *
 * Copy is literal here, never imported from `src/lib/copy*.ts`.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";
const BOWL_ID = "8e3f1b22-0000-4000-8000-0000000000c1";
const SPLIT_ID = "7c2d0a11-0000-4000-8000-0000000000b1";

const UNSAVED = "Unsaved changes";
const LEAVE = "Leave with unsaved changes?";
const STAY = "Stay on this page";
const GO = "Leave without saving";
const LATE = " (typo fixed)";

interface Editor {
  list: string;
  nameLabel: string;
  save: string;
  saving: string;
  saved: string;
}

const RECIPE: Editor = {
  list: "/recipes",
  nameLabel: "Recipe name",
  save: "Save recipe",
  saving: "Saving…",
  saved: "Recipe saved.",
};
const TEMPLATE: Editor = {
  list: "/templates",
  nameLabel: "Template name",
  save: "Save template",
  saving: "Saving…",
  saved: "Template saved",
};

const leaveDialog = (page: Page) => page.getByRole("dialog", { name: LEAVE, exact: true });
const badge = (page: Page) => page.getByText(UNSAVED, { exact: true });

/**
 * Where in the session history the page stands (Chromium's Navigation API), the guard's
 * witness here. The guard holds exactly one extra entry for the page while there is unsaved
 * work, so "armed" is `start + 1` and "clean" is `start`, where `start` is read on load.
 *
 * Not `history.state.evoliUnsavedGuard`: after an update, the action's revalidated render is
 * installed by Next 14.2's `HistoryUpdater`, which `replaceState`s the CURRENT entry with
 * `{ __NA, tree }` and drops any other key (`preserveCustomHistoryState` is false for it).
 * The guard's entry is still there and still current; only the flag on it is gone.
 */
async function historyIndex(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { navigation: { currentEntry: { index: number } } }).navigation.currentEntry.index
  );
}

async function signIn(page: Page) {
  await signInThroughForm(page, { email: EMAIL, password: PASSWORD });
}

/**
 * Rename through the field until React has it: a `fill` before hydration changes the DOM
 * only, and the badge is the editor's own witness that its state took the edit.
 */
async function rename(page: Page, name: Locator, value: string) {
  await expect(async () => {
    await name.fill(value);
    await expect(badge(page)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/**
 * Press Save with the answer held. Returns `answer()`, which hands the held response to the
 * page. Only the FIRST server action after the press is held; everything else goes through.
 */
async function saveHeld(page: Page, e: Editor): Promise<{ answer: () => Promise<void> }> {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  let arrived!: () => void;
  const reached = new Promise<void>((resolve) => (arrived = resolve));
  let held = false;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (!held && request.method() === "POST" && request.headers()["next-action"] !== undefined) {
      held = true;
      // The write reaches the server now; only its answer waits.
      const response = await route.fetch();
      arrived();
      await gate;
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: e.save, exact: true }).click();
  await reached;
  await expect(page.getByRole("button", { name: e.saving, exact: true })).toBeDisabled();
  return {
    answer: async () => {
      open();
      await expect(page.getByText(e.saved, { exact: true })).toBeVisible();
      await page.unrouteAll({ behavior: "wait" });
    },
  };
}

/** Real keystrokes at the end of the name, while the answer is held. */
async function typeLate(page: Page, name: Locator, expected: string) {
  await name.click();
  await page.keyboard.press("End");
  await page.keyboard.type(LATE, { delay: 20 });
  await expect(name).toHaveValue(expected);
}

/** (1): the answer came, and what was typed after the request left is still unsaved work. */
async function lateEditStaysUnsaved(page: Page, name: Locator, late: string, start: number) {
  await expect(name).toHaveValue(late);
  await expect(badge(page), "the late edit is shown as saved").toBeVisible();
  await expect
    .poll(() => historyIndex(page), { message: "the late edit holds no guard entry: Back would leave without asking" })
    .toBe(start + 1);
}

/** (2), the Stay half: Back asks, and Stay keeps the text and the URL. */
async function backAsksAndStayKeeps(page: Page, name: Locator, late: string, start: number) {
  const url = page.url();
  await page.goBack({ timeout: 3_000 }).catch(() => null);
  await expect(leaveDialog(page), "Back over the late edit did not ask").toBeVisible();
  await leaveDialog(page).getByRole("button", { name: STAY, exact: true }).click();
  await expect(leaveDialog(page)).toHaveCount(0);
  expect(page.url()).toBe(url);
  await expect(name).toHaveValue(late);
  await expect(badge(page)).toBeVisible();
  await expect.poll(() => historyIndex(page), { message: "Stay did not put the guard entry back" }).toBe(start + 1);
}

/** (3): the next Save sends the late text and ends clean; a fresh load shows it; one Back is the list. */
async function secondSaveSendsIt(page: Page, e: Editor, name: Locator, late: string, start: number) {
  await page.getByRole("button", { name: e.save, exact: true }).click();
  await expect(page.getByText(e.saved, { exact: true })).toBeVisible();
  await expect(badge(page)).toHaveCount(0);
  await expect.poll(() => historyIndex(page), { message: "the clean save left its guard entry behind" }).toBe(start);
  await page.reload();
  await expect(page.getByLabel(e.nameLabel)).toHaveValue(late);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${e.list}$`));
  await expect(leaveDialog(page)).toHaveCount(0);
}

/** (2), the Leave half: Back asks again, Leave lands on the list in one step. */
async function leaveLandsOnTheList(page: Page, e: Editor) {
  await page.goBack({ timeout: 3_000 }).catch(() => null);
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole("button", { name: GO, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${e.list}$`));
  await expect(leaveDialog(page)).toHaveCount(0);
}

/** A new recipe the server will accept, typed into /recipes/new. */
async function fillNewRecipe(page: Page, name: Locator, value: string) {
  await rename(page, name, value);
  await page.getByLabel("Find an ingredient").fill("greek");
  await page.getByRole("button", { name: "Add greek yogurt", exact: true }).click();
  await page.getByRole("group", { name: "greek yogurt", exact: true }).getByLabel("Quantity").fill("200");
  await page.getByLabel("Calories (kcal)").fill("245");
  await page.getByLabel("Protein (g)").fill("20");
  await page.getByLabel("Carbs (g)").fill("30");
  await page.getByLabel("Fat (g)").fill("5");
}

/** A new training template the server will accept: two days of two exercises. */
async function fillNewTemplate(page: Page, name: Locator, value: string) {
  await rename(page, name, value);
  for (const day of [0, 1]) {
    await openEveryDay(page);
    await page
      .getByRole("group", { name: `Day ${day + 1}`, exact: true })
      .getByRole("button", { name: "Add exercise" })
      .click();
    const picker = page.getByRole("dialog");
    for (let i = 0; i < 2; i += 1) await picker.locator("button[title]").nth(i).click();
    await picker.getByRole("button").first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
}

test.describe("BUG-735 — an edit typed while the save is in flight stays unsaved (EN)", () => {
  test.use({ locale: "en-US" });

  test("recipe update: the late rename keeps the badge, Back asks, and the next Save sends it", async ({ page }) => {
    await signIn(page);
    await page.goto(RECIPE.list);
    await page.goto(`/recipes/${BOWL_ID}`);
    const name = page.getByLabel(RECIPE.nameLabel);
    // Where the page was loaded, read before the first keystroke arms the guard.
    const start = await historyIndex(page);
    await rename(page, name, "Chicken rice bowl v1");
    const held = await saveHeld(page, RECIPE);
    await typeLate(page, name, `Chicken rice bowl v1${LATE}`);
    await held.answer();

    await lateEditStaysUnsaved(page, name, `Chicken rice bowl v1${LATE}`, start);
    await backAsksAndStayKeeps(page, name, `Chicken rice bowl v1${LATE}`, start);
    await secondSaveSendsIt(page, RECIPE, name, `Chicken rice bowl v1${LATE}`, start);
  });

  test("recipe create: the late rename is guarded on /recipes/{id}, and Leave lands on the list", async ({ page }) => {
    await signIn(page);
    await page.goto(RECIPE.list);
    await page.goto("/recipes/new");
    const name = page.getByLabel(RECIPE.nameLabel);
    // Where the page was loaded, read before the first keystroke arms the guard.
    const start = await historyIndex(page);
    await fillNewRecipe(page, name, "Late skyr");
    const held = await saveHeld(page, RECIPE);
    await typeLate(page, name, `Late skyr${LATE}`);
    await held.answer();
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
    const created = page.url();

    await lateEditStaysUnsaved(page, name, `Late skyr${LATE}`, start);
    await backAsksAndStayKeeps(page, name, `Late skyr${LATE}`, start);
    await leaveLandsOnTheList(page, RECIPE);
    // Leave discarded the late edit, as the coach chose: the server holds what the create sent.
    await page.goto(created);
    await expect(page.getByLabel(RECIPE.nameLabel)).toHaveValue("Late skyr");
  });

  test("recipe create: the next Save after a late rename updates the one recipe it created", async ({ page }) => {
    await signIn(page);
    await page.goto(RECIPE.list);
    await page.goto("/recipes/new");
    const name = page.getByLabel(RECIPE.nameLabel);
    // Where the page was loaded, read before the first keystroke arms the guard.
    const start = await historyIndex(page);
    await fillNewRecipe(page, name, "Late quark");
    const held = await saveHeld(page, RECIPE);
    await typeLate(page, name, `Late quark${LATE}`);
    await held.answer();
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);

    await lateEditStaysUnsaved(page, name, `Late quark${LATE}`, start);
    await secondSaveSendsIt(page, RECIPE, name, `Late quark${LATE}`, start);
    await expect(page.getByRole("group", { name: `Late quark${LATE}`, exact: true })).toHaveCount(1);
    await expect(page.getByRole("group", { name: "Late quark", exact: true })).toHaveCount(0);
  });

  test("recipe update: nothing typed during « Saving… » still ends clean, and Back leaves unasked", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(RECIPE.list);
    await page.goto(`/recipes/${BOWL_ID}`);
    const name = page.getByLabel(RECIPE.nameLabel);
    // Where the page was loaded, read before the first keystroke arms the guard.
    const start = await historyIndex(page);
    await rename(page, name, "Chicken rice bowl v1");
    const held = await saveHeld(page, RECIPE);
    await held.answer();
    await expect(badge(page)).toHaveCount(0);
    await expect.poll(() => historyIndex(page), { message: "the clean save left its guard entry behind" }).toBe(start);
    await page.goBack();
    await expect(page).toHaveURL(/\/recipes$/);
    await expect(leaveDialog(page)).toHaveCount(0);
  });

  test("template update: the late rename keeps the badge, Back asks, and the next Save sends it", async ({ page }) => {
    await signIn(page);
    await page.goto(TEMPLATE.list);
    await page.goto(`/templates/${SPLIT_ID}`);
    const name = page.getByLabel(TEMPLATE.nameLabel);
    // Where the page was loaded, read before the first keystroke arms the guard.
    const start = await historyIndex(page);
    await rename(page, name, "Upper / Lower split v1");
    const held = await saveHeld(page, TEMPLATE);
    await typeLate(page, name, `Upper / Lower split v1${LATE}`);
    await held.answer();

    await lateEditStaysUnsaved(page, name, `Upper / Lower split v1${LATE}`, start);
    await backAsksAndStayKeeps(page, name, `Upper / Lower split v1${LATE}`, start);
    await secondSaveSendsIt(page, TEMPLATE, name, `Upper / Lower split v1${LATE}`, start);
  });

  test("template create: the late rename is guarded on /templates/{id}, and Leave lands on the list", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(TEMPLATE.list);
    await page.goto("/templates/new");
    const name = page.getByLabel(TEMPLATE.nameLabel);
    // Where the page was loaded, read before the first keystroke arms the guard.
    const start = await historyIndex(page);
    await fillNewTemplate(page, name, "Late create");
    const held = await saveHeld(page, TEMPLATE);
    await typeLate(page, name, `Late create${LATE}`);
    await held.answer();
    await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
    const created = page.url();

    await lateEditStaysUnsaved(page, name, `Late create${LATE}`, start);
    await backAsksAndStayKeeps(page, name, `Late create${LATE}`, start);
    await leaveLandsOnTheList(page, TEMPLATE);
    await page.goto(created);
    await expect(page.getByLabel(TEMPLATE.nameLabel)).toHaveValue("Late create");
  });

  test("template create: the next Save after a late rename updates the one template it created", async ({ page }) => {
    await signIn(page);
    await page.goto(TEMPLATE.list);
    await page.goto("/templates/new");
    const name = page.getByLabel(TEMPLATE.nameLabel);
    // Where the page was loaded, read before the first keystroke arms the guard.
    const start = await historyIndex(page);
    await fillNewTemplate(page, name, "Late build");
    const held = await saveHeld(page, TEMPLATE);
    await typeLate(page, name, `Late build${LATE}`);
    await held.answer();
    await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);

    await lateEditStaysUnsaved(page, name, `Late build${LATE}`, start);
    await secondSaveSendsIt(page, TEMPLATE, name, `Late build${LATE}`, start);
    await expect(page.getByRole("group", { name: `Late build${LATE}`, exact: true })).toHaveCount(1);
    await expect(page.getByRole("group", { name: "Late build", exact: true })).toHaveCount(0);
  });

  test("template update: nothing typed during « Saving… » still ends clean, and Back leaves unasked", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(TEMPLATE.list);
    await page.goto(`/templates/${SPLIT_ID}`);
    const name = page.getByLabel(TEMPLATE.nameLabel);
    // Where the page was loaded, read before the first keystroke arms the guard.
    const start = await historyIndex(page);
    await rename(page, name, "Upper / Lower split v1");
    const held = await saveHeld(page, TEMPLATE);
    await held.answer();
    await expect(badge(page)).toHaveCount(0);
    await expect.poll(() => historyIndex(page), { message: "the clean save left its guard entry behind" }).toBe(start);
    await page.goBack();
    await expect(page).toHaveURL(/\/templates$/);
    await expect(leaveDialog(page)).toHaveCount(0);
  });
});
