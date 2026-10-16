import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";
import {
  COACH_NOTES_MAX_CODE_POINTS,
  INTAKE_CATALOGUE,
  INTAKE_FORM_SECTIONS,
  firstUnanswered,
  formFromApi,
  sectionAnswered,
  sectionToApi,
  type IntakeFormValues,
} from "../src/lib/intakeForm";

/**
 * EV-341c — the pure half of sections 5–8: the catalogue as data (C3, C4), the limits in code
 * points (C4, the edge case "a 4,000-code-point note in Arabic"), resume across eight sections
 * (B6 as C extends it), and the story's sentences verbatim in both languages (C1–C5).
 *
 * The browser half is `qa/intake-sections-5-8.spec.ts`. Red before EV-341c: the form knew four
 * sections, so `INTAKE_CATALOGUE.NUTRITION` / `.COACH_NOTES` were undefined and every test that
 * names them threw.
 */

/** French no-break spaces read as spaces (the kind of space is asserted where it matters). */
const plain = (text: string) => text.replace(/[  ]/g, " ");

test.describe("EV-341c the eight sections as data", () => {
  const empty = formFromApi(null);

  test("the form has the api's eight sections, in its order", () => {
    expect([...INTAKE_FORM_SECTIONS]).toEqual([
      "GOALS",
      "HISTORY",
      "AVAILABILITY",
      "LIFESTYLE",
      "HEALTH",
      "MEASUREMENTS",
      "NUTRITION",
      "COACH_NOTES",
    ]);
  });

  test("C1 / C2: sections 5 and 6 hold their note only (their read-only parts are never fields)", () => {
    expect(sectionToApi("HEALTH", empty)).toEqual({ values: { notes: null }, problems: [] });
    expect(sectionToApi("MEASUREMENTS", empty)).toEqual({ values: { notes: null }, problems: [] });
    expect(sectionToApi("HEALTH", { ...empty, "HEALTH.notes": "Knee ok" }).values).toEqual({ notes: "Knee ok" });
  });

  test("C3: section 7 is the catalogue's six fields and its note, the WHOLE section on every save", () => {
    expect(INTAKE_CATALOGUE.NUTRITION.map((f) => f.field)).toEqual([
      "usualMealsPerDay",
      "snacking",
      "cooking",
      "mealsOutPerWeek",
      "alcoholPerWeek",
      "waterPerDay",
      "notes",
    ]);
    expect(sectionToApi("NUTRITION", empty).values).toEqual({
      usualMealsPerDay: null,
      snacking: null,
      cooking: null,
      mealsOutPerWeek: null,
      alcoholPerWeek: null,
      waterPerDay: null,
      notes: null,
    });
    const form: IntakeFormValues = {
      ...empty,
      "NUTRITION.usualMealsPerDay": "3",
      "NUTRITION.snacking": "OFTEN",
      "NUTRITION.cooking": "RARELY",
      "NUTRITION.mealsOutPerWeek": "0",
      "NUTRITION.alcoholPerWeek": "D1_3",
      "NUTRITION.waterPerDay": "L1_2",
    };
    expect(sectionToApi("NUTRITION", form)).toEqual({
      values: {
        usualMealsPerDay: 3,
        snacking: "OFTEN",
        cooking: "RARELY",
        mealsOutPerWeek: 0,
        alcoholPerWeek: "D1_3",
        waterPerDay: "L1_2",
        notes: null,
      },
      problems: [],
    });
  });

  test("C3: the vocabularies are the api's (IntakeVocabulary); a stored value outside them reads as unanswered", () => {
    const options = (field: string) => {
      const f = INTAKE_CATALOGUE.NUTRITION.find((x) => x.field === field);
      return f && f.kind === "single" ? [...f.options] : null;
    };
    expect(options("snacking")).toEqual(["RARELY", "SOMETIMES", "OFTEN"]);
    expect(options("cooking")).toEqual(["RARELY", "SOMETIMES", "OFTEN"]);
    expect(options("alcoholPerWeek")).toEqual(["NONE", "D1_3", "D4_7", "GT_7"]);
    expect(options("waterPerDay")).toEqual(["LT_1L", "L1_2", "GT_2L"]);
    const form = formFromApi({ NUTRITION: { values: { snacking: "ALWAYS", usualMealsPerDay: "3", waterPerDay: "GT_2L" } } });
    expect(form["NUTRITION.snacking"]).toBe("");
    expect(form["NUTRITION.usualMealsPerDay"]).toBe("");
    expect(form["NUTRITION.waterPerDay"]).toBe("GT_2L");
  });

  test("C3: meals per day 1–6 and meals out 0–14, typed; outside them is a problem, never sent clamped", () => {
    for (const typed of ["0", "7", "2.5"]) {
      const out = sectionToApi("NUTRITION", { ...empty, "NUTRITION.usualMealsPerDay": typed });
      expect(out.problems, typed).toEqual([{ field: "usualMealsPerDay", kind: "range", min: 1, max: 6 }]);
      expect(out.values.usualMealsPerDay).toBeNull();
    }
    const out = sectionToApi("NUTRITION", { ...empty, "NUTRITION.mealsOutPerWeek": "15" });
    expect(out.problems).toEqual([{ field: "mealsOutPerWeek", kind: "range", min: 0, max: 14 }]);
    expect(sectionToApi("NUTRITION", { ...empty, "NUTRITION.mealsOutPerWeek": "14" }).problems).toEqual([]);
  });

  test("C4: section 8 is one text of 4,000 code points — 2,000 emoji + 2,000 Arabic letters pass, 4,001 is a problem", () => {
    expect(COACH_NOTES_MAX_CODE_POINTS).toBe(4000);
    expect(INTAKE_CATALOGUE.COACH_NOTES).toEqual([{ kind: "notes", field: "notes", max: 4000 }]);
    const note = "\u{1F600}".repeat(2000) + "ب".repeat(2000);
    expect(note.length, "6,000 UTF-16 units: a maxLength would have counted these").toBe(6000);
    expect(sectionToApi("COACH_NOTES", { ...empty, "COACH_NOTES.notes": note })).toEqual({ values: { notes: note }, problems: [] });
    expect(sectionToApi("COACH_NOTES", { ...empty, "COACH_NOTES.notes": `${note}a` }).problems).toEqual([
      { field: "notes", kind: "tooLong", max: 4000 },
    ]);
  });

  test("C4: sections 5–7 keep B16's 1,000 (only section 8 is 4,000)", () => {
    const thousand = "ب".repeat(1000);
    for (const section of ["HEALTH", "MEASUREMENTS", "NUTRITION"] as const) {
      expect(sectionToApi(section, { ...empty, [`${section}.notes`]: thousand }).problems, section).toEqual([]);
      expect(sectionToApi(section, { ...empty, [`${section}.notes`]: `${thousand}a` }).problems, section).toEqual([
        { field: "notes", kind: "tooLong", max: 1000 },
      ]);
    }
  });

  test("B6 across eight: the page opens on the first section with no answer, 5–8 included", () => {
    const answered = formFromApi({
      GOALS: { values: { primaryGoal: "LOSE_WEIGHT" } },
      HISTORY: { values: { level: "BEGINNER" } },
      AVAILABILITY: { values: { sessionsPerWeek: 3 } },
      LIFESTYLE: { values: { stressScore: 2 } },
    });
    expect(firstUnanswered(answered)).toBe("HEALTH");
    const more = formFromApi({
      GOALS: { values: { primaryGoal: "LOSE_WEIGHT" } },
      HISTORY: { values: { level: "BEGINNER" } },
      AVAILABILITY: { values: { sessionsPerWeek: 3 } },
      LIFESTYLE: { values: { stressScore: 2 } },
      HEALTH: { values: { notes: "n" } },
      MEASUREMENTS: { values: { notes: "n" } },
      NUTRITION: { values: { cooking: "OFTEN" } },
    });
    expect(sectionAnswered("NUTRITION", more)).toBe(true);
    expect(sectionAnswered("COACH_NOTES", more)).toBe(false);
    expect(firstUnanswered(more)).toBe("COACH_NOTES");
  });
});

test.describe("EV-341c the story's sentences, verbatim (EN and FR)", () => {
  const e = en.intakePage;
  const f = fr.intakePage;

  test("C1–C3: the read-only blocks' sentences", () => {
    expect(e.noInjuries).toBe("No injuries recorded.");
    expect(f.noInjuries).toBe("Aucune blessure indiquée.");
    expect(e.trainingNotShared("Lina")).toBe("Lina doesn't share their training.");
    expect(f.trainingNotShared("Lina")).toBe("Lina ne partage pas son programme.");
    expect(e.noMeasurements).toBe("No measurements yet.");
    expect(f.noMeasurements).toBe("Aucune mesure pour l'instant.");
    expect(e.measurementsNotShared("Lina")).toBe("Lina doesn't share their measurements.");
    expect(f.measurementsNotShared("Lina")).toBe("Lina ne partage pas ses mesures.");
    expect(e.nutritionNotShared("Lina")).toBe("Lina doesn't share their nutrition.");
    expect(f.nutritionNotShared("Lina")).toBe("Lina ne partage pas son alimentation.");
    // The existing `fromProfile` is the sentence C1 and C3 name (EV-185 AC1); unchanged.
    expect(en.profile.fromProfile).toBe("From the trainee's profile — you cannot change these here.");
    expect(fr.profile.fromProfile).toBe("Issu du profil du client — vous ne pouvez pas le modifier ici.");
  });

  test("C3b: the food-rules helper, the name mid-sentence", () => {
    expect(e.foodRulesNotHere("Lina")).toBe("Food rules (halal, kosher…) are entered by Lina in the app, not here.");
    expect(f.foodRulesNotHere("Lina")).toBe("Les règles alimentaires (halal, casher…) sont saisies par Lina dans l'app, pas ici.");
  });

  test("C4: the counter « {n} / 4 000 » / \"{n} / 4,000\" and B16's sentence at 4,000", () => {
    expect(e.coachNotesCounter(1234)).toBe("1,234 / 4,000");
    expect(plain(f.coachNotesCounter(1234))).toBe("1 234 / 4 000");
    expect(e.coachNotesTooLong).toBe("Too long: 4,000 characters at most.");
    expect(plain(f.coachNotesTooLong)).toBe("Trop long : 4 000 caractères au maximum.");
    // The house no-break space before the French colon.
    expect(f.coachNotesTooLong).toContain("long :");
  });

  test("C5: the finish action and the finished line", () => {
    expect(e.finish).toBe("Finish the intake");
    expect(f.finish).toBe("Terminer l'entretien");
    expect(e.finishedOn("16 Oct 2026")).toBe("Intake finished on 16 Oct 2026");
    expect(f.finishedOn("16 oct. 2026")).toBe("Entretien terminé le 16 oct. 2026");
  });

  test("the section titles, the catalogue's, in both languages", () => {
    expect([e.sections.HEALTH, e.sections.MEASUREMENTS, e.sections.NUTRITION, e.sections.COACH_NOTES]).toEqual([
      "Health",
      "Measurements and assessment",
      "Nutrition",
      "Coach's notes",
    ]);
    expect([f.sections.HEALTH, f.sections.MEASUREMENTS, f.sections.NUTRITION, f.sections.COACH_NOTES]).toEqual([
      "Santé",
      "Mensurations et bilan",
      "Alimentation",
      "Notes du coach",
    ]);
  });

  test("C3: section 7's labels and values (EV-341r R4's, as B9 rules), every value labelled in both languages", () => {
    for (const field of INTAKE_CATALOGUE.NUTRITION) {
      expect(e.fields[field.field], `EN label ${field.field}`).toBeTruthy();
      expect(f.fields[field.field], `FR label ${field.field}`).toBeTruthy();
      if (field.kind === "single") {
        for (const option of field.options) {
          expect(e.values[field.field]?.[option], `EN ${field.field}.${option}`).toBeTruthy();
          expect(f.values[field.field]?.[option], `FR ${field.field}.${option}`).toBeTruthy();
        }
      }
    }
    expect(f.values.alcoholPerWeek).toEqual({ NONE: "Aucun", D1_3: "1 à 3 verres", D4_7: "4 à 7 verres", GT_7: "Plus de 7 verres" });
    expect(f.values.waterPerDay).toEqual({ LT_1L: "Moins d'1 L", L1_2: "1 à 2 L", GT_2L: "Plus de 2 L" });
    expect(f.values.snacking).toEqual({ RARELY: "Rarement", SOMETIMES: "Parfois", OFTEN: "Souvent" });
  });
});
