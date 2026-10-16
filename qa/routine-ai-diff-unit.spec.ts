import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";
import type { Routine, RoutineExercise, RoutineTrainingDay } from "../src/lib/coachApi";
import { dayRows, repairMarkFor, repairMarkSentence, routineDiff } from "../src/lib/routineAi";

/**
 * EV-186n N1 — the comparison is ONE pure function of `baseDocument` and `proposal`
 * (`routineDiff`), unit-tested here for added, removed, replaced, prescription changed and
 * unchanged (collapsed) days. N2's sentence and N5's subject-field rule are pinned too.
 * Sentences are literals from the story's copy table.
 */

const ex = (name: string, sets = 3, reps: string | null = "8-12", extra: Partial<RoutineExercise> = {}): RoutineExercise => ({
  name,
  sets,
  reps,
  rest: "90s",
  tempo: null,
  notes: null,
  trackingType: "WEIGHT_REPS",
  durationSeconds: null,
  weight: null,
  ...extra,
});
const day = (dayOfWeek: number, focus: string, exercises: RoutineExercise[]): RoutineTrainingDay => ({
  dayOfWeek,
  focus,
  estimatedMinutes: null,
  exercises,
});
const doc = (days: RoutineTrainingDay[], extra: Partial<Routine> = {}): Routine => ({
  name: "Plan",
  goal: "BUILD_MUSCLE",
  level: "INTERMEDIATE",
  daysPerWeek: days.length,
  trainingDays: days,
  weeklyProgression: [],
  constraints: { equipment: [], injuries: [], minutesPerSession: 45, daysPerWeek: days.length },
  summary: null,
  ...extra,
});

test.describe("N1 — dayRows: one day's rows, in the proposal's order", () => {
  test("unchanged, prescription, replaced, removed, added", () => {
    const rows = dayRows(
      [ex("Squat"), ex("Bench", 3), ex("Row"), ex("Curl")],
      [ex("Squat"), ex("Bench", 4), ex("Pull-Up"), ex("Plank")]
    );
    expect(rows.map((r) => r.kind)).toEqual(["unchanged", "prescription", "replaced", "replaced"]);
    const prescription = rows[1];
    expect(prescription.kind === "prescription" && prescription.fields).toEqual(["sets"]);
    const replaced = rows[2];
    expect(replaced.kind === "replaced" && [replaced.before.name, replaced.after.name]).toEqual(["Row", "Pull-Up"]);
  });

  test("leftovers beyond the pairs are removed / added; matching ignores case and spaces", () => {
    expect(dayRows([ex("Squat"), ex("Row"), ex("Curl")], [ex(" squat ")]).map((r) => r.kind)).toEqual([
      "unchanged",
      "removed",
      "removed",
    ]);
    const added = dayRows([ex("Squat")], [ex("Squat"), ex("Lunge")]);
    expect(added.map((r) => r.kind)).toEqual(["unchanged", "added"]);
    expect(added[1].kind === "added" && added[1].afterIndex).toBe(1);
  });

  test("a reordering keeps the longest common run and reports the rest", () => {
    const rows = dayRows([ex("A"), ex("B"), ex("C")], [ex("B"), ex("C"), ex("A")]);
    expect(rows.map((r) => r.kind)).toEqual(["removed", "unchanged", "unchanged", "added"]);
  });

  test("null and empty string are the same value (no false prescription change)", () => {
    expect(dayRows([ex("Plank", 3, null, { notes: "" })], [ex("Plank", 3, null, { notes: null })])[0].kind).toBe("unchanged");
  });
});

test.describe("N1 — routineDiff: per weekday", () => {
  const base = doc([
    day(1, "Upper", [ex("Bench"), ex("Row")]),
    day(3, "Lower", [ex("Squat"), ex("RDL")]),
    day(5, "Full", [ex("Lunge")]),
  ]);

  test("added and removed sessions, a changed day and an unchanged day", () => {
    const proposal = doc([
      day(1, "Upper", [ex("Bench"), ex("Row")]),
      day(3, "Lower", [ex("Squat", 4), ex("RDL")]),
      day(6, "Core", [ex("Plank")]),
    ]);
    const diff = routineDiff(base, proposal);
    expect(diff.days.map((d) => [d.dayOfWeek, d.kind])).toEqual([
      [1, "unchanged"],
      [3, "changed"],
      [5, "removed"],
      [6, "added"],
    ]);
    expect(diff.identical).toBe(false);
  });

  test("a focus change alone makes the day changed", () => {
    const diff = routineDiff(base, doc([day(1, "Push", [ex("Bench"), ex("Row")]), base.trainingDays[1], base.trainingDays[2]]));
    expect(diff.days[0]).toMatchObject({ kind: "changed", focusBefore: "Upper", focusAfter: "Push" });
  });

  test("identical documents: identical, every day unchanged", () => {
    expect(routineDiff(base, structuredClone(base)).identical).toBe(true);
  });

  test("no base (baseSource NONE): every session is added, no settings rows", () => {
    const diff = routineDiff(null, doc([day(2, "A", [ex("X")])]));
    expect(diff.days.map((d) => d.kind)).toEqual(["added"]);
    expect(diff.settings).toEqual([]);
  });

  test("settings: name and minutes are rows; goal/level only when they differ", () => {
    const proposal = doc(base.trainingDays, {
      name: "New",
      constraints: { ...base.constraints, minutesPerSession: 60 },
    });
    expect(routineDiff(base, proposal).settings.map((s) => s.field)).toEqual(["name", "minutesPerSession"]);
    expect(routineDiff(base, doc(base.trainingDays, { level: "ADVANCED" })).settings.map((s) => s.field)).toEqual(["level"]);
  });

  test("N5: a LIVE-base proposal carrying the profile's equipment and injuries shows no subject row", () => {
    const live = doc(base.trainingDays, {
      constraints: { equipment: ["BARBELL", "GYM"], injuries: ["SHOULDER"], minutesPerSession: 45, daysPerWeek: 3 },
    });
    const diff = routineDiff(base, live);
    expect(diff.settings).toEqual([]);
    expect(diff.identical).toBe(true);
  });
});

test.describe("N2 — the repair mark", () => {
  const mark = { dayOfWeek: 2, exerciseIndex: 1, exerciseName: "Barbell Bench Press", injury: "SHOULDER", repair: "…" };
  test("located by weekday and the proposal row's index", () => {
    expect(repairMarkFor([mark], 2, 1)).toBe(mark);
    expect(repairMarkFor([mark], 2, 0)).toBeNull();
    expect(repairMarkFor([mark], 3, 1)).toBeNull();
  });
  test("the table's sentence, the injury as a word", () => {
    expect(repairMarkSentence(mark, "Dana", en)).toBe("Will be swapped at publish: Dana's Shoulders");
    expect(repairMarkSentence(mark, "Inès", fr).replace(/\u00a0/g, " ")).toBe("Sera remplacé à la publication : Épaules d'Inès");
    // Free text passes through verbatim; no injury still says « at publish ».
    expect(repairMarkSentence({ ...mark, injury: "left knee" }, "Dana", en)).toBe("Will be swapped at publish: Dana's left knee");
    expect(repairMarkSentence({ ...mark, injury: null }, "Dana", en)).toBe("Will be swapped at publish.");
  });
});
