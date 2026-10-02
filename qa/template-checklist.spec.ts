import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";
import type { Copy } from "../src/lib/copy";
import { blankTemplate, publishabilityReasons, templateChecklist, type TemplateDraft } from "../src/lib/templateDocument";
import { emptyDay, newExercise } from "../src/lib/routineDocument";

/**
 * EV-337i (plan §5.7) — the « Avant d'enregistrer » checklist RESTATES the editor's
 * validation; it adds no rule and drops none (`templateChecklist`,
 * src/lib/templateDocument.ts).
 *
 * The invariant pinned here, over drafts that trip every reason the validation knows:
 *   1. every line is met EXACTLY when `publishabilityReasons` is empty — the card and the
 *      disabled Save can never disagree;
 *   2. every reason the validation returns is on the card, word for word, or is one of
 *      the three lines the design draws in its unmet words (named, 2–6 days, a day with no
 *      exercise) — nothing the validation says is lost.
 *
 * Pure: it never calls the dev server. It imports `./fixture-test` only so the fixture
 * isolation guard needs no exemption.
 */

const COPIES: [string, Copy][] = [
  ["en", en as unknown as Copy],
  ["fr", fr as unknown as Copy],
];

function filled(copy: Copy, days = 2): TemplateDraft {
  const draft = blankTemplate(copy);
  const trainingDays = Array.from({ length: days }, (_, i) => ({
    ...emptyDay(i + 1, `Day ${i + 1}`),
    exercises: [newExercise({ name: "Back Squat", exerciseType: "WEIGHTED" } as never)],
  }));
  return { name: "Full body", document: { ...draft.document, trainingDays, daysPerWeek: days } };
}

function cases(copy: Copy): [string, TemplateDraft][] {
  const ok = filled(copy);
  const d = ok.document;
  return [
    ["blank", blankTemplate(copy)],
    ["valid", ok],
    ["unnamed", { ...ok, name: "   " }],
    ["name over 80", { ...ok, name: "x".repeat(81) }],
    ["one day", { ...ok, document: { ...d, trainingDays: d.trainingDays.slice(0, 1) } }],
    ["seven days", filled(copy, 7)],
    ["day 2 empty", { ...ok, document: { ...d, trainingDays: [d.trainingDays[0], { ...d.trainingDays[1], exercises: [] }] } }],
    ["no focus", { ...ok, document: { ...d, trainingDays: [d.trainingDays[0], { ...d.trainingDays[1], focus: " " }] } }],
    [
      "same weekday",
      { ...ok, document: { ...d, trainingDays: [d.trainingDays[0], { ...d.trainingDays[1], dayOfWeek: d.trainingDays[0].dayOfWeek }] } },
    ],
    ["no routine name", { ...ok, document: { ...d, name: "" } }],
    ["summary too long", { ...ok, document: { ...d, summary: "s".repeat(2_001) } }],
    [
      "everything at once",
      { name: "", document: { ...d, name: "", trainingDays: [{ ...d.trainingDays[0], exercises: [], focus: "" }] } },
    ],
  ];
}

for (const [lang, copy] of COPIES) {
  test.describe(`templateChecklist (${lang})`, () => {
    for (const [label, draft] of cases(copy)) {
      test(`${label}: met exactly when the validation is satisfied, and nothing it says is lost`, () => {
        const reasons = publishabilityReasons(draft, copy);
        const items = templateChecklist(draft, copy);
        expect(items.every((i) => i.ok), `${label}: ${JSON.stringify({ reasons, items })}`).toBe(reasons.length === 0);

        const unmet = items.filter((i) => !i.ok).map((i) => i.label);
        const c = copy.templateEditor.checklist;
        for (const reason of reasons) {
          const day = draft.document.trainingDays.findIndex((_, i) => copy.templates.dayEmpty(i + 1) === reason);
          const expected = day >= 0 ? c.dayEmpty(day + 1) : reason;
          expect(unmet, `${label}: the reason « ${reason} » is on the card`).toContain(expected);
        }
        // And nothing unmet that the validation did not say.
        expect(unmet.length, `${label}: one unmet line per reason`).toBe(reasons.length);
        // The three lines the design draws are always there, first.
        expect(items.slice(0, 2).map((i) => i.key)).toEqual(["named", "days"]);
      });
    }
  });
}

test("the design's three lines, met, in both languages", () => {
  expect(templateChecklist(filled(en as unknown as Copy), en as unknown as Copy).map((i) => [i.ok, i.label])).toEqual([
    [true, "Name filled in"],
    [true, "Between 2 and 6 training days"],
    [true, "Every day has at least one exercise"],
  ]);
  expect(templateChecklist(filled(fr as unknown as Copy), fr as unknown as Copy).map((i) => [i.ok, i.label])).toEqual([
    [true, "Nom renseigné"],
    [true, "Entre 2 et 6 jours d'entraînement"],
    [true, "Chaque jour a au moins un exercice"],
  ]);
});
