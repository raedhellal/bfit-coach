import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";
import { localeFromAcceptLanguage } from "../src/lib/i18n/locale";
import {
  formatDate,
  formatGrams,
  formatInstant,
  formatKcal,
  formatKg,
  formatPct,
  formatWeekday,
  isoWeekdayLabel,
} from "../src/lib/format";

/**
 * EV-324 — the French portal's rules, driven WITHOUT a browser.
 *
 *   1. Locale detection (R1): the FIRST `Accept-Language` entry decides; `fr*` is French,
 *      everything else — and no header — is English. Both of the story's edge cases.
 *   2. Parity (AC4): every key English has, French has, with the same kind of value and the
 *      same argument count; and the reverse. `satisfies Copy` already makes a missing key a
 *      `tsc` error, but the enum-label maps are `Record<string, string>` and escape it, so
 *      this is the check that covers them.
 *   3. Nothing left in English by accident: a French string (or a French template's output)
 *      that is IDENTICAL to the English one must be on the allowlist below, with a reason.
 *   4. AC3's formats.
 *
 * The expected sentences are literals, never read back from the dictionaries they test.
 */

test.describe("locale detection (EV-324 R1)", () => {
  const cases: [string | null | undefined, "en" | "fr"][] = [
    ["fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7", "fr"], // Chrome with Français (France) first
    ["fr", "fr"],
    ["fr-CA,en;q=0.8", "fr"], // edge case 1: a prefix match on the first entry
    ["FR-be", "fr"],
    ["fr_CH", "fr"],
    ["de-DE,fr;q=0.9", "en"], // edge case 2: French listed, but not first
    ["en-US,en;q=0.9,fr;q=0.8", "en"],
    ["en-GB", "en"],
    ["es-ES,es;q=0.9", "en"],
    ["fy-NL", "en"], // Frisian is not French
    ["frr", "en"], // nor is North Frisian (ISO 639-3 `frr`) — "starts with fr" means the tag `fr`
    ["*", "en"],
    ["", "en"],
    [null, "en"],
    [undefined, "en"],
  ];
  for (const [header, expected] of cases) {
    test(`${JSON.stringify(header)} → ${expected}`, () => {
      expect(localeFromAcceptLanguage(header)).toBe(expected);
    });
  }
});

/** Every leaf of a dictionary: `path → "string" | "fn/<arity>" | typeof`. */
function shape(value: unknown, path = "", out = new Map<string, string>()): Map<string, string> {
  if (typeof value === "function") out.set(path, `fn/${value.length}`);
  else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) shape((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key, out);
  } else out.set(path, typeof value);
  return out;
}

function leaf(dict: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], dict);
}

test("French has every English key, with the same kind of value and arity — and no key English lacks", () => {
  const e = shape(en);
  const f = shape(fr);
  const missingInFrench = [...e.keys()].filter((k) => !f.has(k));
  const missingInEnglish = [...f.keys()].filter((k) => !e.has(k));
  const kindDiffers = [...e.keys()].filter((k) => f.has(k) && f.get(k) !== e.get(k)).map((k) => `${k}: en ${e.get(k)}, fr ${f.get(k)}`);
  expect(missingInFrench, "keys in copy.ts (en) with no French twin in copy.fr.ts").toEqual([]);
  expect(missingInEnglish, "keys in copy.fr.ts that English does not have").toEqual([]);
  expect(kindDiffers, "a key that is a string in one language and a template in the other, or a different arity").toEqual([]);
  // Pinned so the check cannot pass by comparing two empty maps.
  expect(e.size).toBeGreaterThan(500); // 600 leaves at EV-324; a floor, so adding keys never trips it
});

/**
 * Strings that are the SAME word in both languages, each for a stated reason. Anything
 * else identical in both is an untranslated string.
 */
const SAME_IN_BOTH: Record<string, string> = {
  brand: "product name",
  "login.passwordPlaceholder": "bullets",
  "invitePage.brand": "product name",
  "roster.colPlan": "French 'plan'",
  "client.adherenceValue": "numbers only",
  "progressGoal.withDate": "punctuation only",
  "tabs.nutrition": "French 'Nutrition'",
  "routine.repairLine": "arrows and the api's words",
  "routine.catalogMuscle": "French 'Muscle'",
  "nutrition.title": "French 'Nutrition'",
  "nutrition.calories": "French 'Calories'",
  "nutrition.kcal": "unit",
  "nutrition.grams": "unit",
  "nutrition.allergies": "French 'Allergies'",
  "foodLog.calories": "French 'Calories'",
  "foodLog.kcal": "unit",
  "foodLog.grams": "unit",
  "foodLog.pair": "numbers and a unit",
  "foodLog.serving": "a number and a unit",
  "foodLog.at": "a time and 'UTC'",
  "swapSheet.suggestions": "French 'Suggestions'",
  "templates.notesLabel": "French 'Notes'",
  "templates.tempoLabel": "French 'Tempo'",
  "recipes.unitNames.g": "unit",
  "recipes.unitNames.ml": "unit",
  "recipes.kcalLabel": "French 'Calories (kcal)'",
  "common.dash": "a dash",
  "challenges.colClient": "French 'Client'",
  "challenges.colTotal": "French 'Total'",
  "challenges.metricLabel": "French 'Type'",
  "challenges.source.HEALTH_CONNECT": "Google's product name, never translated",
  "guardrails.equipment.KETTLEBELL": "French 'Kettlebell' (b-fit-mobile fr.json)",
  // BUG-489 — catalogue words French spells the same.
  "catalog.muscles.biceps": "French 'Biceps'",
  "catalog.muscles.cardio": "French 'Cardio'",
  "catalog.muscles.obliques": "French 'Obliques'",
  "catalog.muscles.triceps": "French 'Triceps'",
  "catalog.equipment.kettlebell": "French 'Kettlebell', as in guardrails",
  "catalog.equipment.kettlebells": "French 'Kettlebells'",
  "catalog.equipment.machine": "French 'Machine'",
};

test("no French string or template output is left identical to English, outside the allowlist", () => {
  const identical: string[] = [];
  for (const [path, kind] of shape(en)) {
    const e = leaf(en, path);
    const f = leaf(fr, path);
    if (kind === "string") {
      if (e === f) identical.push(path);
    } else if (kind.startsWith("fn/")) {
      // Every argument a string: a template's WORDS are what is compared, not its maths.
      const args = Array.from({ length: Number(kind.slice(3)) }, () => "Qz");
      const call = (fn: unknown) => (fn as (...a: string[]) => string)(...args);
      if (call(e) === call(f)) identical.push(path);
    }
  }
  expect(identical.sort()).toEqual(Object.keys(SAME_IN_BOTH).sort());
});

test("the legal footer is the story's sentence in each language (AC5b)", () => {
  expect(en.legalFooter).toBe("Meal plans for healthy people. They do not replace medical advice or care from a dietitian.");
  expect(fr.legalFooter).toBe(
    "Plans alimentaires destinés à des personnes en bonne santé. Ils ne remplacent pas un avis médical ni le suivi d'un diététicien."
  );
});

test("AC3 — dates and numbers take the page's locale; English is unchanged", () => {
  // French: fr-FR, the story's own examples.
  expect(formatDate("2026-10-03", "fr")).toBe("3 oct. 2026");
  expect(formatInstant("2026-10-03T09:00:00Z", "fr")).toBe("3 oct. 2026");
  expect(formatKcal(7412, "fr")).toBe("7\u202f412"); // U+202F, the narrow no-break space
  expect(formatGrams(17.3, "fr")).toBe("17,3");
  expect(formatKg(70.4, "fr")).toBe("70,4\u00a0kg");
  expect(formatPct(24, "fr")).toBe("24,0\u00a0%");
  expect(formatWeekday("2026-10-05", "fr")).toBe("Lundi");
  expect(isoWeekdayLabel(7, "fr")).toBe("Dimanche");

  // English: exactly what the portal printed before EV-324 (en-GB). AC3 writes the English
  // date as "Oct 3, 2026" (en-US); AC2 — the existing suite passes with no change to its
  // expected strings — requires en-GB's "3 Oct 2026", which is what shipped. Recorded, not
  // silently resolved.
  expect(formatDate("2026-10-03", "en")).toBe("3 Oct 2026");
  expect(formatKcal(7412, "en")).toBe("7,412");
  expect(formatGrams(17.3, "en")).toBe("17.3");
  expect(formatKg(70.4, "en")).toBe("70.4 kg");
  expect(formatWeekday("2026-10-05", "en")).toBe("Monday");
});

test("a French sentence groups its numbers; the English one prints them as before", () => {
  expect(fr.nutrition.floorApplied(1450)).toBe("Calories relevées au minimum sûr de 1\u202f450 kcal.");
  expect(en.nutrition.floorApplied(1450)).toBe("Calories raised to a safe minimum of 1450 kcal.");
  expect(fr.placement.confirm("Salade", "Saumon teriyaki", "Mardi")).toBe(
    "Remplacer «\u00a0Salade\u00a0» par «\u00a0Saumon teriyaki\u00a0» le mardi ?"
  );
});
