import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";
import { firstName } from "../src/lib/format";

/**
 * BUG-720 (ruling 720-R1) — `firstName()`'s fallback, "This trainee" / « Ce client », keeps its
 * capital only as a sentence's first word. Everywhere else it is "this trainee" / « ce client »:
 * "Nothing was changed for this trainee.", « Les objectifs de ce client … ».
 *
 * This file pins EVERY copy function the fallback reaches, found by a code trace from the six
 * `firstName()` calls (overview `page.tsx`, `routineChange.ts`, `ProgressGoalBlock`,
 * `NutritionWeekCard` → `SwapSheet` → `refusalSentence`, `NutritionTemplateLibrary`,
 * `TemplateUseOutcome`), not by a grep of the copy files. Each row is called with what the
 * component passes for a nameless trainee: `firstName(null, locale)`.
 *
 * The expected sentences are LITERALS, never built from `src/lib/copy.ts`. Whitespace KIND is
 * not under test here (U+00A0 / U+202F are the French polish specs'): both sides are compared
 * with no-break spaces read as spaces.
 *
 * The browser half (the template-use outcome, the confirm dialog and the routine banner of a
 * nameless trainee, EN and FR, Chromium and WebKit) is in `pro-roster-unnamed-client.spec.ts`.
 */

const plain = (text: string) => text.replace(/[  ]/g, " ");

type Row = { key: string; text: string; expected: string };

function enRows(): Row[] {
  const first = firstName(null, "en");
  const t = en.nutritionTemplates;
  return [
    // Sentence-initial: the capital stays.
    { key: "progressGoal.noWeightYet", text: en.progressGoal.noWeightYet(first), expected: "This trainee hasn't recorded a weight yet." },
    { key: "progressGoal.notShared", text: en.progressGoal.notShared(first), expected: "This trainee hasn't shared their weigh-ins with you." },
    {
      key: "routine.traineeChanged",
      text: en.routine.traineeChanged(first, "24 Sep 2026"),
      expected: "This trainee changed this plan on 24 Sep 2026 (UTC). You're seeing their version.",
    },
    {
      key: "nutrition.weekGenerating",
      text: en.nutrition.weekGenerating(first),
      expected: "This trainee's meal week is still being prepared. Try again in a few minutes.",
    },
    { key: "nutrition.weekRefusedNoWeek", text: en.nutrition.weekRefusedNoWeek(first), expected: "This trainee has no meal week right now." },
    {
      key: "placement.mealEaten",
      text: en.placement.mealEaten(first),
      expected: "This trainee has already eaten this meal, so it can't be replaced.",
    },
    {
      key: "placement.mealLocked",
      text: en.placement.mealLocked(first),
      expected: "This trainee has already locked this meal, so it can't be replaced.",
    },
    {
      key: "nutritionTemplates.confirmBody",
      text: t.confirmBody(first, "5 Oct 2026"),
      expected:
        "This trainee's meals for this week (from 5 Oct 2026) are rebuilt to these targets straight away, with their own number of meals a day. Their allergies and dietary rules still apply. Meals they have locked or already eaten are kept.",
    },
    {
      key: "nutritionTemplates.readFailed",
      text: t.readFailed(first),
      expected: "This trainee's current targets could not be read, so nothing was sent. Close this and try again.",
    },
    {
      key: "nutritionTemplates.weekRateLimited",
      text: t.weekRateLimited(first),
      expected:
        "This trainee's targets are updated. Their meals weren't rebuilt: a week has already been applied for them today. Try again tomorrow.",
    },
    { key: "nutritionTemplates.targetsUpdated", text: t.targetsUpdated(first), expected: "This trainee's targets are updated." },
    {
      key: "nutritionTemplates.weekFailed",
      text: t.weekFailed(first, "Apply to Unnamed client"),
      expected:
        "This trainee's targets are updated. Their meals couldn't be rebuilt. Use “Apply to Unnamed client” to try again.",
    },
    {
      key: "nutritionTemplates.weekUnknown",
      text: t.weekUnknown(first),
      expected:
        "This trainee's targets are updated. We couldn't confirm whether their meals were rebuilt. Check their nutrition page before you try again.",
    },
    // English names the FULL name here and ignores `first`: unchanged, stated.
    {
      key: "nutrition.dayRegenCapped",
      text: en.nutrition.dayRegenCapped("Unnamed client", first),
      expected: "Today's day regenerations for Unnamed client are used up.",
    },

    // Mid-sentence: lower case.
    {
      key: "nutrition.weekRefusedTitle",
      text: en.nutrition.weekRefusedTitle(first),
      expected: "We couldn't build a meal week for this trainee.",
    },
    {
      key: "nutrition.weekRefusedKept",
      text: en.nutrition.weekRefusedKept(first),
      expected: "The week below is still this trainee's current week — it hasn't been touched.",
    },
    {
      key: "nutrition.refusedAskThem",
      text: en.nutrition.refusedAskThem(first),
      expected: "You can't change this trainee's food preferences from here. Ask them to review them in the app.",
    },
    {
      key: "nutrition.dayRefusedTitle",
      text: en.nutrition.dayRefusedTitle("Monday", first),
      expected: "We couldn't rebuild Monday for this trainee.",
    },
    {
      key: "placement.excludedIngredient",
      text: en.placement.excludedIngredient("Pad thai", first, "Peanuts"),
      expected: "“Pad thai” can't be used for this trainee: Peanuts conflicts with their dietary settings.",
    },
    {
      key: "placement.excludedName",
      text: en.placement.excludedName("Pad thai", first),
      expected:
        "“Pad thai” can't be used for this trainee: its name contains a word that conflicts with their dietary settings. Rename the recipe and try again.",
    },
    {
      key: "placement.ruleUncheckable",
      text: en.placement.ruleUncheckable(first),
      expected:
        "Recipes can't be used for this trainee yet: Evoli can't check a hand-written recipe for kosher meat-and-dairy combinations. Their generated meals are not affected.",
    },
    {
      key: "placement.allergiesUncheckable",
      text: en.placement.allergiesUncheckable(first),
      expected:
        "Recipes can't be used for this trainee yet: Evoli can't safety-check a hand-written recipe against their dietary settings. Their generated meals are not affected.",
    },
    {
      key: "placement.belowFloor",
      text: en.placement.belowFloor(first, "Monday", 700, 900),
      expected:
        "This would bring this trainee's Monday to 700 kcal, below their minimum of 900 kcal. Choose a recipe with more calories.",
    },
    {
      key: "placement.accessDenied",
      text: en.placement.accessDenied(first),
      expected: "This recipe could not be used for this trainee.",
    },
    {
      key: "placement.applyWarning",
      text: en.placement.applyWarning(3, first),
      expected: "This replaces up to 3 meals placed from coach recipes. Meals this trainee has eaten are kept.",
    },
    { key: "nutritionTemplates.confirmTitle", text: t.confirmTitle("Cut 1800", first), expected: "Use “Cut 1800” on this trainee?" },
    {
      key: "nutritionTemplates.floorWarning",
      text: t.floorWarning(first),
      expected: "If this is below this trainee's safe minimum, Evoli raises it to the minimum and tells you.",
    },
    { key: "nutritionTemplates.reading", text: t.reading(first), expected: "Reading this trainee's current targets…" },
    { key: "nutritionTemplates.applied", text: t.applied("Cut 1800", first), expected: "“Cut 1800” is now this trainee's plan." },
    { key: "nutritionTemplates.targetsFailed", text: t.targetsFailed(first), expected: "Nothing was changed for this trainee. Try again." },
    {
      key: "nutritionTemplates.targetsUnknown",
      text: t.targetsUnknown(first),
      expected: "We couldn't confirm whether this trainee's targets changed. Check their nutrition page before you try again.",
    },
  ];
}

function frRows(): Row[] {
  const first = firstName(null, "fr");
  const t = fr.nutritionTemplates;
  return [
    // En tête de phrase : la majuscule reste.
    { key: "progressGoal.noWeightYet", text: fr.progressGoal.noWeightYet(first), expected: "Ce client n'a pas encore enregistré de poids." },
    { key: "progressGoal.notShared", text: fr.progressGoal.notShared(first), expected: "Ce client n'a pas partagé ses pesées avec vous." },
    {
      key: "routine.traineeChanged",
      text: fr.routine.traineeChanged(first, "24 sept. 2026"),
      expected: "Ce client a modifié ce plan le 24 sept. 2026 (UTC). Vous voyez sa version.",
    },
    {
      key: "nutrition.weekRefusedNoWeek",
      text: fr.nutrition.weekRefusedNoWeek(first),
      expected: "Ce client n'a pas de semaine de repas pour le moment.",
    },
    {
      key: "placement.mealEaten",
      text: fr.placement.mealEaten(first),
      expected: "Ce client a déjà mangé ce repas, il ne peut donc pas être remplacé.",
    },
    {
      key: "placement.mealLocked",
      text: fr.placement.mealLocked(first),
      expected: "Ce client a verrouillé ce repas, il ne peut donc pas être remplacé.",
    },

    // Dans la phrase : minuscule, et « de ce client » / « que ce client » sans élision.
    {
      key: "nutrition.weekGenerating",
      text: fr.nutrition.weekGenerating(first),
      expected: "La semaine de repas de ce client est encore en préparation. Réessayez dans quelques minutes.",
    },
    {
      key: "nutrition.dayRegenCapped",
      text: fr.nutrition.dayRegenCapped("Client sans nom", first),
      expected: "Les régénérations de jour de ce client sont épuisées pour aujourd'hui.",
    },
    {
      key: "nutrition.weekRefusedTitle",
      text: fr.nutrition.weekRefusedTitle(first),
      expected: "Nous n'avons pas pu construire de semaine de repas pour ce client.",
    },
    {
      key: "nutrition.weekRefusedKept",
      text: fr.nutrition.weekRefusedKept(first),
      expected: "La semaine ci-dessous reste la semaine en cours de ce client — elle n'a pas été modifiée.",
    },
    {
      key: "nutrition.refusedAskThem",
      text: fr.nutrition.refusedAskThem(first),
      expected:
        "Vous ne pouvez pas modifier les préférences alimentaires de ce client ici. Demandez-lui de les vérifier dans l'app.",
    },
    {
      key: "nutrition.dayRefusedTitle",
      text: fr.nutrition.dayRefusedTitle("Lundi", first),
      expected: "Nous n'avons pas pu reconstruire le lundi pour ce client.",
    },
    {
      key: "placement.excludedIngredient",
      text: fr.placement.excludedIngredient("Pad thaï", first, "Arachides"),
      expected: "« Pad thaï » ne peut pas être utilisée pour ce client : Arachides est incompatible avec ses préférences alimentaires.",
    },
    {
      key: "placement.excludedName",
      text: fr.placement.excludedName("Pad thaï", first),
      expected:
        "« Pad thaï » ne peut pas être utilisée pour ce client : son nom contient un mot incompatible avec ses préférences alimentaires. Renommez la recette et réessayez.",
    },
    {
      key: "placement.ruleUncheckable",
      text: fr.placement.ruleUncheckable(first),
      expected:
        "Les recettes ne peuvent pas encore être utilisées pour ce client : Evoli ne sait pas vérifier une recette écrite à la main pour les associations viande-lait de la cacherout. Ses repas générés ne sont pas concernés.",
    },
    {
      key: "placement.allergiesUncheckable",
      text: fr.placement.allergiesUncheckable(first),
      expected:
        "Les recettes ne peuvent pas encore être utilisées pour ce client : Evoli ne sait pas contrôler une recette écrite à la main au regard de ses préférences alimentaires. Ses repas générés ne sont pas concernés.",
    },
    {
      key: "placement.belowFloor",
      text: fr.placement.belowFloor(first, "Lundi", 700, 900),
      expected: "Cela ramènerait le lundi de ce client à 700 kcal, sous son minimum de 900 kcal. Choisissez une recette plus calorique.",
    },
    {
      key: "placement.accessDenied",
      text: fr.placement.accessDenied(first),
      expected: "Cette recette n'a pas pu être utilisée pour ce client.",
    },
    {
      key: "placement.applyWarning",
      text: fr.placement.applyWarning(3, first),
      expected:
        "Cela remplace jusqu'à 3 repas placés à partir de recettes de coach. Les repas que ce client a mangés sont conservés.",
    },
    { key: "nutritionTemplates.confirmTitle", text: t.confirmTitle("Cut 1800", first), expected: "Utiliser « Cut 1800 » pour ce client ?" },
    {
      key: "nutritionTemplates.confirmBody",
      text: t.confirmBody(first, "5 oct. 2026"),
      expected:
        "Les repas de ce client pour cette semaine (à partir du 5 oct. 2026) sont reconstruits immédiatement selon ces objectifs, avec son propre nombre de repas par jour. Ses allergies et ses règles alimentaires s'appliquent toujours. Les repas verrouillés ou déjà mangés par ce client sont conservés.",
    },
    {
      key: "nutritionTemplates.floorWarning",
      text: t.floorWarning(first),
      expected: "Si c'est en dessous du minimum sûr de ce client, Evoli le relève à ce minimum et vous le signale.",
    },
    { key: "nutritionTemplates.reading", text: t.reading(first), expected: "Lecture des objectifs actuels de ce client…" },
    {
      key: "nutritionTemplates.readFailed",
      text: t.readFailed(first),
      expected:
        "Les objectifs actuels de ce client n'ont pas pu être lus, donc rien n'a été envoyé. Fermez cette fenêtre et réessayez.",
    },
    { key: "nutritionTemplates.applied", text: t.applied("Cut 1800", first), expected: "« Cut 1800 » est désormais le plan de ce client." },
    {
      key: "nutritionTemplates.weekRateLimited",
      text: t.weekRateLimited(first),
      expected:
        "Les objectifs de ce client sont mis à jour. Ses repas n'ont pas été reconstruits : une semaine a déjà été appliquée pour ce client aujourd'hui. Réessayez demain.",
    },
    { key: "nutritionTemplates.targetsUpdated", text: t.targetsUpdated(first), expected: "Les objectifs de ce client sont mis à jour." },
    {
      key: "nutritionTemplates.weekFailed",
      text: t.weekFailed(first, "Appliquer à Client sans nom"),
      expected:
        "Les objectifs de ce client sont mis à jour. Ses repas n'ont pas pu être reconstruits. Utilisez « Appliquer à Client sans nom » pour réessayer.",
    },
    {
      key: "nutritionTemplates.weekUnknown",
      text: t.weekUnknown(first),
      expected:
        "Les objectifs de ce client sont mis à jour. Nous n'avons pas pu confirmer si ses repas ont été reconstruits. Vérifiez sa page nutrition avant de réessayer.",
    },
    { key: "nutritionTemplates.targetsFailed", text: t.targetsFailed(first), expected: "Rien n'a été modifié pour ce client. Réessayez." },
    {
      key: "nutritionTemplates.targetsUnknown",
      text: t.targetsUnknown(first),
      expected:
        "Nous n'avons pas pu confirmer si les objectifs de ce client ont changé. Vérifiez sa page nutrition avant de réessayer.",
    },
  ];
}

const ROWS = { en: enRows, fr: frRows } as const;
/** The fallback as each language spells it at the start of a sentence, and inside one. */
const FALLBACK = {
  en: { lead: "This trainee", inside: "this trainee" },
  fr: { lead: "Ce client", inside: "ce client" },
} as const;

/**
 * Every copy function the trace found, by language: 31 keys each. Pinned, so a row dropped from
 * the table (and with it a call site) fails here rather than going quiet.
 */
const KEYS = 31;

for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-720 — the fallback's case, sentence by sentence (${lang})`, () => {
    test(`every traced sentence reads exactly as 720-R1 has it`, () => {
      const rows = ROWS[lang]();
      expect(rows.map((r) => r.key)).toHaveLength(KEYS);
      expect(new Set(rows.map((r) => r.key)).size, "no key twice").toBe(KEYS);
      for (const row of rows) expect(plain(row.text), row.key).toBe(plain(row.expected));
    });

    test("the capital only ever starts a sentence; the lower case never does", () => {
      const { lead, inside } = FALLBACK[lang];
      for (const row of ROWS[lang]()) {
        const text = plain(row.text);
        // A sentence starts at the beginning, or after ". " / "? " / "! ".
        for (let at = text.indexOf(lead); at >= 0; at = text.indexOf(lead, at + 1)) {
          expect(at === 0 || /[.?!] $/.test(text.slice(0, at)), `${row.key}: "${lead}" mid-sentence at ${at}`).toBe(true);
        }
        expect(new RegExp(`(^|[.?!] )${inside}`).test(text), `${row.key}: "${inside}" starts a sentence`).toBe(false);
      }
    });
  });
}

test("a real first name is never lower-cased, and still elides in French", () => {
  // `firstName` gives one whitespace-free token; the fallback is two words, so no name can match it.
  expect(en.nutritionTemplates.targetsFailed(firstName("this Smith", "en"))).toBe("Nothing was changed for this. Try again.");
  expect(en.nutritionTemplates.targetsFailed(firstName("Petra L.", "en"))).toBe("Nothing was changed for Petra. Try again.");
  expect(plain(fr.nutritionTemplates.targetsUpdated(firstName("Inès Roux", "fr")))).toBe("Les objectifs d'Inès sont mis à jour.");
  expect(plain(fr.nutritionTemplates.targetsUpdated(firstName("Ce", "fr")))).toBe("Les objectifs de Ce sont mis à jour.");
});
