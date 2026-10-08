import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { signInFrench } from "./french";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";

/**
 * BUG-706 — the English nutrition tab printed the trainee's diet rules as the stored enum,
 * "HALAL" / "KOSHER" (`copy.ts` `ruleLabels`), while the trainee's own English app says
 * "Halal" / "Kosher" and the French portal already said « Halal » / « Casher ». Same class as
 * BUG-694: the portal shows the app's label, not the stored value.
 *
 * Expected: on a client's nutrition tab whose diet profile has both rules, EN shows "Halal"
 * and "Kosher", FR « Halal » and « Casher », each equal to the app's label.
 *
 * The expected labels are literals copied from `b-fit-mobile` `src/i18n/locales/{en,fr}.json`
 * `translation.nutrition.prefs.rule.*` at hub origin/main `1e5cea6a` (2026-10-08), never read
 * back from the dictionaries under test. The rule values are the app's `FOOD_RULES`
 * (`src/features/nutrition/lib/prefsVocabulary.ts`), which is the api's `FoodRule` enum.
 *
 * `evoli_fixture_diet_profile=presets` (this browser context only) serves Lina's profile with
 * both rules; see `getNutrition` in the fixture. Lina's seed holds HALAL alone.
 *
 * Red on 5e8d5aa: the English rows read "HALAL", "KOSHER".
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";

/** `FOOD_RULES` at hub origin/main, in the app's order. */
const FOOD_RULES = ["HALAL", "KOSHER"];

const APP_LABELS = {
  en: { HALAL: "Halal", KOSHER: "Kosher" },
  fr: { HALAL: "Halal", KOSHER: "Casher" },
} as const;

const RULES_GROUP = { en: "Dietary rules", fr: "Règles alimentaires" } as const;

async function ruleValues(page: Page, label: string): Promise<{ shown: string[]; text: string[] }> {
  const group = page.locator(`[data-profile-group="${label}"]`);
  await expect(group).toHaveCount(1);
  const values = group.locator("[data-profile-values] > *");
  // Both the painted text and the DOM text: a CSS uppercase would pass a textContent read.
  return { shown: await values.allInnerTexts(), text: await values.allTextContents() };
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-706, ${lang.toUpperCase()}`, () => {
    if (lang === "fr") test.use({ locale: "fr-FR" });
    const labels = APP_LABELS[lang];

    async function signIn(page: Page) {
      if (lang === "fr") await signInFrench(page);
      else await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
    }

    test("both diet rules are shown with the trainee app's label", async ({ page }) => {
      await signIn(page);
      await page.context().addCookies([{ name: "evoli_fixture_diet_profile", value: "presets", url: page.url() }]);
      await page.goto(`/clients/${LINA}/nutrition`);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      const want = [labels.HALAL, labels.KOSHER];
      expect(await ruleValues(page, RULES_GROUP[lang])).toEqual({ shown: want, text: want });
    });

    test("the seeded profile (HALAL alone, no switch) reads the same way", async ({ page }) => {
      await signIn(page);
      await page.goto(`/clients/${LINA}/nutrition`);
      expect(await ruleValues(page, RULES_GROUP[lang])).toEqual({ shown: [labels.HALAL], text: [labels.HALAL] });
    });
  });
}

test.describe("BUG-706, the dictionaries (no browser)", () => {
  test("each dictionary labels exactly the app's food rules, with the app's labels", () => {
    expect(Object.keys(en.nutrition.ruleLabels)).toEqual(FOOD_RULES);
    expect(Object.keys(fr.nutrition.ruleLabels)).toEqual(FOOD_RULES);
    expect(en.nutrition.ruleLabels).toEqual(APP_LABELS.en);
    expect(fr.nutrition.ruleLabels).toEqual(APP_LABELS.fr);
  });
});
