import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";
import { localeFromAcceptLanguage, resolveLocale } from "../src/lib/i18n/locale";
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
 *   1. Locale detection. RE-PINNED 2026-10-02 (Evoli Pro redesign, branch 1): EV-324's
 *      ruling R1 ("the FIRST entry decides; anything else, and no header, is English") is
 *      REPLACED by Raed's "a FR/EN switch, French by default", restated by the coordinator:
 *      of the entries that are French or English, the highest `q` wins (the earlier on a
 *      tie); if there is none — no header, `*`, `de-DE` — French. Each case below that R1
 *      answered differently says so. The switch's cookie outranks all of this
 *      (`resolveLocale`, last block).
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

test.describe("locale detection (redesign 2026-10-02; replaces EV-324 R1)", () => {
  const cases: [string | null | undefined, "en" | "fr", string?][] = [
    ["fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7", "fr"], // Chrome with Français (France) first
    ["fr", "fr"],
    ["fr-CA,en;q=0.8", "fr"], // a prefix match, and the higher q
    ["FR-be", "fr"],
    ["fr_CH", "fr"],
    ["de-DE,fr;q=0.9", "fr", "R1: en — French listed but not first; now the only supported entry"],
    ["de-DE", "fr", "R1: en — no French or English entry is no preference: French"],
    ["en-US,en;q=0.9,fr;q=0.8", "en"],
    ["en-US", "en"],
    ["en-GB", "en"],
    ["fr;q=0.5,en;q=0.9", "en"], // the highest q wins, not the first entry
    ["en;q=0.5,fr;q=0.5", "en"], // a tie keeps the browser's order
    ["en;q=0,fr;q=0.1", "fr"], // q=0 is "not acceptable"
    ["es-ES,es;q=0.9", "fr", "R1: en"],
    ["fy-NL", "fr", "R1: en — Frisian is not French, and not English either"],
    ["frr", "fr", "R1: en — nor is North Frisian (`frr`): \"fr\" means the tag `fr`"],
    ["eng", "fr", "the same rule for English: `eng` is not the tag `en`"],
    ["*", "fr", "R1: en"],
    ["", "fr", "R1: en"],
    [null, "fr", "R1: en"],
    [undefined, "fr", "R1: en"],
  ];
  for (const [header, expected, was] of cases) {
    test(`${JSON.stringify(header)} → ${expected}${was ? ` (${was})` : ""}`, () => {
      expect(localeFromAcceptLanguage(header)).toBe(expected);
    });
  }

  test("the switch's cookie outranks the browser; an unknown cookie value is ignored", () => {
    expect(resolveLocale("en", "fr-FR")).toBe("en");
    expect(resolveLocale("fr", "en-US")).toBe("fr");
    expect(resolveLocale("de", "en-US")).toBe("en");
    expect(resolveLocale("", null)).toBe("fr");
    expect(resolveLocale(undefined, "en-GB,en;q=0.9")).toBe("en");
  });
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
  "invited.colSent": "French 'Invitation' (EV-204b: the column label; its value says « Envoyée le … »)",
  "roster.groupCount": "French 'clients' (EV-337d: « 6 clients »)",
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
  "nutrition.allergyPresetLabels.Gluten": "French 'Gluten' (BUG-694, b-fit-mobile fr.json)",
  "nutrition.dislikePresetLabels.Olives": "French 'Olives' (BUG-694, b-fit-mobile fr.json)",
  "nutrition.ruleLabels.HALAL": "French 'Halal' (BUG-706, b-fit-mobile fr.json; English is 'Halal' too, en.json)",
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
  "challenges.participantsTitle": "French 'Participants' (EV-337h)",
  "challenges.ratio": "numbers only (EV-337h: « 1 / 3 », « 5 / 7 »)",
  "routine.settingsLine": "EV-344: the goal and level arrive already translated; 'min' is the French abbreviation too",
  "routine.settingsLinePending": "EV-344-R3: the sentence arrives already translated; 'min' is the French abbreviation too",
  "guardrails.equipment.KETTLEBELL": "French 'Kettlebell' (b-fit-mobile fr.json)",
  // BUG-489 — catalogue words French spells the same.
  "catalog.muscles.biceps": "French 'Biceps'",
  "catalog.muscles.cardio": "French 'Cardio'",
  "catalog.muscles.obliques": "French 'Obliques'",
  "catalog.muscles.triceps": "French 'Triceps'",
  "catalog.equipment.kettlebell": "French 'Kettlebell', as in guardrails",
  "catalog.equipment.kettlebells": "French 'Kettlebells'",
  "catalog.equipment.machine": "French 'Machine'",
  "catalog.equipment.trx": "a brand name",
  "catalog.equipment.vitruvian": "a brand name",
  "catalog.equipment.yoga": "French 'Yoga'",
  "catalog.equipment.cardio": "French 'Cardio'",
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
  // BUG-270: U+00A0 since, so "70.4" and "kg" never wrap apart; it renders as the same space.
  expect(formatKg(70.4, "en")).toBe("70.4\u00a0kg");
  expect(formatWeekday("2026-10-05", "en")).toBe("Monday");
});

test("a French sentence groups its numbers; the English one prints them as before", () => {
  expect(fr.nutrition.floorApplied(1450)).toBe("Calories relevées au minimum sûr de 1\u202f450 kcal.");
  expect(en.nutrition.floorApplied(1450)).toBe("Calories raised to a safe minimum of 1450 kcal.");
  expect(fr.placement.confirm("Salade", "Saumon teriyaki", "Mardi")).toBe(
    "Remplacer «\u00a0Salade\u00a0» par «\u00a0Saumon teriyaki\u00a0» le mardi ?"
  );
});
