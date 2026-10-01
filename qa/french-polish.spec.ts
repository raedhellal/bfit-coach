import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInFrench } from "./french";
import { en } from "../src/lib/copy";
import { de, elides, fr, que } from "../src/lib/copy.fr";
import { parseTarget, targetRefusal } from "../src/lib/numberInput";
import {
  forSave,
  localProblems,
  parseQuantity,
  parseWhole,
  readQuantity,
  type RecipeDraft,
} from "../src/lib/recipeDocument";

/**
 * The French polish pass before the 2026-10-03 demo (EV-273b gate, PB-2 / PB-4 / PB-5;
 * BUG-463 is PB-4's routine-template instance).
 *
 *   PB-4 — "de {prénom}" / "que {prénom}" before a vowel: "Les repas d'Inès", not
 *          "Les repas de Inès". One helper (`de` / `que` in `copy.fr.ts`), and a sweep
 *          over EVERY French sentence so the next one written with a bare "de ${…}" is
 *          caught here, not by a coach.
 *   PB-2 — French-typed numbers. "1 800" (any space grouping thousands) is 1800; a decimal
 *          part in a whole-number field gets "Saisissez un nombre entier…", never "supérieur
 *          à 0", which was false for it. "1,000" is NEVER a number here (BUG-460).
 *   PB-5 — lives in `coach-nutrition-templates-apply.spec.ts` (roster config: the picker
 *          needs the populated roster).
 *
 * Sentences on screen are LITERALS; the dictionary is imported only for the sweep.
 */

const OMAR = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0005";
const NBSP = "\u00a0";
const NNBSP = "\u202f";
// Built from code points so the source carries no literal space a tool or editor could fold.
const THIN = String.fromCharCode(0x2009);
const FIGURE = String.fromCharCode(0x2007);
const CHICKEN_RICE_BOWL = "8e3f1b22-0000-4000-8000-0000000000c1";

/** A recipe draft with nothing wrong in it but `over` (the seeded chicken rice bowl). */
const recipe = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({
  name: "Chicken rice bowl",
  ingredients: [{ key: "chicken_breast", label: "chicken breast", quantity: "150", unit: "g" }],
  kcal: "560",
  proteinG: "50",
  carbsG: "62",
  fatG: "12",
  steps: ["Cook the rice."],
  mealSlots: ["LUNCH", "DINNER"],
  ...over,
});

/* ── PB-4: the helper ───────────────────────────────────────────────────────── */

test.describe("PB-4 — de / que elide before a vowel sound", () => {
  test("a plain vowel elides", () => {
    expect(de("Inès")).toBe("d'Inès");
    expect(de("Omar T.")).toBe("d'Omar T.");
    expect(de("Upper/Lower")).toBe("d'Upper/Lower");
    expect(que("Inès")).toBe("qu'Inès");
    expect(que("olivier")).toBe("qu'olivier");
  });

  test("an accented capital and a ligature elide", () => {
    expect(de("Émilie")).toBe("d'Émilie");
    expect(de("Îlona")).toBe("d'Îlona");
    expect(de("Ôscar")).toBe("d'Ôscar");
    expect(de("Œdipe")).toBe("d'Œdipe");
    expect(de("Ælia")).toBe("d'Ælia");
    expect(que("Élodie")).toBe("qu'Élodie");
    // Decomposed (NFD) input reads the same as composed.
    expect(de("E\u0301milie")).toBe("d'E\u0301milie");
  });

  test("a consonant keeps the full word", () => {
    expect(de("Léa")).toBe("de Léa");
    expect(de("Petra L.")).toBe("de Petra L.");
    expect(que("Tobias")).toBe("que Tobias");
    expect(de("Ce client")).toBe("de Ce client");
  });

  test("h is left alone (mute and aspirated h are spelt alike); y elides only before a consonant", () => {
    expect(elides("Hugo")).toBe(false);
    expect(de("Hugo")).toBe("de Hugo");
    expect(de("Hélène")).toBe("de Hélène");
    expect(que("Hamid")).toBe("que Hamid");
    expect(de("Yves")).toBe("d'Yves");
    expect(de("Yusuf A.")).toBe("de Yusuf A.");
    expect(de("Yasmine")).toBe("de Yasmine");
  });

  test("a digit, a quote mark or nothing keeps the full word", () => {
    expect(de("5x5")).toBe("de 5x5");
    expect(de("« Sèche »")).toBe("de « Sèche »");
    expect(de("")).toBe("de ");
  });
});

/* ── PB-4: every French sentence ────────────────────────────────────────────── */

/**
 * Every function in the French dictionary is called once per argument POSITION, with a
 * vowel-initial word there and a consonant-initial one everywhere else, and its output is
 * searched for an unelided "de / que / le / la" before that word.
 *
 * Positions that ARE hit are dates, numbers and weekdays, which never elide ("le 8 oct.",
 * "de 0 à 5000", "le lundi": every French weekday starts with a consonant). The sweep
 * cannot tell such an argument from a name, so they are listed here — and the list must
 * be EXACT, so an entry that stops being hit is deleted rather than left to excuse a
 * future name in that position.
 */
const DATE_NUMBER_OR_WEEKDAY_POSITIONS = [
  "activate.expired#0",
  "activate.expiredOnSubmit#0",
  "activate.finishBy#0",
  "client.coachedSince#0",
  "client.lastWeighIn#0",
  "nutrition.applyBody#1",
  "nutrition.sourceCoach#0",
  "nutrition.sourceCoachOther#0",
  "nutritionTemplates.updatedAt#0",
  "placement.belowFloor#1", // weekday
  "placement.confirm#2", // weekday
  "progressGoal.milestoneSetBy#1",
  "recipes.numberRange#1",
  "routine.repsOnDuration#0", // weekday
  "routine.traineeChanged#1",
  "templates.updatedAt#0",
];

test("PB-4 — no French sentence puts an unelided de / que / le / la before a vowel-initial name or title", () => {
  const hits: string[] = [];
  let calls = 0;
  const walk = (value: unknown, path: string) => {
    if (typeof value === "function") {
      const fn = value as (...args: unknown[]) => unknown;
      for (let at = 0; at < fn.length; at++) {
        const args = Array.from({ length: fn.length }, (_, i) => (i === at ? "Inès" : "Léa"));
        const out = String(fn(...args));
        calls++;
        if (/\b(de|que|le|la) Inès/i.test(out)) hits.push(`${path}#${at}`);
      }
    } else if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) walk(child, path ? `${path}.${key}` : key);
    }
  };
  walk(fr, "");
  // A sweep that called nothing proves nothing.
  expect(calls).toBeGreaterThan(150);
  expect(hits.sort()).toEqual(DATE_NUMBER_OR_WEEKDAY_POSITIONS);
});

test("PB-4 — the nutrition-template sentences QA read, word for word", () => {
  const t = fr.nutritionTemplates;
  expect(t.confirmBody("Inès", "28 sept. 2026")).toMatch(/^Les repas d'Inès pour cette semaine/);
  expect(t.floorWarning("Inès")).toBe(
    "Si c'est en dessous du minimum sûr d'Inès, Evoli le relève à ce minimum et vous le signale."
  );
  expect(t.reading("Inès")).toBe("Lecture des objectifs actuels d'Inès…");
  expect(t.applied("Cut 1800", "Inès")).toBe(`«${NBSP}Cut 1800${NBSP}» est désormais le plan d'Inès.`);
  expect(fr.templates.guardrailsAtPublish("Inès Moreau")).toBe(
    "Les blessures et le matériel d'Inès Moreau sont pris en compte à la publication."
  );
  expect(fr.placement.applyWarning(2, "Omar")).toMatch(/Les repas qu'Omar a mangés sont conservés\.$/);
  // And a consonant is unchanged.
  expect(t.reading("Petra")).toBe("Lecture des objectifs actuels de Petra…");
});

/* ── PB-2: reading the number ───────────────────────────────────────────────── */

test.describe("PB-2 — whole numbers as a French coach types them", () => {
  test("a target: grouped thousands are read, a decimal part is 'not whole', a comma is never a separator", () => {
    expect(parseTarget("1800")).toEqual({ kind: "whole", value: 1800 });
    expect(parseTarget("1 800")).toEqual({ kind: "whole", value: 1800 });
    expect(parseTarget(`1${NBSP}800`)).toEqual({ kind: "whole", value: 1800 });
    expect(parseTarget(`1${NNBSP}800`)).toEqual({ kind: "whole", value: 1800 });
    expect(parseTarget(" 12 500 ")).toEqual({ kind: "whole", value: 12500 });

    expect(parseTarget("1800,5")).toEqual({ kind: "notWhole" });
    expect(parseTarget("1800.5")).toEqual({ kind: "notWhole" });
    expect(parseTarget("1 800,5")).toEqual({ kind: "notWhole" });
    // BUG-460: "1,000" is neither 1 nor 1000. It is refused, as a number with a decimal part.
    expect(parseTarget("1,000")).toEqual({ kind: "notWhole" });
    expect(parseTarget("1.000")).toEqual({ kind: "notWhole" });

    expect(parseTarget("0")).toEqual({ kind: "invalid" });
    expect(parseTarget("-5")).toEqual({ kind: "invalid" });
    expect(parseTarget("")).toEqual({ kind: "invalid" });
    expect(parseTarget("abc")).toEqual({ kind: "invalid" });
    // A space that does not group thousands is not a grouping anyone meant — and it is a
    // format problem, not an "above 0" one (BUG-552).
    expect(parseTarget("18 00")).toEqual({ kind: "malformed" });
    expect(parseTarget("1  800")).toEqual({ kind: "malformed" });
  });

  test("a recipe macro (parseWhole): grouped thousands read, '1,000' never read; quantities unchanged", () => {
    expect(parseWhole("1 800")).toEqual({ kind: "whole", value: 1800 });
    expect(parseWhole(`1${NNBSP}800`)).toEqual({ kind: "whole", value: 1800 });
    expect(parseWhole("1 800.0")).toEqual({ kind: "whole", value: 1800 });
    expect(parseWhole("50.7")).toEqual({ kind: "fraction", value: 50.7 });
    expect(parseWhole("1,000")).toEqual({ kind: "ambiguous" });
    // Staff F1: digits that cannot be read are a FORMAT problem, as they are for a target.
    expect(parseWhole("18 00")).toEqual({ kind: "malformed" });
    // A quantity keeps its decimal comma (EV-256b): "150,5" g is 150.5.
    expect(parseQuantity("150,5")).toBe(150.5);
  });
});

/* ── the number-input follow-ups (staff review of PB-2, QA's BUG-552 / BUG-553) ── */

test.describe("number-input follow-ups", () => {
  test("a thin space (U+2009) or a figure space (U+2007) groups thousands too, in both readers", () => {
    for (const space of [THIN, FIGURE, NBSP]) {
      const typed = `1${space}800`;
      expect(parseTarget(typed), typed).toEqual({ kind: "whole", value: 1800 });
      expect(parseWhole(typed), typed).toEqual({ kind: "whole", value: 1800 });
    }
    expect(parseTarget(`12${THIN}500${FIGURE}000`)).toEqual({ kind: "whole", value: 12_500_000 });
  });

  test("BUG-552 — a typed digit that cannot be read is a FORMAT problem, never 'above 0'", () => {
    for (const typed of ["18 00", "1  800", "1 25", "12abc", "1.000.000", ".5", "1e3"]) {
      expect(parseTarget(typed), typed).toEqual({ kind: "malformed" });
    }
    // What IS above-0 territory stays there: nothing typed, no digit, zero, a negative.
    for (const typed of ["", "   ", "abc", "0", "0 000", "-5", "-1 800"]) {
      expect(parseTarget(typed), typed).toEqual({ kind: "invalid" });
    }
    // The card shows ONE sentence for four fields: "above 0" while any field needs it,
    // then the format sentence, then "no decimals".
    const whole = parseTarget("1800");
    expect(targetRefusal([whole, whole, whole, whole])).toBeNull();
    expect(targetRefusal([parseTarget("18 00"), parseTarget("1800,5"), whole, whole])).toBe("malformed");
    expect(targetRefusal([parseTarget("1800,5"), parseTarget("1.000"), whole, whole])).toBe("notWhole");
    expect(targetRefusal([parseTarget("18 00"), parseTarget(""), whole, whole])).toBe("invalid");
  });

  test("'1.000' and '1,500' are ambiguous thousands in a recipe macro, as they are in a target", () => {
    for (const typed of ["1.000", "1,500", "100.000", "12,345"]) {
      expect(parseWhole(typed), typed).toEqual({ kind: "ambiguous" });
      expect(parseTarget(typed), typed).toEqual({ kind: "notWhole" });
    }
    // A real decimal keeps the fraction handling recipe macros always had.
    expect(parseWhole("12.5")).toEqual({ kind: "fraction", value: 12.5 });
    expect(parseWhole("50.0")).toEqual({ kind: "whole", value: 50 });
    expect(parseWhole("1 800.000")).toEqual({ kind: "whole", value: 1800 });
    expect(parseWhole("1.0000")).toEqual({ kind: "whole", value: 1 });

    // The recipe editor says it in the targets' sentence, beside kcal, and never sends 1.
    const problems = localProblems(recipe({ kcal: "1.000" }), fr);
    expect(problems).toEqual([{ at: "kcal", message: "Saisissez un nombre entier, sans décimales." }]);
    expect(localProblems(recipe({ proteinG: "1,500" }), fr)).toEqual([
      { at: "proteinG", message: "Saisissez un nombre entier, sans décimales." },
    ]);
    expect(localProblems(recipe({ proteinG: "12.5" }), fr)).toEqual([
      { at: "proteinG", message: "Nombres entiers uniquement. Utilisez 12 ou 13." },
    ]);
  });

  test("BUG-553 — a French decimal comma in a recipe macro is a decimal, told like '1200.5'", () => {
    expect(parseWhole("1200,5")).toEqual({ kind: "fraction", value: 1200.5 });
    expect(parseWhole("1 200,5")).toEqual({ kind: "fraction", value: 1200.5 });
    expect(parseWhole("50,7")).toEqual({ kind: "fraction", value: 50.7 });
    expect(parseWhole("50,0")).toEqual({ kind: "whole", value: 50 });
    for (const typed of ["1200,5", `1${NNBSP}200,5`]) {
      expect(localProblems(recipe({ kcal: typed }), fr), typed).toEqual([
        { at: "kcal", message: "Nombres entiers uniquement. Utilisez 1200 ou 1201." },
      ]);
    }
  });
});

/* ── the number-input tail (QA's BUG-556, staff F1 / F2 on the follow-ups) ───── */

/** A one-line recipe whose only ingredient is `quantity`. */
const withQuantity = (quantity: string) =>
  recipe({ ingredients: [{ key: "chicken_breast", label: "chicken breast", quantity, unit: "g" }] });

test.describe("number-input tail", () => {
  test("BUG-556 — a quantity reads grouping spaces; the comma stays a decimal; 2 decimals and ≤ 5000 still hold", () => {
    for (const space of [" ", NBSP, NNBSP, THIN, FIGURE]) {
      const typed = `1${space}000`;
      expect(readQuantity(typed), JSON.stringify(typed)).toEqual({ kind: "quantity", value: 1000 });
      expect(localProblems(withQuantity(typed), fr), JSON.stringify(typed)).toEqual([]);
    }
    expect(parseQuantity("5 000")).toBe(5000);
    expect(parseQuantity("1 000,5")).toBe(1000.5);
    expect(parseQuantity("1 000,25")).toBe(1000.25);
    expect(parseQuantity("1 000.25")).toBe(1000.25);
    expect(parseQuantity("150,5")).toBe(150.5);
    expect(parseQuantity("0,25")).toBe(0.25);
    // What is SENT is the number, not the text.
    expect(forSave(withQuantity("1 000"), { recipe: "new" }).ingredients[0].quantity).toBe(1000);

    // Read, and refused by the api's rule — with the range sentence, which is true for them.
    for (const typed of ["1 000,125", "5 000,01", "5 001", "0", "0,00", "-1", "abc"]) {
      expect(readQuantity(typed), typed).toEqual({ kind: "outOfRange" });
      expect(parseQuantity(typed), typed).toBeNull();
    }
    // "1.000" / "1,500" have three decimals as decimals, and are a guess as thousands: never
    // sent. BUG-574 — they are told WHY (`qa/recipes-and-editor-polish.spec.ts`), not the range.
    for (const typed of ["1.000", "1,500", "150.000"]) {
      expect(readQuantity(typed), typed).toEqual({ kind: "ambiguous" });
      expect(parseQuantity(typed), typed).toBeNull();
    }
    expect(localProblems(withQuantity("5 001"), fr)).toEqual([
      // BUG-572: the range sentence groups 5 000 (U+202F) like the format sentence.
      { at: "ingredients.0", message: `Une quantité est supérieure à 0 et au plus égale à 5${NNBSP}000, avec 2 décimales au plus.` },
    ]);
    expect(localProblems(withQuantity(""), fr)).toEqual([
      { at: "ingredients.0", message: "Saisissez une quantité.", missing: true },
    ]);
  });

  test("BUG-556 — a quantity whose digits cannot be read is told the FORMAT, never the range", () => {
    for (const typed of ["1 00", "10 00", "1  000", "1e3", "1,5,5", "12abc", ".5"]) {
      expect(readQuantity(typed), typed).toEqual({ kind: "malformed" });
      expect(localProblems(withQuantity(typed), fr), typed).toEqual([
        { at: "ingredients.0", message: `Saisissez une quantité, par exemple 1${NNBSP}000 ou 12,5.` },
      ]);
    }
    expect(localProblems(withQuantity("10 00"), en)).toEqual([
      { at: "ingredients.0", message: "Enter a quantity, for example 1000 or 12.5." },
    ]);
    // The examples the sentences give are themselves accepted, as written.
    for (const example of [`1${NNBSP}000`, "12,5", "1000", "12.5"]) {
      expect(readQuantity(example).kind, example).toBe("quantity");
    }
  });

  test("staff F1 — recipe kcal / macro digits that cannot be read are told the FORMAT, never the range", () => {
    for (const typed of ["18 00", "1  800", "1 25", "12abc", "1.000.000"]) {
      expect(parseWhole(typed), typed).toEqual({ kind: "malformed" });
    }
    // Range territory stays there: no digit, a negative.
    for (const typed of ["abc", "-5", "-1 800"]) {
      expect(parseWhole(typed), typed).toEqual({ kind: "invalid" });
    }
    expect(localProblems(recipe({ kcal: "18 00" }), fr)).toEqual([
      { at: "kcal", message: `Saisissez un nombre entier, par exemple 1${NNBSP}800.` },
    ]);
    expect(localProblems(recipe({ proteinG: "1 25" }), fr)).toEqual([
      { at: "proteinG", message: "Saisissez un nombre entier, par exemple 150." },
    ]);
    expect(localProblems(recipe({ kcal: "18 00" }), en)).toEqual([
      { at: "kcal", message: "Enter a whole number, for example 1800." },
    ]);
    // The examples are inside their fields' ranges, as written.
    expect(localProblems(recipe({ kcal: `1${NNBSP}800`, proteinG: "150" }), fr).map((p) => p.at)).not.toContain("kcal");
    expect(localProblems(recipe({ proteinG: "150" }), fr).map((p) => p.at)).not.toContain("proteinG");
  });

  test("staff F2 — the edges, pinned", () => {
    // A 4-digit integer is never "ambiguous thousands": "1234,500" is the decimal 1234.5.
    expect(parseWhole("1234,500")).toEqual({ kind: "fraction", value: 1234.5 });
    expect(parseTarget("1234,500")).toEqual({ kind: "notWhole" });
    // Twenty digits is not "above 0"'s problem.
    expect(parseTarget("99999999999999999999")).toEqual({ kind: "malformed" });
  });
});

/* ── rendered, in a French browser ──────────────────────────────────────────── */

/** Every POST the page sends from here on (a server action is a POST to the page). */
function posts(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST") seen.push(req.url());
  });
  return seen;
}

test.describe("a French browser (fr-FR)", () => {
  test.use({ locale: "fr-FR" });

  test("PB-2 — the targets card: '1 800' is saved as 1800; '1800,5' and '1,000' are told 'entier', '0' is told '> 0'; nothing sent", async ({
    page,
  }) => {
    await signInFrench(page);
    await page.goto(`/clients/${OMAR}/nutrition`);
    const calories = page.getByLabel("Calories", { exact: true });
    const save = page.getByRole("button", { name: "Enregistrer les objectifs", exact: true });
    // `p`: Next's route announcer is an empty role=alert of its own.
    const alert = page.locator('p[role="alert"]');
    const sent = posts(page);

    for (const [typed, sentence] of [
      ["1800,5", "Saisissez un nombre entier, sans décimales."],
      ["1,000", "Saisissez un nombre entier, sans décimales."],
      ["0", "Saisissez un nombre supérieur à 0."],
    ] as const) {
      await calories.fill(typed);
      await save.click();
      await expect(alert, typed).toHaveText(sentence);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    expect(sent, "no request may leave the browser for a refused target").toEqual([]);

    // The three spaces a French coach groups with. The first two only reach the confirm.
    for (const typed of ["1 800", `1${NBSP}800`]) {
      await calories.fill(typed);
      await save.click();
      await expect(alert).toHaveCount(0);
      const dialog = page.getByRole("dialog", { name: "Enregistrer les objectifs ?" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Annuler" }).click();
      await expect(dialog).toHaveCount(0);
    }
    expect(sent).toEqual([]);

    await calories.fill(`1${NNBSP}800`);
    await save.click();
    const dialog = page.getByRole("dialog", { name: "Enregistrer les objectifs ?" });
    await dialog.getByRole("button", { name: "Enregistrer les objectifs" }).click();
    await expect(page.getByText("Objectifs enregistrés.", { exact: true })).toBeVisible();
    // What was STORED, as the card re-reads it: 1800, not 1 and not 18.
    await expect(calories).toHaveValue("1800");
  });

  test("BUG-552 — the targets card: a misplaced space is told the format, never '> 0'; a thin space reaches the confirm", async ({
    page,
  }) => {
    await signInFrench(page);
    await page.goto(`/clients/${OMAR}/nutrition`);
    const calories = page.getByLabel("Calories", { exact: true });
    const protein = page.getByLabel("Protéines", { exact: true });
    const save = page.getByRole("button", { name: "Enregistrer les objectifs", exact: true });
    const alert = page.locator('p[role="alert"]');
    const sent = posts(page);
    const original = await protein.inputValue();

    for (const [input, typed] of [
      [calories, "18 00"],
      [calories, "1  800"],
      [protein, "1 25"],
    ] as const) {
      await input.fill(typed);
      await save.click();
      await expect(alert, typed).toHaveText(`Saisissez un nombre entier, par exemple 1${NNBSP}800.`);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await input.fill(input === protein ? original : "1800");
    }
    expect(sent, "no request may leave the browser for a refused target").toEqual([]);

    for (const space of [THIN, FIGURE]) {
      await calories.fill(`1${space}800`);
      await save.click();
      await expect(alert).toHaveCount(0);
      const dialog = page.getByRole("dialog", { name: "Enregistrer les objectifs ?" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Annuler" }).click();
      await expect(dialog).toHaveCount(0);
    }
    expect(sent).toEqual([]);
  });

  test("item 1 / BUG-553 — the recipe editor refuses '1.000' and '1200,5' kcal beside the field, and sends nothing", async ({
    page,
  }) => {
    await signInFrench(page);
    await page.goto(`/recipes/${CHICKEN_RICE_BOWL}`);
    const kcal = page.getByLabel("Calories (kcal)");
    const field = page.locator('[data-field="kcal"]');
    const save = page.getByRole("button", { name: "Enregistrer la recette" });
    const sent = posts(page);
    // fill() before hydration is a no-op for React state: retry until the island says it has it.
    await expect(async () => {
      await kcal.fill("1.000");
      await expect(page.getByText("Modifications non enregistrées", { exact: true })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });

    await expect(field.getByText("Saisissez un nombre entier, sans décimales.", { exact: true })).toBeVisible();
    await expect(kcal).toHaveAttribute("aria-invalid", "true");
    await expect(save).toBeDisabled();

    await kcal.fill("1200,5");
    await expect(field.getByText("Nombres entiers uniquement. Utilisez 1200 ou 1201.", { exact: true })).toBeVisible();
    await expect(save).toBeDisabled();
    expect(sent, "a refused kcal sends nothing — '1.000' was saved as 1 kcal").toEqual([]);

    // The control: the recipe's own value is accepted again.
    await kcal.fill("560");
    await expect(field.getByText(/Saisissez|Nombres entiers/)).toHaveCount(0);
    await expect(save).toBeEnabled();
  });

  test("BUG-556 / staff F1 — the recipe editor saves quantity « 1 000 » as 1000, and tells kcal « 18 00 » the format", async ({
    page,
  }) => {
    await signInFrench(page);
    await page.goto(`/recipes/${CHICKEN_RICE_BOWL}`);
    const quantity = page.locator('[data-field="ingredients.0"] input').first();
    const kcal = page.getByLabel("Calories (kcal)");
    const kcalField = page.locator('[data-field="kcal"]');
    const save = page.getByRole("button", { name: "Enregistrer la recette" });
    // A server action's POST body is its argument list: `[id, body]` for an update.
    const bodies: unknown[][] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.headers()["next-action"] !== undefined) {
        bodies.push(JSON.parse(req.postData() ?? "[]") as unknown[]);
      }
    });
    await expect(async () => {
      await quantity.fill("1 000");
      await expect(page.getByText("Modifications non enregistrées", { exact: true })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await expect(quantity).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText(/Une quantité est supérieure|Saisissez une quantité/)).toHaveCount(0);

    // kcal « 18 00 »: the format sentence beside the field, never the range one; nothing sent.
    await kcal.fill("18 00");
    await expect(kcalField.getByText(`Saisissez un nombre entier, par exemple 1${NNBSP}800.`, { exact: true })).toBeVisible();
    await expect(kcalField.getByText(/un nombre entier de 1 à 3000/)).toHaveCount(0);
    await expect(kcal).toHaveAttribute("aria-invalid", "true");
    await expect(save).toBeDisabled();
    expect(bodies, "a refused kcal sends nothing").toEqual([]);

    await kcal.fill("560");
    await expect(save).toBeEnabled();
    const answered = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined
    );
    await save.click();
    await answered;
    expect(bodies).toHaveLength(1);
    const [id, body] = bodies[0] as [string, { ingredients: { key: string; quantity: unknown }[] }];
    expect(id).toBe(CHICKEN_RICE_BOWL);
    expect(body.ingredients[0]).toMatchObject({ key: "chicken_breast", quantity: 1000 });

    // And what was STORED reads back as 1000 — once the editor has settled (its guard
    // releases the history sentinel after a save, so a reload before that is aborted).
    await expect(page.getByText("Recette enregistrée.", { exact: true })).toBeVisible();
    await expect(page.getByText("Modifications non enregistrées", { exact: true })).toHaveCount(0);
    await page.goto(`/recipes/${CHICKEN_RICE_BOWL}`);
    // BUG-571: reopened in French, it is written the French way — and reads back as 1000.
    await expect(page.locator('[data-field="ingredients.0"] input').first()).toHaveValue(`1${NNBSP}000`);
  });

  test("PB-4 — the week card's confirm names Omar with elision", async ({ page }) => {
    await signInFrench(page);
    await page.goto(`/clients/${OMAR}/nutrition`);
    await page.getByRole("button", { name: "Appliquer à Omar T.", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Appliquer cette semaine de repas ?" });
    await expect(dialog.getByText(/^Cela remplace la semaine de repas d'Omar T\. qui commence le /)).toBeVisible();
    await expect(dialog.getByText(/de Omar/)).toHaveCount(0);
  });

  test("PB-2 — the nutrition template editor: '1 800' is saved, '1800,5' is told 'entier' and nothing is sent", async ({
    page,
  }) => {
    await signInFrench(page);
    await page.goto("/nutrition-templates/new");
    await page.getByLabel("Nom du modèle").fill("Sèche 1800");
    await page.getByLabel("Protéines", { exact: true }).fill("150");
    await page.getByLabel("Glucides", { exact: true }).fill("170");
    await page.getByLabel("Lipides", { exact: true }).fill("60");
    const calories = page.getByLabel("Calories", { exact: true });
    const save = page.getByRole("button", { name: "Enregistrer le modèle" });
    const sent = posts(page);

    await calories.fill("1800,5");
    await save.click();
    await expect(page.locator('p[role="alert"]')).toHaveText("Saisissez un nombre entier, sans décimales.");
    await calories.fill("0");
    await save.click();
    await expect(page.locator('p[role="alert"]')).toHaveText("Saisissez un nombre supérieur à 0.");
    expect(sent, "a refused template sends nothing").toEqual([]);

    await calories.fill("1 800");
    await save.click();
    await page.waitForURL("/nutrition-templates");
    const row = page.getByRole("group", { name: "Sèche 1800", exact: true });
    await expect(row.getByText(`1${NNBSP}800 kcal · P 150 g · G 170 g · L 60 g`, { exact: true })).toBeVisible();
  });
});

test("PB-2 — in English, '1,000' kcal is refused with the whole-number sentence, never sent as 1", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("coach@evoli.fit");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
  await page.goto(`/clients/${OMAR}/nutrition`);
  const sent = posts(page);
  await page.getByLabel("Calories", { exact: true }).fill("1,000");
  await page.getByRole("button", { name: "Save targets" }).click();
  await expect(page.locator('p[role="alert"]')).toHaveText("Enter a whole number, without a decimal point or comma.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(sent).toEqual([]);
});
