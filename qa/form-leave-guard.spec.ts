import { existsSync } from "node:fs";
import { expect, webkit, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm, type SignInLang } from "./sign-in";
import { expectUnoccluded } from "./layout";
import { openTargetsForm } from "./targets-card";

/**
 * BUG-665 (restated 2026-10-07, audit A14) and EV-342o O.3 / O.4 — the three server-rendered
 * forms that left without a prompt, now built with `useCoachForm`:
 *
 *   · the nutrition template editor (`NutritionTemplateEditor`, the row as first filed);
 *   · the daily targets (`NutritionTargetsCard`, four macros);
 *   · the progress goal (`ProgressGoalBlock`, start date + milestones).
 *
 * The fourth form, « Nouveau défi », is a dialog and needs the populated roster to save, so
 * it is the last describe of `qa/coach-challenges.spec.ts` (roster config).
 *
 * BUG-665's expected behaviour, per form, EN and FR: it asks before a link and before Back
 * while there is unsaved work, and Stay keeps every edit; it never asks after a save; it
 * asks again after a re-edit; one Back press leaves after a save. Plus the paths the hook
 * owns by construction: a refused save keeps the question, a 403 that ends the access goes
 * to the denied page without one, and closing the tab raises the browser's own prompt.
 *
 * Copy is literal here, never imported from `src/lib/copy*.ts`.
 *
 * Sync points, never sleeps: the guard arms by pushing a history entry whose state carries
 * `evoliUnsavedGuard`, and disarms by stepping back off it. A Back pressed before the arm
 * would leave for real (no human is that fast; a test is), and a Back pressed before the
 * disarm's own step would go two entries back, so each Back waits for the state it is about.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

const L = {
  en: {
    leave: "Leave with unsaved changes?",
    stay: "Stay on this page",
    go: "Leave without saving",
    portal: "Portal",
    recipes: "Recipes",
    templateName: "Template name",
    calories: "Calories",
    protein: "Protein",
    carbs: "Carbs",
    fat: "Fat",
    saveTemplate: "Save template",
    templateSaved: "Template saved.",
    edit: "Edit",
    saveTargets: "Save targets",
    saveTargetsTitle: "Save targets?",
    targetsSaved: "Targets saved.",
    targetsFailed: "The targets could not be saved.",
    block: "Progress and milestone",
    milestone: "Milestone weight (kg)",
    save: "Save",
    saved: "Saved.",
  },
  fr: {
    leave: "Quitter sans enregistrer ?",
    stay: "Rester sur cette page",
    go: "Quitter sans enregistrer",
    portal: "Portail",
    recipes: "Recettes",
    templateName: "Nom du modèle",
    calories: "Calories",
    protein: "Protéines",
    carbs: "Glucides",
    fat: "Lipides",
    saveTemplate: "Enregistrer le modèle",
    templateSaved: "Modèle enregistré.",
    edit: "Modifier",
    saveTargets: "Enregistrer les objectifs",
    saveTargetsTitle: "Enregistrer les objectifs ?",
    targetsSaved: "Objectifs enregistrés.",
    targetsFailed: "Les objectifs n'ont pas pu être enregistrés.",
    block: "Progression et objectif",
    milestone: "Objectif de poids (kg)",
    save: "Enregistrer",
    saved: "Enregistré.",
  },
} as const;
type Words = (typeof L)[SignInLang];

const leaveDialog = (page: Page, w: Words) => page.getByRole("dialog", { name: w.leave, exact: true });
/**
 * The side nav's link, named. The shell draws the same links twice (the side nav from 768 px,
 * the tab bar below it); at 1280 px only the side nav shows, but one run caught both in the
 * accessibility tree at once (a stylesheet swap in `next dev`), so the side nav is chosen
 * by its class rather than left to a strict-mode coin toss.
 */
const navLink = (page: Page, w: Words) =>
  page
    .locator("nav.shell-side-nav")
    .and(page.getByRole("navigation", { name: w.portal }))
    .getByRole("link", { name: w.recipes, exact: true });

async function armed(page: Page) {
  await page.waitForFunction(() => window.history.state?.evoliUnsavedGuard === true);
}
async function disarmed(page: Page) {
  await page.waitForFunction(() => !window.history.state?.evoliUnsavedGuard);
}
/** Back, allowed to time out: while the guard holds, the document never changes. */
async function pressBack(page: Page) {
  await page.goBack({ timeout: 3000 }).catch(() => null);
}

/**
 * One form under test. `open` lands on it from a page of its own, so "one Back press"
 * has somewhere to go, and returns that page's path.
 */
interface FormCase {
  name: string;
  open(page: Page, w: Words): Promise<string>;
  field(page: Page, w: Words): Locator;
  /** A value that differs from the stored one, and a second one for the re-edit. */
  values: [string, string];
  save(page: Page, w: Words): Promise<void>;
}

const nutritionTemplate: FormCase = {
  name: "the nutrition template editor",
  async open(page, w) {
    // The EMPTY scenario has no nutrition template: make one through the UI (EV-223).
    await page.goto("/nutrition-templates/new");
    const name = page.getByLabel(w.templateName);
    await name.fill("Cut 1800");
    await page.getByLabel(w.calories, { exact: true }).fill("1800");
    await page.getByLabel(w.protein, { exact: true }).fill("150");
    await page.getByLabel(w.carbs, { exact: true }).fill("170");
    await page.getByLabel(w.fat, { exact: true }).fill("60");
    await page.getByRole("button", { name: w.saveTemplate }).click();
    await page.waitForURL("/nutrition-templates");
    await page.getByRole("group", { name: "Cut 1800", exact: true }).getByRole("link", { name: w.edit }).click();
    await page.waitForURL(/\/nutrition-templates\/[0-9a-f-]{36}$/);
    await expect(page.getByLabel(w.calories, { exact: true })).toHaveValue("1800");
    return "/nutrition-templates";
  },
  field: (page, w) => page.getByLabel(w.calories, { exact: true }),
  values: ["1750", "1700"],
  async save(page, w) {
    await page.getByRole("button", { name: w.saveTemplate }).click();
    await expect(page.getByRole("status").filter({ hasText: w.templateSaved })).toBeVisible();
  },
};

const targets: FormCase = {
  name: "the daily targets",
  async open(page) {
    await page.goto(`/clients/${LINA}`);
    await page.goto(`/clients/${LINA}/nutrition`);
    await openTargetsForm(page);
    return `/clients/${LINA}`;
  },
  field: (page, w) => page.getByLabel(w.calories, { exact: true }),
  values: ["2345", "2290"],
  async save(page, w) {
    await page.getByRole("button", { name: w.saveTargets, exact: true }).click();
    const confirm = page.getByRole("dialog", { name: w.saveTargetsTitle });
    await confirm.getByRole("button", { name: w.saveTargets, exact: true }).click();
    await expect(page.getByText(w.targetsSaved, { exact: true })).toBeVisible();
    // EV-337g1: a save that lands closes the card's form; the next edit opens it again.
    await openTargetsForm(page);
  },
};

const progressGoal: FormCase = {
  name: "the progress goal",
  async open(page) {
    await page.goto("/");
    await page.goto(`/clients/${LINA}`);
    return "/";
  },
  field: (page, w) => page.getByRole("region", { name: w.block }).getByLabel(w.milestone),
  values: ["71", "69"],
  async save(page, w) {
    const block = page.getByRole("region", { name: w.block });
    await block.getByRole("button", { name: w.save, exact: true }).click();
    await expect(block.getByText(w.saved, { exact: true })).toBeVisible();
  },
};

const FORMS = [nutritionTemplate, targets, progressGoal];

async function signIn(page: Page, lang: SignInLang) {
  await signInThroughForm(page, { email: EMAIL, password: PASSWORD, lang });
}

for (const lang of ["en", "fr"] as const) {
  const w = L[lang];
  test.describe(`BUG-665 in ${lang.toUpperCase()}`, () => {
    test.use({ locale: lang === "en" ? "en-US" : "fr-FR" });

    for (const form of FORMS) {
      test(`${form.name}: a link and Back both ask, Stay keeps the edit, Leave goes`, async ({ page }) => {
        await signIn(page, lang);
        await form.open(page, w);
        const here = new URL(page.url()).pathname;
        await form.field(page, w).fill(form.values[0]);
        await armed(page);

        await navLink(page, w).click();
        await expect(leaveDialog(page, w)).toBeVisible();
        // Asked BEFORE the navigation, not after it.
        expect(new URL(page.url()).pathname).toBe(here);
        await leaveDialog(page, w).getByRole("button", { name: w.stay, exact: true }).click();
        await expect(leaveDialog(page, w)).toHaveCount(0);
        await expect(form.field(page, w)).toHaveValue(form.values[0]);

        await pressBack(page);
        await expect(leaveDialog(page, w)).toBeVisible();
        await leaveDialog(page, w).getByRole("button", { name: w.stay, exact: true }).click();
        expect(new URL(page.url()).pathname).toBe(here);
        await expect(form.field(page, w)).toHaveValue(form.values[0]);

        await navLink(page, w).click();
        await leaveDialog(page, w).getByRole("button", { name: w.go, exact: true }).click();
        await page.waitForURL("/recipes");
      });

      test(`${form.name}: never after a save, again after a re-edit, and one Back press leaves`, async ({ page }) => {
        await signIn(page, lang);
        const from = await form.open(page, w);
        const here = new URL(page.url()).pathname;

        await form.field(page, w).fill(form.values[0]);
        await armed(page);
        await form.save(page, w);
        await disarmed(page);

        // A re-edit after the save asks again.
        await form.field(page, w).fill(form.values[1]);
        await armed(page);
        await navLink(page, w).click();
        await expect(leaveDialog(page, w)).toBeVisible();
        await leaveDialog(page, w).getByRole("button", { name: w.stay, exact: true }).click();
        expect(new URL(page.url()).pathname).toBe(here);

        // Saved again: ONE Back press leaves, with no question.
        await form.save(page, w);
        await disarmed(page);
        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`${from.replace(/\//g, "\\/")}$`));
        await expect(leaveDialog(page, w)).toHaveCount(0);
      });

      test(`${form.name}: a saved form leaves by a link with no question`, async ({ page }) => {
        await signIn(page, lang);
        await form.open(page, w);
        await form.field(page, w).fill(form.values[0]);
        await armed(page);
        await form.save(page, w);
        await disarmed(page);
        await navLink(page, w).click();
        await page.waitForURL("/recipes");
        await expect(leaveDialog(page, w)).toHaveCount(0);
      });
    }
  });
}

async function setSwitch(context: BrowserContext, baseURL: string, name: string, value: string) {
  await context.addCookies([{ name, value, url: baseURL }]);
}

test.describe("BUG-665 — what the hook owns by construction (EN)", () => {
  test.use({ locale: "en-US" });
  const w = L.en;

  test("the daily targets: a REFUSED save leaves the question standing", async ({ page, context, baseURL }) => {
    await signIn(page, "en");
    await targets.open(page, w);
    await targets.field(page, w).fill("2345");
    await setSwitch(context, baseURL as string, "evoli_fixture_targets", "refused");
    await page.getByRole("button", { name: w.saveTargets, exact: true }).click();
    await page
      .getByRole("dialog", { name: w.saveTargetsTitle })
      .getByRole("button", { name: w.saveTargets, exact: true })
      .click();
    await expect(page.getByText(w.targetsFailed, { exact: true })).toBeVisible();
    await navLink(page, w).click();
    await expect(leaveDialog(page, w)).toBeVisible();
    await expect(targets.field(page, w)).toHaveValue("2345");
  });

  test("the daily targets: a 403 that ends the access goes to the denied page, unasked", async ({
    page,
    context,
    baseURL,
  }) => {
    await signIn(page, "en");
    await targets.open(page, w);
    await targets.field(page, w).fill("2345");
    await armed(page);
    await setSwitch(context, baseURL as string, "evoli_fixture_link", "ended");
    await page.getByRole("button", { name: w.saveTargets, exact: true }).click();
    await page
      .getByRole("dialog", { name: w.saveTargetsTitle })
      .getByRole("button", { name: w.saveTargets, exact: true })
      .click();
    await page.waitForURL("/clients/denied");
    await expect(leaveDialog(page, w)).toHaveCount(0);
  });

  test("the progress goal: a 403 that ends the access goes to the denied page, unasked", async ({
    page,
    context,
    baseURL,
  }) => {
    await signIn(page, "en");
    await progressGoal.open(page, w);
    await progressGoal.field(page, w).fill("71");
    await armed(page);
    await setSwitch(context, baseURL as string, "evoli_fixture_link", "ended");
    await page.getByRole("region", { name: w.block }).getByRole("button", { name: w.save, exact: true }).click();
    await page.waitForURL("/clients/denied");
    await expect(leaveDialog(page, w)).toHaveCount(0);
  });

  test("the progress goal: typing a field back to what is stored is not unsaved work", async ({ page }) => {
    await signIn(page, "en");
    await progressGoal.open(page, w);
    const field = progressGoal.field(page, w);
    const stored = await field.inputValue();
    await field.fill("71");
    await armed(page);
    await field.fill(stored);
    await disarmed(page);
    await navLink(page, w).click();
    await page.waitForURL("/recipes");
    await expect(leaveDialog(page, w)).toHaveCount(0);
  });

  test("the nutrition template editor: closing the tab raises the browser's own prompt", async ({ page }) => {
    await signIn(page, "en");
    await page.goto("/nutrition-templates/new");
    await page.getByLabel(w.templateName).fill("Unsaved on close");
    await armed(page);
    const seen = new Promise<string>((resolve) => {
      page.on("dialog", (d) => {
        resolve(d.type());
        void d.dismiss();
      });
    });
    await page.close({ runBeforeUnload: true });
    expect(await seen).toBe("beforeunload");
  });

  test("a new nutrition template: the create leaves for the library, and Back does not return to /new", async ({
    page,
  }) => {
    await signIn(page, "en");
    await page.goto("/nutrition-templates");
    await page.goto("/nutrition-templates/new");
    await page.getByLabel(w.templateName).fill("Created once");
    await page.getByLabel(w.calories, { exact: true }).fill("1800");
    await page.getByLabel(w.protein, { exact: true }).fill("150");
    await page.getByLabel(w.carbs, { exact: true }).fill("170");
    await page.getByLabel(w.fat, { exact: true }).fill("60");
    await armed(page);
    await page.getByRole("button", { name: w.saveTemplate }).click();
    await page.waitForURL("/nutrition-templates");
    await expect(page.getByRole("group", { name: "Created once", exact: true })).toBeVisible();
    await expect(leaveDialog(page, w)).toHaveCount(0);
    // `replace` after the guard's entry is gone: /new is not in the history any more, and
    // the library before it is one Back away.
    await page.goBack();
    await expect(page).not.toHaveURL(/\/nutrition-templates\/new$/);
  });
});

/**
 * BUG-730 — a keystroke that lands while a save's own history step is in flight.
 *
 * A save the server accepts hands the guard's entry back with `history.back()`, and the
 * traversal answers a few milliseconds later (2–14 ms, median 4, measured over 280 saves in
 * `coach-progress-goal.spec.ts`). The form is already clean, so a keystroke in that window
 * re-arms the guard. Before the fix the re-arm pushed a NEW sentinel while the step was still
 * in flight, and the step's `popstate` then reached the re-armed guard's own listener after
 * the release's listener had stood down: the guard read it as the coach pressing Back and
 * opened « Leave with unsaved changes? » over the form. A coach on a loaded machine could see
 * it; the test saw it as a Save button under a modal backdrop for 60 s (`coach-progress-goal`
 * :952, 6 runs in 20 on a loaded gate).
 *
 * The window is a few milliseconds on an idle machine, so it is HELD open here: the page's own
 * `history.back()` runs 400 ms after it is called, which is what a loaded browser does to it.
 * Nothing else is changed. `__bug730Landed` counts the held steps that have landed (its
 * listener is added last, so the guard's own listeners have run when it counts), and
 * `__bug730Backs` every `history.back()` the page asked for, at the moment it asked.
 */
async function holdHistoryBack(page: Page, ms: number) {
  await page.addInitScript((delay) => {
    const w = window as unknown as { __bug730Landed: number; __bug730Backs: number };
    w.__bug730Landed = 0;
    w.__bug730Backs = 0;
    const back = window.history.back.bind(window.history);
    window.history.back = () => {
      w.__bug730Backs += 1;
      window.setTimeout(() => {
        window.addEventListener("popstate", () => (w.__bug730Landed += 1), { once: true });
        back();
      }, delay);
    };
  }, ms);
}

async function heldStepsLanded(page: Page, count: number) {
  await page.waitForFunction(
    (n) => (window as unknown as { __bug730Landed: number }).__bug730Landed >= n,
    count
  );
}

/** Chromium's Navigation API: where in the session history the page stands. */
async function historyIndex(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { navigation: { currentEntry: { index: number } } }).navigation.currentEntry.index
  );
}

test.describe("BUG-730 — typing while a save's history step is in flight (EN)", () => {
  test.use({ locale: "en-US" });
  const w = L.en;

  test("the progress goal: no question appears, Back still asks, and the next save leaves one entry", async ({
    page,
  }) => {
    await holdHistoryBack(page, 400);
    await signIn(page, "en");
    await progressGoal.open(page, w);
    const block = page.getByRole("region", { name: w.block });
    const field = progressGoal.field(page, w);
    const start = await historyIndex(page);

    await field.fill("71");
    await armed(page);
    await block.getByRole("button", { name: w.save, exact: true }).click();
    // The first save's notice is new, so it is a sync point: `saved()` has run, and its
    // `history.back()` is now held.
    await expect(block.getByText(w.saved, { exact: true })).toBeVisible();
    await field.fill("69");
    await heldStepsLanded(page, 1);

    // The step was the save's, not the coach's: nothing asks.
    await expect(leaveDialog(page, w)).toHaveCount(0);
    await expect(block.getByRole("button", { name: w.save, exact: true })).toBeEnabled();
    await expect(field).toHaveValue("69");

    // The re-edit is still guarded: one Back asks, and Stay keeps it.
    await armed(page);
    await pressBack(page);
    await expect(leaveDialog(page, w)).toBeVisible();
    await leaveDialog(page, w).getByRole("button", { name: w.stay, exact: true }).click();
    await expect(field).toHaveValue("69");

    // Its save hands the history back clean: the page stands where it was loaded, and one
    // Back press leaves.
    const answered = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined
    );
    await block.getByRole("button", { name: w.save, exact: true }).click();
    await answered;
    await heldStepsLanded(page, 2);
    await disarmed(page);
    expect(await historyIndex(page), "a stray guard entry is left in the history").toBe(start);
    await page.goBack();
    await page.waitForURL("/");
  });

  test("the progress goal: a re-edit typed back to the saved value before the step lands leaves no guard entry", async ({
    page,
  }) => {
    await holdHistoryBack(page, 400);
    await signIn(page, "en");
    await progressGoal.open(page, w);
    const block = page.getByRole("region", { name: w.block });
    const field = progressGoal.field(page, w);
    const start = await historyIndex(page);

    await field.fill("71");
    await armed(page);
    await block.getByRole("button", { name: w.save, exact: true }).click();
    await expect(block.getByText(w.saved, { exact: true })).toBeVisible();
    // Dirty, then clean again, both before the save's step lands: nothing is left to guard.
    await field.fill("69");
    await field.fill("71");
    await heldStepsLanded(page, 1);

    await expect(leaveDialog(page, w)).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.history.state?.evoliUnsavedGuard === true), {
        message: "a guard entry was pushed for a form with nothing unsaved",
      })
      .toBe(false);
    expect(await historyIndex(page), "a stray guard entry is left in the history").toBe(start);
    await page.goBack();
    await page.waitForURL("/");
  });

  test("the progress goal: a second save that lands while the first save's step is still in flight steps back once", async ({
    page,
  }) => {
    // Longer than a whole save here, so the second save lands inside the first one's step.
    await holdHistoryBack(page, 1500);
    await signIn(page, "en");
    await progressGoal.open(page, w);
    const block = page.getByRole("region", { name: w.block });
    const field = progressGoal.field(page, w);
    const save = block.getByRole("button", { name: w.save, exact: true });
    const start = await historyIndex(page);

    await field.fill("71");
    await armed(page);
    await save.click();
    await expect(block.getByText(w.saved, { exact: true })).toBeVisible();
    await field.fill("69");
    const answered = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined
    );
    await save.click();
    await answered;
    // Back from « Saving… »: the second save's `saved()` has run, inside the first one's step.
    await expect(save).toBeEnabled();
    await heldStepsLanded(page, 1);

    await expect(leaveDialog(page, w)).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as unknown as { __bug730Backs: number }).__bug730Backs),
      "the second save asked for a second step back: the guard had one entry to hand back"
    ).toBe(1);
    await disarmed(page);
    expect(await historyIndex(page), "the history is not where the page was loaded").toBe(start);
    await page.goBack();
    await page.waitForURL("/");
  });

  test("the progress goal: typed back to the stored value, then again before that step lands: no question, Back still asks", async ({
    page,
  }) => {
    // The guard's OTHER own step: a form that is clean again without a save takes its entry
    // back out from the effect's cleanup, and a keystroke can land inside that step too.
    await holdHistoryBack(page, 400);
    await signIn(page, "en");
    await progressGoal.open(page, w);
    const field = progressGoal.field(page, w);
    const stored = await field.inputValue();
    const start = await historyIndex(page);

    await field.fill("71");
    await armed(page);
    await field.fill(stored);
    await field.fill("69");
    await heldStepsLanded(page, 1);

    await expect(leaveDialog(page, w)).toHaveCount(0);
    await armed(page);
    await pressBack(page);
    await expect(leaveDialog(page, w)).toBeVisible();
    await leaveDialog(page, w).getByRole("button", { name: w.stay, exact: true }).click();
    await expect(field).toHaveValue("69");

    // Typed back once more: the entry goes, and the page stands where it was loaded.
    await field.fill(stored);
    await heldStepsLanded(page, 2);
    await disarmed(page);
    expect(await historyIndex(page), "a stray guard entry is left in the history").toBe(start);
    await page.goBack();
    await page.waitForURL("/");
  });

  test("a new nutrition template: a keystroke while the create's step is in flight neither asks nor leaves /new behind", async ({
    page,
  }) => {
    await holdHistoryBack(page, 400);
    await signIn(page, "en");
    await page.goto("/nutrition-templates");
    await page.goto("/nutrition-templates/new");
    const name = page.getByLabel(w.templateName);
    await name.fill("Created once");
    await page.getByLabel(w.calories, { exact: true }).fill("1800");
    await page.getByLabel(w.protein, { exact: true }).fill("150");
    await page.getByLabel(w.carbs, { exact: true }).fill("170");
    await page.getByLabel(w.fat, { exact: true }).fill("60");
    await armed(page);
    const save = page.getByRole("button", { name: w.saveTemplate });
    const answered = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined
    );
    await save.click();
    await answered;
    // Back from « Saving… »: the action's callback has run, so `saved(…, then)` has called
    // `history.back()` (held) and the navigation to the library waits for that step.
    await expect(save).toBeEnabled();
    await expect(page).toHaveURL(/\/nutrition-templates\/new$/);
    await name.fill("Created once, renamed late");
    await heldStepsLanded(page, 1);

    // The save leaves for the library as it would have: the late keystroke neither asks nor
    // leaves a guard entry for /new behind.
    await page.waitForURL("/nutrition-templates");
    await expect(page.getByRole("group", { name: "Created once", exact: true })).toBeVisible();
    await expect(leaveDialog(page, w)).toHaveCount(0);
    // One step back was asked for, the save's own. A guard entry re-pushed for the late
    // keystroke would have been taken back out when the editor unmounted: a second
    // `history.back()`, which steps the coach off the library and onto /new again. Read
    // before the Back below, which loads another document.
    expect(
      await page.evaluate(() => (window as unknown as { __bug730Backs: number }).__bug730Backs),
      "the page stepped back again after the save's own step"
    ).toBe(1);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/nutrition-templates\/new$/);
  });
});

/**
 * The epic's common bar (EV-342: widths 1440 / 1024 / 768 / 390, Chromium and WebKit) for the
 * guard itself: at each width the question is asked, its two buttons are on screen and
 * answerable (not under the tab bar at 390), Stay keeps the edit, and after a save one Back
 * press leaves. The nav link is whichever of the shell's two navs shows at that width; the
 * count of exactly one visible link is also the wait for the width's stylesheet.
 */
const WIDTHS = [1440, 1024, 768, 390] as const;

async function guardAtWidth(page: Page, width: number, engine: string) {
  const w = L.en;
  const label = `${engine} ${width}px`;
  await page.setViewportSize({ width, height: 900 });
  await progressGoal.open(page, w);
  const field = progressGoal.field(page, w);
  await field.fill("71");
  await armed(page);
  const link = page.getByRole("navigation", { name: w.portal }).getByRole("link", { name: w.recipes, exact: true });
  await expect(link, `${label}: one visible Recipes link`).toHaveCount(1);
  await link.click();
  const dialog = leaveDialog(page, w);
  await expect(dialog, label).toBeVisible();
  await expectUnoccluded(page, dialog.getByRole("button", { name: w.go, exact: true }), { label: `${label} leave` });
  const stay = dialog.getByRole("button", { name: w.stay, exact: true });
  await expectUnoccluded(page, stay, { label: `${label} stay` });
  await stay.click();
  await expect(field).toHaveValue("71");
  await progressGoal.save(page, w);
  await disarmed(page);
  await page.goBack();
  await expect(page, label).toHaveURL(/\/$/);
  await expect(leaveDialog(page, w)).toHaveCount(0);
}

test.describe("BUG-665 — the guard at the slice widths, Chromium and WebKit (EN)", () => {
  test.use({ locale: "en-US" });

  for (const width of WIDTHS) {
    test(`Chromium ${width}px: asked, answerable, and one Back after a save`, async ({ page }) => {
      await signIn(page, "en");
      await guardAtWidth(page, width, "Chromium");
    });
  }

  test.describe("WebKit", () => {
    let browser: Browser;
    test.beforeAll(async () => {
      expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
      browser = await webkit.launch();
    });
    test.afterAll(async () => {
      await browser?.close();
    });

    for (const width of [1440, 390] as const) {
      test(`WebKit ${width}px: asked, answerable, and one Back after a save`, async ({ baseURL }) => {
        const context = await browser.newContext({
          baseURL,
          locale: "en-US",
          extraHTTPHeaders: { "Accept-Language": "en-US" },
        });
        const page = await context.newPage();
        await signInThroughForm(page, { email: EMAIL, password: PASSWORD, lang: "en", landing: `${baseURL}/` });
        await guardAtWidth(page, width, "WebKit");
        await context.close();
      });
    }
  });
});
