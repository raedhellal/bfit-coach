import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";
import type { Routine, RoutineExercise } from "../src/lib/coachApi";
import {
  blankRoutine,
  documentReasons,
  editableDocument,
  forDraftSave,
  newExercise,
  withServerFields,
  withTrackingType,
  withoutDurationReps,
} from "../src/lib/routineDocument";
import { forSave as forTemplateSave, publishabilityReasons } from "../src/lib/templateDocument";
import { failureSentence, routineFailure } from "../src/lib/routineFailure";

/**
 * BUG-195c — the request builder and the error mapping, with no server and no browser.
 *
 * These are the two pure halves of the write path: `forDraftSave` builds the ONE body
 * `PUT …/routine/draft` receives, and `routineFailure` / `failureSentence` turn what the
 * api refuses into this surface's words. The browser specs prove the wiring; these prove
 * the contract itself, case by case, including the cases the fixture cannot reach (a
 * 409 with no timestamp, a subject-field 400 the portal never sends).
 *
 * Every expected value is WRITTEN OUT rather than derived from the module under test —
 * a fixture computed by the function it checks agrees with it by construction.
 */

/** A token with MICROSECONDS, as the api serves it. `Date` would keep only milliseconds. */
const TOKEN = "2026-09-30T09:14:07.123456Z";

function exercise(overrides: Partial<RoutineExercise> = {}): RoutineExercise {
  return {
    name: "Goblet Squat",
    sets: 3,
    reps: "8-12",
    rest: "90s",
    tempo: "3-1-1",
    notes: "Chest tall",
    trackingType: "WEIGHT_REPS",
    durationSeconds: null,
    weight: "16 kg",
    ...overrides,
  };
}

/** A document as GET …/routine serves it AFTER BUG-194: the trainee's own lists inside. */
function published(): Routine {
  return {
    name: "3-Day Strength Base",
    goal: "BUILD_MUSCLE",
    level: "INTERMEDIATE",
    daysPerWeek: 3,
    trainingDays: [
      {
        dayOfWeek: 1,
        focus: "Lower",
        estimatedMinutes: 45,
        exercises: [
          exercise(),
          exercise({
            name: "Plank",
            reps: null,
            rest: "30s",
            tempo: null,
            notes: null,
            trackingType: "DURATION",
            durationSeconds: 45,
            weight: null,
          }),
        ],
      },
      {
        dayOfWeek: 3,
        focus: "Upper",
        estimatedMinutes: 40,
        exercises: [exercise({ name: "Push-Up", reps: "10", rest: "60s", tempo: null, weight: "bodyweight" })],
      },
      {
        dayOfWeek: 5,
        focus: "Full",
        estimatedMinutes: null,
        exercises: [exercise({ name: "Inverted Row", reps: "8", tempo: null, notes: null, weight: null })],
      },
    ],
    weeklyProgression: [{ week: 2, adjustment: "Add one set to the main lifts", rationale: null }],
    constraints: {
      equipment: ["DUMBBELLS", "PULL_UP_BAR"],
      injuries: ["SHOULDER"],
      minutesPerSession: 45,
      daysPerWeek: 3,
    },
    summary: "Three full-body sessions a week.",
  };
}

test.describe("forDraftSave — the one body PUT …/routine/draft receives", () => {
  test("the wrapper carries exactly the token and the document, and the token travels VERBATIM", () => {
    const body = forDraftSave(published(), TOKEN);
    expect(Object.keys(body).sort()).toEqual(["document", "replacesDraftUpdatedAt"]);
    // Microseconds intact: a Date round trip would send ".123Z" and the api would 409.
    expect(body.replacesDraftUpdatedAt).toBe("2026-09-30T09:14:07.123456Z");
    expect(JSON.parse(JSON.stringify(body)).replacesDraftUpdatedAt).toBe(TOKEN);
  });

  test("null means 'only if there is no draft', and it is sent as null, not dropped", () => {
    const body = forDraftSave(published(), null);
    expect(body.replacesDraftUpdatedAt).toBeNull();
    expect(JSON.parse(JSON.stringify(body))).toHaveProperty("replacesDraftUpdatedAt", null);
  });

  test("the trainee's equipment and injuries are ALWAYS sent [] (AC3.10 / ADR-0018 D9)", () => {
    const { document } = forDraftSave(published(), TOKEN);
    expect(document.constraints.equipment).toEqual([]);
    expect(document.constraints.injuries).toEqual([]);
  });

  test("both day counts are the number of training days, whatever the document declared", () => {
    const declared = { ...published(), daysPerWeek: 5 };
    declared.constraints = { ...declared.constraints, daysPerWeek: 6 };
    const { document } = forDraftSave(declared, TOKEN);
    expect(document.daysPerWeek).toBe(3);
    expect(document.constraints.daysPerWeek).toBe(3);
  });

  test("every document field is on the body — nothing of the eight is dropped (the BUG-195 shape)", () => {
    const { document } = forDraftSave(published(), TOKEN);
    expect(Object.keys(document).sort()).toEqual([
      "constraints",
      "daysPerWeek",
      "goal",
      "level",
      "name",
      "summary",
      "trainingDays",
      "weeklyProgression",
    ]);
    expect(Object.keys(document.trainingDays[0]).sort()).toEqual([
      "dayOfWeek",
      "estimatedMinutes",
      "exercises",
      "focus",
    ]);
    expect(Object.keys(document.trainingDays[0].exercises[0]).sort()).toEqual([
      "durationSeconds",
      "name",
      "notes",
      "reps",
      "rest",
      "sets",
      "tempo",
      "trackingType",
      "weight",
    ]);
  });

  test("AC3.9 — an unchanged draft is deep-equal to what was loaded, except the six the server owns", () => {
    const loaded = published();
    const { document } = forDraftSave(editableDocument(null, loaded), TOKEN);
    const strip = (r: Routine) => ({
      ...r,
      goal: "·",
      level: "·",
      daysPerWeek: 0,
      constraints: { ...r.constraints, equipment: [], injuries: [], daysPerWeek: 0 },
    });
    expect(strip(document)).toEqual(strip(loaded));
    // …and the fields a lossy projection used to delete are still there, byte for byte.
    const plank = document.trainingDays[0].exercises[1];
    expect(plank).toEqual({
      name: "Plank",
      sets: 3,
      reps: null,
      rest: "30s",
      tempo: null,
      notes: null,
      trackingType: "DURATION",
      durationSeconds: 45,
      weight: null,
    });
    expect(document.trainingDays[0].exercises[0].tempo).toBe("3-1-1");
    expect(document.trainingDays[0].exercises[0].notes).toBe("Chest tall");
    expect(document.trainingDays[0].exercises[0].weight).toBe("16 kg");
    expect(document.trainingDays[0].estimatedMinutes).toBe(45);
    // D10: the trainee's own progression rides along untouched (CARRIED_UNSEEN).
    expect(document.weeklyProgression).toEqual([
      { week: 2, adjustment: "Add one set to the main lifts", rationale: null },
    ]);
  });

  test("goal and level travel as served — the SERVER overwrites them, the portal never invents one", () => {
    const { document } = forDraftSave(published(), TOKEN);
    expect(document.goal).toBe("BUILD_MUSCLE");
    expect(document.level).toBe("INTERMEDIATE");
    // From scratch there is nothing served: the api's own missing-profile defaults,
    // non-blank because `@NotBlank`, and replaced by the save's response.
    const scratch = forDraftSave(blankRoutine("Routine", "New day"), null).document;
    expect(scratch.goal).toBe("GET_STRONGER");
    expect(scratch.level).toBe("BEGINNER");
  });

  test("a DURATION exercise is sent with reps: null — and only a DURATION exercise", () => {
    const legacy = published();
    // A document written before ADR-0018 D9 can carry reps on a timed exercise.
    legacy.trainingDays[0].exercises[1] = { ...legacy.trainingDays[0].exercises[1], reps: "30s" };
    // The wire is a free string (`RoutineExercise.trackingType` is not an enum in Java).
    legacy.trainingDays[1].exercises[0] = {
      ...legacy.trainingDays[1].exercises[0],
      trackingType: "duration" as unknown as RoutineExercise["trackingType"],
    };
    const { document } = forDraftSave(legacy, TOKEN);
    expect(document.trainingDays[0].exercises[1].reps).toBeNull();
    // `isDuration` is equalsIgnoreCase, as the api's is.
    expect(document.trainingDays[1].exercises[0].reps).toBeNull();
    expect(document.trainingDays[0].exercises[0].reps).toBe("8-12");
    expect(document.trainingDays[2].exercises[0].reps).toBe("8");
  });

  test("staff review B1 — a TEMPLATE save clears reps on a timed exercise too, through the same helper", () => {
    const legacy = published();
    legacy.trainingDays[0].exercises[1] = { ...legacy.trainingDays[0].exercises[1], reps: "8-12" };
    const body = forTemplateSave({ name: "Core circuit", document: legacy });
    expect(body.document.trainingDays[0].exercises[1].reps).toBeNull();
    expect(body.document.trainingDays[0].exercises[0].reps).toBe("8-12");
    // A day with nothing to clear is the same object: the helper rewrites nothing else.
    const days = published().trainingDays;
    expect(withoutDurationReps(days)[1]).toBe(days[1]);
  });

  test("it does not mutate the editor's document", () => {
    const working = published();
    const before = JSON.stringify(working);
    forDraftSave(working, TOKEN);
    expect(JSON.stringify(working)).toBe(before);
  });
});

test.describe("the document the editor holds", () => {
  test("AC3.5 — a picked exercise's trackingType is the catalog's, not the constant WEIGHT_REPS", () => {
    expect(newExercise({ name: "Plank", exerciseType: "DURATION" })).toEqual({
      name: "Plank",
      sets: 3,
      reps: null,
      rest: "90s",
      tempo: null,
      notes: null,
      trackingType: "DURATION",
      // D3: null, never a fabricated 60.
      durationSeconds: null,
      weight: null,
    });
    for (const type of ["WEIGHTED", "BODYWEIGHT", null, undefined] as const) {
      const picked = newExercise({ name: "Push-Up", exerciseType: type });
      expect(picked.trackingType, String(type)).toBe("WEIGHT_REPS");
      expect(picked.reps, String(type)).toBe("8-12");
    }
  });

  test("switching the tracking clears the field the new mode hides, and nothing else", () => {
    const timed = withTrackingType(exercise(), "DURATION");
    expect(timed.trackingType).toBe("DURATION");
    expect(timed.reps).toBeNull();
    expect(timed.tempo).toBe("3-1-1");
    const back = withTrackingType({ ...timed, durationSeconds: 60 }, "WEIGHT_REPS");
    expect(back.trackingType).toBe("WEIGHT_REPS");
    expect(back.durationSeconds).toBeNull();
    expect(back.weight).toBe("16 kg");
  });

  test("a document off the wire is made safe to edit: absent lists and optional fields become empty/null", () => {
    const partial = {
      name: "Legacy",
      goal: "GET_STRONGER",
      level: "BEGINNER",
      daysPerWeek: 2,
      trainingDays: [
        { dayOfWeek: 1, focus: "A", exercises: null },
        { dayOfWeek: 2, focus: "B", exercises: [{ name: "Row", sets: 3, reps: "10", rest: "60s" }] },
      ],
      weeklyProgression: null,
      constraints: null,
      summary: undefined,
    } as unknown as Routine;
    const doc = editableDocument("Plan row name", partial);
    expect(doc.name).toBe("Plan row name");
    expect(doc.trainingDays[0].exercises).toEqual([]);
    expect(doc.trainingDays[1].exercises[0]).toEqual({
      name: "Row",
      sets: 3,
      reps: "10",
      rest: "60s",
      tempo: null,
      notes: null,
      trackingType: null,
      durationSeconds: null,
      weight: null,
    });
    expect(doc.weeklyProgression).toEqual([]);
    expect(doc.constraints).toEqual({ equipment: [], injuries: [], minutesPerSession: 45, daysPerWeek: 2 });
    expect(doc.summary).toBeNull();
  });

  test("the save's response lends its SERVER fields to the working copy and nothing else", () => {
    const working = { ...published(), name: "typed during the round trip" };
    const stored = {
      ...published(),
      name: "what was sent",
      goal: "LOSE_WEIGHT",
      level: "ADVANCED",
      constraints: { equipment: [], injuries: [], minutesPerSession: 45, daysPerWeek: 3 },
    };
    const merged = withServerFields(working, stored);
    expect(merged.goal).toBe("LOSE_WEIGHT");
    expect(merged.level).toBe("ADVANCED");
    expect(merged.constraints.equipment).toEqual([]);
    expect(merged.constraints.injuries).toEqual([]);
    // What the coach typed meanwhile is theirs, not the response's.
    expect(merged.name).toBe("typed during the round trip");
    expect(withServerFields(working, null)).toBe(working);
  });

  test("the reasons the editor refuses to send, in the coach's words, naming the day", () => {
    const empty = blankRoutine("Routine", "New day");
    expect(documentReasons(empty, en, { dayCountBound: en.routine.dayCountBound })).toEqual([
      "Day 1 has no exercises.",
      "Day 2 has no exercises.",
    ]);
    const bad = published();
    bad.trainingDays[1].exercises[0] = { ...bad.trainingDays[1].exercises[0], sets: 21, rest: " " };
    bad.trainingDays[2] = { ...bad.trainingDays[2], dayOfWeek: 1 };
    bad.constraints = { ...bad.constraints, minutesPerSession: 0 };
    expect(documentReasons(bad, en, { dayCountBound: en.routine.dayCountBound })).toEqual([
      "Day 2: Push-Up needs between 1 and 20 sets.",
      "Day 2: Push-Up needs a rest time.",
      "Two training days are on the same weekday.",
      "Set how many minutes a session lasts.",
    ]);
    expect(documentReasons(published(), en, { dayCountBound: en.routine.dayCountBound })).toEqual([]);
    const one = { ...published(), trainingDays: published().trainingDays.slice(0, 1) };
    expect(documentReasons(one, en, { dayCountBound: en.routine.dayCountBound })).toEqual([
      "A plan has between 2 and 6 training days.",
    ]);
  });

  /*
   * EV-344-R2 / EV-344.5A — a trainee's minutes per session outside 20–90 (b-fit-api V11
   * `chk_plans_session_minutes`) is a reason, so neither Save nor Publish is sent. Literals,
   * never read back from the dictionaries. A template has no such reason at any value.
   */
  test("EV-344.5A: minutes outside 20–90 is a trainee reason, alone; never a template's", () => {
    const OUT = {
      en: "Minutes per session: enter a value between 20 and 90.",
      fr: "Minutes par séance\u00a0: indiquez une valeur entre 20 et 90.",
    } as const;
    const at = (minutes: number): Routine => {
      const doc = published();
      return { ...doc, constraints: { ...doc.constraints, minutesPerSession: minutes } };
    };
    for (const [copy, lang] of [
      [en, "en"],
      [fr, "fr"],
    ] as const) {
      const trainee = { dayCountBound: copy.routine.dayCountBound, sessionMinutesRange: true };
      for (const minutes of [19, 91, 15, 120]) {
        expect(documentReasons(at(minutes), copy, trainee), `${lang} ${minutes}`).toEqual([OUT[lang]]);
      }
      for (const minutes of [20, 90, 45]) {
        expect(documentReasons(at(minutes), copy, trainee), `${lang} ${minutes}`).toEqual([]);
      }
      // Not > 0: `minutesRequired` alone, never both.
      expect(documentReasons(at(0), copy, trainee), `${lang} 0`).toEqual([copy.routine.minutesRequired]);
      // The template's own rules (`publishabilityReasons`): no range reason at any value.
      for (const minutes of [19, 20, 90, 91, 15, 120]) {
        expect(publishabilityReasons({ name: "Upper / Lower split", document: at(minutes) }, copy), `template ${lang} ${minutes}`).toEqual([]);
      }
    }
  });
});

/** An `ApiError` as `apiFetch` throws it — duck-typed, like the module under test reads it. */
function apiError(status: number, code: string | null, details: Record<string, unknown> | null = null) {
  return Object.assign(new Error("refused"), { status, code, details });
}

test.describe("routineFailure — what the api refused, in this surface's vocabulary", () => {
  test("409 COACH_DRAFT_EXISTS carries the timestamp to echo, verbatim", () => {
    expect(routineFailure(apiError(409, "COACH_DRAFT_EXISTS", { existingUpdatedAt: TOKEN }))).toEqual({
      code: "DRAFT_EXISTS",
      existingUpdatedAt: "2026-09-30T09:14:07.123456Z",
    });
  });

  test("a 409 with no readable timestamp is still a conflict, but with nothing to echo (no blind retry)", () => {
    for (const details of [null, {}, { existingUpdatedAt: 1727687647 }, { existingUpdatedAt: "" }]) {
      expect(routineFailure(apiError(409, "COACH_DRAFT_EXISTS", details)), JSON.stringify(details)).toEqual({
        code: "DRAFT_EXISTS",
        existingUpdatedAt: null,
      });
    }
  });

  test("the three 400s keep the details their sentences need", () => {
    expect(
      routineFailure(apiError(400, "COACH_DRAFT_SUBJECT_FIELD", { field: "constraints.injuries" }))
    ).toEqual({ code: "SUBJECT_FIELD", field: "constraints.injuries" });
    expect(
      routineFailure(
        apiError(400, "COACH_DRAFT_REPS_ON_DURATION", { dayOfWeek: 1, exerciseIndex: 1, field: "reps" })
      )
    ).toEqual({ code: "REPS_ON_DURATION", dayOfWeek: 1, exerciseIndex: 1 });
    expect(routineFailure(apiError(400, "VALIDATION_ERROR"))).toEqual({ code: "INVALID" });
    // Malformed details degrade to "unknown", never to a wrong location.
    expect(
      routineFailure(apiError(400, "COACH_DRAFT_REPS_ON_DURATION", { dayOfWeek: "1", exerciseIndex: 1.5 }))
    ).toEqual({ code: "REPS_ON_DURATION", dayOfWeek: null, exerciseIndex: null });
  });

  test("the pre-existing refusals keep their codes", () => {
    expect(routineFailure(apiError(400, "COACH_PLAN_EMPTY")).code).toBe("PLAN_EMPTY");
    expect(routineFailure(apiError(503, "CATALOG_UNAVAILABLE")).code).toBe("CATALOG_UNAVAILABLE");
    expect(routineFailure(apiError(409, "COACH_PUBLISH_REPAIRS_UNACKNOWLEDGED")).code).toBe(
      "REPAIRS_UNACKNOWLEDGED"
    );
    // ADR-0015 D5: every 403 is the same 403.
    expect(routineFailure(apiError(403, "COACH_ACCESS_DENIED")).code).toBe("ACCESS_DENIED");
    expect(routineFailure(apiError(403, null)).code).toBe("ACCESS_DENIED");
  });

  test("anything else — a 500, a dropped connection, a non-error — is FAILED", () => {
    expect(routineFailure(apiError(500, "INTERNAL_ERROR")).code).toBe("FAILED");
    expect(routineFailure(new TypeError("fetch failed")).code).toBe("FAILED");
    expect(routineFailure(undefined).code).toBe("FAILED");
    expect(routineFailure("boom").code).toBe("FAILED");
  });
});

test.describe("failureSentence — each refusal reads as its own sentence, in English and in French", () => {
  const doc = published();

  test("a timed exercise with reps is named by its weekday and its name, not the api's index", () => {
    const failure = { code: "REPS_ON_DURATION", dayOfWeek: 1, exerciseIndex: 1 } as const;
    expect(failureSentence(failure, "save", doc, en)).toBe(
      "Nothing was saved. Plank on Monday is timed, so it cannot have reps. Clear its reps, or track it by weight and reps."
    );
    expect(failureSentence(failure, "save", doc, fr)).toBe(
      "Rien n'a été enregistré. Plank (le lundi) est chronométré, il ne peut donc pas avoir de répétitions. Effacez-les, ou suivez-le en charge et répétitions."
    );
    // Unlocatable (no such day or index) → the sentence without a location, never a wrong one.
    expect(failureSentence({ ...failure, exerciseIndex: 9 }, "save", doc, en)).toBe(
      "Nothing was saved. A timed exercise in this plan has reps. Clear them, or track it by weight and reps."
    );
  });

  test("the subject-field refusal names the field in words and never a value", () => {
    expect(failureSentence({ code: "SUBJECT_FIELD", field: "constraints.injuries" }, "save", doc, en)).toBe(
      "Nothing was saved: the draft carried the trainee's own “Injuries”, which only they can set. Reload the page and try again."
    );
    expect(failureSentence({ code: "SUBJECT_FIELD", field: "constraints.equipment" }, "publish", doc, fr)).toBe(
      "Rien n'a été enregistré : le brouillon contenait « Matériel disponible » du client, que lui seul peut renseigner. Rechargez la page et réessayez."
    );
  });

  test("a validation refusal says what to check", () => {
    expect(failureSentence({ code: "INVALID" }, "save", doc, en)).toBe(
      "Nothing was saved: the server did not accept a value in this plan. Check every day has a focus and at least one exercise, and every exercise has sets and a rest time."
    );
  });

  test("the generic failure says WHICH write did not happen", () => {
    expect(failureSentence({ code: "FAILED" }, "save", doc, en)).toBe("The draft could not be saved.");
    expect(failureSentence({ code: "FAILED" }, "publish", doc, en)).toBe("The plan could not be published.");
    expect(failureSentence({ code: "FAILED" }, "save", doc, fr)).toBe("Le brouillon n'a pas pu être enregistré.");
    expect(failureSentence({ code: "PLAN_EMPTY" }, "publish", doc, en)).toBe(
      "A plan needs at least one training day."
    );
    expect(failureSentence({ code: "CATALOG_UNAVAILABLE" }, "publish", doc, en)).toBe(
      "The exercise catalog is unavailable. Try again shortly."
    );
  });
});
