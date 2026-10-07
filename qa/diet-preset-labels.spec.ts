import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { signInFrench } from "./french";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";
import { dietValueLabel } from "../src/lib/dietValueLabel";

/**
 * BUG-694 (audit A23) — the nutrition tab printed the trainee's allergies and dislikes raw.
 * The app stores and sends its PRESET chips as their English label on purpose (`b-fit-mobile`
 * `src/features/nutrition/lib/prefsVocabulary.ts`: the api's hard exclusions match on those
 * strings) and translates only what it shows, so a French coach read « Peanuts », « Olives ».
 *
 * Expected: in French each preset (the nine `ALLERGY_PRESETS`, the five `AVOID_PRESETS`) is
 * shown with the app's French label (`fr.json` `nutrition.prefs.*`); in English with the
 * English one; a value that is not a preset is shown exactly as typed in both languages.
 *
 * `evoli_fixture_diet_profile=presets` (this browser context only) serves Lina's profile
 * with all fourteen presets plus typed values; see `getNutrition` in the fixture.
 *
 * The expected labels are literals copied from `b-fit-mobile` `src/i18n/locales/{en,fr}.json`
 * at hub origin/main (2026-10-07), never read back from the dictionaries under test.
 *
 * Red on 05abea6: the French rows read "Dairy", "Gluten", … (the raw values).
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";

/** `prefsVocabulary.ts` at hub origin/main, in the app's order. */
const ALLERGY_PRESETS = ["Dairy", "Gluten", "Nuts", "Peanuts", "Shellfish", "Eggs", "Soy", "Fish", "Sesame"];
const AVOID_PRESETS = ["Liver", "Mushrooms", "Olives", "Cilantro", "Blue cheese"];

const EXPECTED = {
  en: {
    allergiesLabel: "Allergies",
    dislikesLabel: "Dislikes",
    allergies: [...ALLERGY_PRESETS, "Kiwi", "peanuts", "Arachides"],
    dislikes: [...AVOID_PRESETS, "Fish", "Raw onion"],
  },
  fr: {
    allergiesLabel: "Allergies",
    dislikesLabel: "Aversions",
    allergies: [
      "Produits laitiers",
      "Gluten",
      "Fruits à coque",
      "Arachides",
      "Fruits de mer",
      "Œufs",
      "Soja",
      "Poisson",
      "Sésame",
      // Typed by the trainee: as typed. "peanuts" is not the preset "Peanuts" (the app's
      // match is exact), and a typed « Arachides » prints beside the preset's « Arachides ».
      "Kiwi",
      "peanuts",
      "Arachides",
    ],
    // "Fish" is an allergy preset, not a dislike preset: a typed dislike, shown as typed.
    dislikes: ["Foie", "Champignons", "Olives", "Coriandre", "Fromage bleu", "Fish", "Raw onion"],
  },
} as const;

async function groupValues(page: Page, label: string): Promise<string[]> {
  const group = page.locator(`[data-profile-group="${label}"]`);
  await expect(group).toHaveCount(1);
  return group.locator("[data-profile-values] > *").allInnerTexts();
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-694, ${lang.toUpperCase()}`, () => {
    if (lang === "fr") test.use({ locale: "fr-FR" });
    const want = EXPECTED[lang];

    test("preset allergies and dislikes are shown in the page's language; typed values as typed", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      if (lang === "fr") await signInFrench(page);
      else await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
      await page.context().addCookies([{ name: "evoli_fixture_diet_profile", value: "presets", url: page.url() }]);
      await page.goto(`/clients/${LINA}/nutrition`);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);

      expect(await groupValues(page, want.allergiesLabel)).toEqual([...want.allergies]);
      expect(await groupValues(page, want.dislikesLabel)).toEqual([...want.dislikes]);
      // Two badges print « Arachides » in French: no duplicate-key warning from React.
      expect(errors.filter((e) => /same key/i.test(e))).toEqual([]);
    });

    test("the seeded profile (no switch) reads the same way", async ({ page }) => {
      if (lang === "fr") await signInFrench(page);
      else await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
      await page.goto(`/clients/${LINA}/nutrition`);
      expect(await groupValues(page, want.allergiesLabel)).toEqual([lang === "fr" ? "Arachides" : "Peanuts"]);
      expect(await groupValues(page, want.dislikesLabel)).toEqual(["Olives"]);
    });
  });
}

test.describe("BUG-694, the dictionaries and the lookup (no browser)", () => {
  test("both dictionaries hold exactly the app's presets", () => {
    for (const dict of [en, fr]) {
      expect(Object.keys(dict.nutrition.allergyPresetLabels)).toEqual(ALLERGY_PRESETS);
      expect(Object.keys(dict.nutrition.dislikePresetLabels)).toEqual(AVOID_PRESETS);
    }
    // English shows the stored value itself (the app's en.json label equals it).
    for (const v of ALLERGY_PRESETS) expect(dietValueLabel(en.nutrition.allergyPresetLabels, v)).toBe(v);
    for (const v of AVOID_PRESETS) expect(dietValueLabel(en.nutrition.dislikePresetLabels, v)).toBe(v);
  });

  test("a typed value named like an Object.prototype member is shown as typed", () => {
    const labels: Record<string, string> = fr.nutrition.allergyPresetLabels;
    // The witness for the own-property check: a plain lookup finds the prototype's function.
    expect(typeof labels["constructor"]).toBe("function");
    for (const typed of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      expect(dietValueLabel(labels, typed)).toBe(typed);
    }
  });
});
