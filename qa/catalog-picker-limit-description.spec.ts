import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { LINA, grant, openIntake, panel, plain, putSection, sectionTab, seedSection, signIn, status } from "./intake-harness";

/**
 * BUG-1075 — an intake catalogue picker that shows its limit line (`CatalogPicker`'s `limitNote`:
 * the list is full, or « Recharger » is reading, BUG-1073) gave that line to no assistive tech: the
 * focused search box had an empty accessible description. Fix: while `limitNote` is set, the search
 * box's `aria-describedby` names the line; a picker given no `limitNote` gets no attribute.
 *
 * Chromium, fixture mode, the default config. The sentences are LITERALS, never read from
 * `src/lib/copy.ts`. The accessible description is Playwright's computation
 * (`toHaveAccessibleDescription`); no screen reader is run here (closes-when 5 is Raed's device pass).
 *
 * Closes-when 1 as restated (da): (1a) W1, (1b) F. (1a): at the limit the opener is `disabled`
 * (`IntakeCatalogFields.tsx`, `disabled={disabled || full}`), and « W1 » records that a click on it
 * opens no picker. (1b): « F » picks the tenth inside the open picker, and the search box then has
 * the full-list sentence as its description.
 *
 * Not covered here: WebKit (not installed on the rig); `RecipeEditor` (it renders no `CatalogPicker`).
 */

const T = {
  en: {
    locale: "en-US",
    saved: "Saved",
    notes: "Notes",
    reload: "Reload",
    liked: "Liked exercises",
    add: "Add exercise",
    max10: "10 exercises at most.",
    loading: "Loading the saved version. Nothing can be added until it finishes.",
  },
  fr: {
    locale: "fr-FR",
    saved: "Enregistré",
    notes: "Notes",
    reload: "Recharger",
    liked: "Exercices appréciés",
    add: "Ajouter un exercice",
    max10: "10 exercices au maximum.",
    loading: "Chargement de la version enregistrée. Rien ne peut être ajouté avant la fin.",
  },
} as const;
type Lang = keyof typeof T;

/** Nine catalogue names (none of them « Goblet Squat » or « Plank »), as `intake-routine-fields.spec.ts`. */
const NINE = [
  "Barbell Back Squat",
  "Leg Press",
  "Romanian Deadlift",
  "Seated Leg Curl",
  "Hip Thrust",
  "Walking Lunge",
  "Standing Calf Raise",
  "Barbell Bench Press",
  "Dumbbell Bench Press",
];

const READ = `**/api/bff/clients/${LINA}/intake`;
const liked = (page: Page) => page.locator('[data-intake-field="HISTORY.likedExercises"]');
const alertOf = (page: Page, k: string) => page.locator(`[data-intake-alert="${k}"]`);
const notes = (page: Page, lang: Lang) => panel(page, "HISTORY").getByRole("textbox", { name: T[lang].notes, exact: true });

/** What a test records about a search box: the raw `aria-describedby`, and whether it holds focus. */
const describe = (box: Locator) =>
  box.evaluate((el) => ({
    describedby: el.getAttribute("aria-describedby"),
    focused: document.activeElement === el,
  }));

async function openHistory(page: Page) {
  await sectionTab(page, "HISTORY").click();
  await expect(panel(page, "HISTORY")).toBeVisible();
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`intake picker (${lang.toUpperCase()})`, () => {
    test.use({ locale: T[lang].locale });

    test("W1 (witness for closes-when 1): at 10 the opener is disabled, and a click on it opens no picker", async ({ page }) => {
      const t = T[lang];
      await signIn(page, lang);
      await grant(page);
      await seedSection(page, "HISTORY", { likedExercises: [...NINE, "Plank"] });
      await openIntake(page);
      await openHistory(page);
      const opener = liked(page).getByRole("button", { name: t.add, exact: true });
      await expect(liked(page).locator("[data-intake-chip]")).toHaveCount(10);
      await expect(opener).toBeDisabled();
      await opener.click({ force: true });
      await page.waitForTimeout(500);
      const dialogs = await page.getByRole("dialog").count();
      process.stdout.write(`BUG1075 W1 ${lang} openerDisabled=${await opener.isDisabled()} dialogs=${dialogs}\n`);
      expect(dialogs, "no picker opens on a full list").toBe(0);
    });

    test("F: the list reaches 10 inside the open picker; the search box is then described by the full-list sentence, and was not before", async ({
      page,
    }) => {
      const t = T[lang];
      await signIn(page, lang);
      await grant(page);
      await seedSection(page, "HISTORY", { likedExercises: NINE });
      await openIntake(page);
      await openHistory(page);
      await liked(page).getByRole("button", { name: t.add, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: t.liked, exact: true });
      const box = dialog.getByRole("textbox");
      await expect(box).toBeFocused();
      const before = { ...(await describe(box)), limit: await dialog.locator("[data-catalog-limit]").count() };
      await expect(box, "below the limit: no description").toHaveAccessibleDescription("");
      await box.fill("Plank");
      await dialog.locator('[data-catalog-row="Plank"]').click();
      await expect(dialog.locator("[data-catalog-limit]")).toHaveText(t.max10);
      await box.focus();
      const after = await describe(box);
      process.stdout.write(`BUG1075 F ${lang} before=${JSON.stringify(before)} after=${JSON.stringify(after)}\n`);
      expect(before, "below the limit: no line, no attribute").toEqual({ describedby: null, focused: true, limit: 0 });
      await expect(box).toHaveAccessibleDescription(t.max10);
    });

    test("CW2: opened while « Reload » reads, the focused search box is described by the loading sentence; after the read it is not", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const t = T[lang];
      // BUG-1073's setup (`intake-reload-lock.spec.ts` « P »): HISTORY seeded, the coach saves « Mine »,
      // another writer stores ["Goblet Squat", "Plank"], the coach's « Mine again » meets a 409.
      await signInThroughForm(page, { lang });
      await grant(page);
      await seedSection(page, "HISTORY", { likedExercises: ["Plank"] });
      await openIntake(page);
      await openHistory(page);
      await notes(page, lang).fill("Mine");
      await notes(page, lang).press("Tab");
      await expect.poll(async () => plain(await status(page).textContent()).trim()).toBe(t.saved);
      const theirs = await putSection(page, "HISTORY", 2, { likedExercises: ["Goblet Squat", "Plank"], notes: "Theirs" });
      expect(theirs.status, JSON.stringify(theirs.body)).toBe(200);
      await notes(page, lang).fill("Mine again");
      await notes(page, lang).press("Tab");
      await expect(alertOf(page, "conflict")).toBeVisible();

      // The read held on a promise the test releases, so "during" is never a race.
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let answered = false;
      page.on("response", (r) => {
        if (r.url().endsWith(`/api/bff/clients/${LINA}/intake`) && r.request().method() === "GET") answered = true;
      });
      await page.route(READ, async (route) => {
        await gate;
        await route.continue();
      });
      const button = alertOf(page, "conflict").getByRole("button", { name: t.reload, exact: true });
      await button.click();
      await expect(button).toBeDisabled();

      await liked(page).getByRole("button", { name: t.add, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: t.liked, exact: true });
      const box = dialog.getByRole("textbox");
      await expect(box).toBeFocused();
      await expect(dialog.locator("[data-catalog-limit]")).toHaveText(t.loading);
      const during = await describe(box);
      let describedDuring = "";
      // A miss is recorded as a fixed string, so the failing `toBe` below does not show the description
      // received; the raw `aria-describedby` taken just above is in the « BUG1075 CW2 » log line (`during`).
      try {
        await expect(box).toHaveAccessibleDescription(t.loading, { timeout: 3_000 });
        describedDuring = t.loading;
      } catch {
        describedDuring = "(not the loading sentence)";
      }
      const duringBeforeAnswer = !answered;
      const got = page.waitForResponse((r) => r.url().endsWith(`/api/bff/clients/${LINA}/intake`) && r.request().method() === "GET");
      release();
      await got;
      await expect(alertOf(page, "conflict")).toHaveCount(0);
      await expect(dialog.locator("[data-catalog-limit]")).toHaveCount(0);
      await page.waitForTimeout(400);
      const after = await describe(box);
      process.stdout.write(
        `BUG1075 CW2 ${lang} during=${JSON.stringify(during)} describedDuring=${JSON.stringify(describedDuring)} before-answer=${duringBeforeAnswer} after=${JSON.stringify(after)}\n`
      );
      expect(duringBeforeAnswer, "the 'during' read was taken while the GET was still out").toBe(true);
      expect(describedDuring).toBe(t.loading);
      await expect(box).not.toHaveAccessibleDescription(new RegExp(t.loading.slice(0, 12)));
      // The stored list is two long, under the limit: no line, so no attribute.
      expect(after.describedby, "after the read: no attribute").toBeNull();
    });
  });
}

// ── closes-when 3: the pickers given no `limitNote` ─────────────────────────────────────────

test.describe("the other pickers (no limitNote)", () => {
  test("the routine day editor's picker: the search box has no aria-describedby and an empty description", async ({ page }) => {
    await signInThroughForm(page);
    await page.goto(`/clients/${LINA}/routine`);
    await page.getByRole("button", { name: "Add exercise" }).first().click();
    const dialog = page.getByRole("dialog");
    const box = dialog.getByLabel("Search the catalog");
    await expect(box).toBeVisible();
    await expect(dialog.locator("[data-catalog-row]").first()).toBeVisible();
    const seen = await describe(box);
    process.stdout.write(`BUG1075 CW3 day-editor ${JSON.stringify(seen)}\n`);
    expect(seen.describedby).toBeNull();
    await expect(box).toHaveAccessibleDescription("");
  });

  test("TrialSessionCard's picker: the search box has no aria-describedby and an empty description", async ({ page }) => {
    const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
    await signInThroughForm(page);
    await page.goto(`/clients/${NILS}/routine`);
    await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
    const card = page.getByRole("region", { name: "Trial session", exact: true });
    await card.getByRole("button", { name: "Prepare a trial session", exact: true }).click();
    await card.getByRole("button", { name: "Add exercise", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const box = dialog.getByLabel("Search the catalog");
    await expect(box).toBeVisible();
    await expect(dialog.locator("[data-catalog-row]").first()).toBeVisible();
    const seen = await describe(box);
    process.stdout.write(`BUG1075 CW3 trial-session ${JSON.stringify(seen)}\n`);
    expect(seen.describedby).toBeNull();
    await expect(box).toHaveAccessibleDescription("");
  });
});
