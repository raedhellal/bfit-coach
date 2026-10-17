import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";
import type { Routine } from "../src/lib/coachApi";
import {
  POLL_FAST_MS,
  POLL_SLOW_MS,
  briefBlocked,
  briefRequest,
  heldUntil,
  initialBriefForm,
  notesLength,
  pollDelayMs,
  routineAiCapability,
  routineAiNoticeLines,
  routineAiSentence,
} from "../src/lib/routineAi";

/**
 * EV-186b — the panel's pure rules (`src/lib/routineAi.ts`), with no browser and no server.
 * Sentences are LITERALS copied from the story's FR/EN table, never imported from the copy
 * files: an assertion that imports the string it checks agrees with it by construction.
 */

test.describe("B1 — the capability fails closed", () => {
  const cases: [string, unknown, boolean][] = [
    ["routine true", { routine: true, nutrition: false, instruction: false }, true],
    ["routine false", { routine: false, nutrition: true, instruction: true }, false],
    ["absent (undefined)", undefined, false],
    ["null", null, false],
    ["a string", "routine", false],
    ["an array", [true], false],
    ["routine missing", { nutrition: true, instruction: true }, false],
    ["routine the string 'true'", { routine: "true" }, false],
    ["routine 1", { routine: 1 }, false],
    ["routine inherited, not own", Object.create({ routine: true }), false],
  ];
  for (const [name, raw, want] of cases) {
    test(`${name} → routine ${want}`, () => {
      expect(routineAiCapability(raw).routine).toBe(want);
    });
  }
  test("instruction is never true while routine is false", () => {
    expect(routineAiCapability({ routine: false, instruction: true }).instruction).toBe(false);
    expect(routineAiCapability({ routine: true, instruction: true }).instruction).toBe(true);
    expect(routineAiCapability({ routine: true }).instruction).toBe(false);
  });
});

function plan(days: number, minutes: number, goal = "BUILD_MUSCLE"): Routine {
  return {
    name: "P",
    goal,
    level: "INTERMEDIATE",
    daysPerWeek: days,
    trainingDays: Array.from({ length: days }, (_, i) => ({
      dayOfWeek: i + 1,
      focus: `D${i + 1}`,
      estimatedMinutes: null,
      exercises: [],
    })),
    weeklyProgression: [],
    constraints: { equipment: [], injuries: [], minutesPerSession: minutes, daysPerWeek: days },
    summary: null,
  };
}

test.describe("B2 — the brief", () => {
  test("pre-fills goal, days and length from the plan, only with values the brief accepts", () => {
    expect(initialBriefForm(plan(3, 45))).toEqual({ goal: "BUILD_MUSCLE", days: 3, sessionLength: 45, emphasis: [], notes: "" });
    // 7 days and 50 minutes are outside the brief's enums: left unchosen, never snapped.
    expect(initialBriefForm(plan(7, 50, "SOMETHING"))).toEqual({ goal: "", days: "", sessionLength: "", emphasis: [], notes: "" });
    expect(initialBriefForm(null).goal).toBe("");
  });

  test("the body carries kind + the five brief keys only, and omits empty optionals", () => {
    const body = briefRequest({ goal: "GET_STRONGER", days: 4, sessionLength: 60, emphasis: [], notes: "   " });
    expect(body).toEqual({ kind: "REGENERATE", brief: { goal: "GET_STRONGER", days: 4, sessionLength: 60 } });
    const full = briefRequest({ goal: "MOBILITY", days: 2, sessionLength: 20, emphasis: ["glutes"], notes: "line 1\nline 2" });
    expect(Object.keys(full ?? {}).sort()).toEqual(["brief", "kind"]);
    expect(Object.keys(full?.brief ?? {}).sort()).toEqual(["days", "emphasis", "goal", "notes", "sessionLength"]);
    expect(full?.brief?.notes).toBe("line 1\nline 2");
  });

  test("an incomplete brief, 501 characters or 6 muscle groups cannot be sent; 500 can", () => {
    const ok = { goal: "BUILD_MUSCLE" as const, days: 3, sessionLength: 45, emphasis: [], notes: "" };
    expect(briefBlocked({ ...ok, goal: "" })).toBe("incomplete");
    expect(briefBlocked({ ...ok, notes: "a".repeat(500) })).toBeNull();
    expect(briefBlocked({ ...ok, notes: "a".repeat(501) })).toBe("notesTooLong");
    expect(briefRequest({ ...ok, notes: "a".repeat(501) })).toBeNull();
    expect(briefBlocked({ ...ok, emphasis: ["a", "b", "c", "d", "e", "f"] })).toBe("emphasisTooMany");
  });

  test("the counter counts after NFC: a decomposed é (e + U+0301) is one character", () => {
    expect(notesLength("e\u0301")).toBe(1);
    expect(notesLength("abc")).toBe(3);
  });

  test("the counter counts CODE POINTS, as the api does: 251 emoji are 251, and 500 emoji can be sent", () => {
    const emoji = "\u{1F4AA}"; // astral: two UTF-16 units, one code point
    expect(emoji.length).toBe(2);
    expect(notesLength(emoji.repeat(251))).toBe(251);
    const ok = { goal: "BUILD_MUSCLE" as const, days: 3, sessionLength: 45, emphasis: [] };
    expect(briefBlocked({ ...ok, notes: emoji.repeat(500) })).toBeNull();
    expect(briefBlocked({ ...ok, notes: emoji.repeat(501) })).toBe("notesTooLong");
  });
});

test.describe("B4 — every code renders its table sentence; anything else the Failed sentence", () => {
  const EN: [string, Partial<{ scope: "link" | "coach" }>, string][] = [
    ["COACH_AI_RATE_LIMIT", { scope: "link" }, "You've used today's 3 AI regenerations for Lina. You can still edit by hand, or try again tomorrow."],
    ["COACH_AI_RATE_LIMIT", { scope: "coach" }, "You've used all of today's AI suggestions across your clients. Try again tomorrow."],
    ["COACH_AI_UNAVAILABLE", {}, "AI suggestions are switched off on this server."],
    ["NOT_FOUND", {}, "AI suggestions are switched off on this server."],
    ["COACH_AI_BUSY", {}, "AI suggestions are busy right now. Try again in a minute."],
    ["COACH_AI_PROPOSAL_RUNNING", {}, "A suggestion is already being prepared for Lina."],
    ["COACH_AI_INSTRUCTION_INVALID", {}, "This request can't be sent: 500 characters at most, in plain text."],
    ["COACH_AI_NOTHING_APPLIED", {}, "The AI found no change to apply for this request. Nothing was changed. Rephrase it or try again."],
    ["CATALOG_UNAVAILABLE", {}, "The exercise catalog is unavailable. Try again shortly."],
    ["COACH_AI_TIMEOUT", {}, "We couldn't prepare this suggestion. Nothing was changed. Try again."],
    ["COACH_AI_SOMETHING_NEW", {}, "We couldn't prepare this suggestion. Nothing was changed. Try again."],
    ["VALIDATION_ERROR", {}, "We couldn't prepare this suggestion. Nothing was changed. Try again."],
    ["FAILED", {}, "We couldn't prepare this suggestion. Nothing was changed. Try again."],
  ];
  for (const [code, extra, sentence] of EN) {
    test(`EN ${code}${extra.scope ? ` (${extra.scope})` : ""}`, () => {
      expect(routineAiSentence({ code, ...extra }, "Lina", en)).toBe(sentence);
    });
  }

  const nb = (s: string) => s.replace(/ /g, " ");
  const FR: [string, Partial<{ scope: "link" | "coach" }>, string][] = [
    ["COACH_AI_RATE_LIMIT", { scope: "link" }, "Vous avez utilisé les 3 régénérations IA du jour pour Inès. Vous pouvez modifier à la main, ou réessayer demain."],
    ["COACH_AI_RATE_LIMIT", { scope: "coach" }, "Vous avez utilisé toutes vos suggestions IA du jour, pour l'ensemble de vos clients. Réessayez demain."],
    ["COACH_AI_UNAVAILABLE", {}, "Les suggestions IA sont désactivées sur ce serveur."],
    ["COACH_AI_BUSY", {}, "Les suggestions IA sont très demandées en ce moment. Réessayez dans une minute."],
    ["COACH_AI_PROPOSAL_RUNNING", {}, "Une suggestion est déjà en préparation pour Inès."],
    ["COACH_AI_INSTRUCTION_INVALID", {}, "Cette demande ne peut pas être envoyée : 500 caractères au maximum, en texte simple."],
    ["COACH_AI_NOTHING_APPLIED", {}, "L'IA n'a trouvé aucune modification à appliquer pour cette demande. Rien n'a été modifié. Reformulez-la ou réessayez."],
    ["COACH_AI_SOMETHING_NEW", {}, "Impossible de préparer cette suggestion. Rien n'a été modifié. Réessayez."],
  ];
  for (const [code, extra, sentence] of FR) {
    test(`FR ${code}${extra.scope ? ` (${extra.scope})` : ""}`, () => {
      expect(nb(routineAiSentence({ code, ...extra }, "Inès", fr))).toBe(sentence);
    });
  }

  test("the running sentence names the trainee (table)", () => {
    expect(en.routineAi.running("Lina")).toBe("Preparing a suggestion for Lina… This can take up to two minutes.");
    expect(fr.routineAi.running("Inès")).toBe("Préparation d'une suggestion pour Inès… Cela peut prendre jusqu'à deux minutes.");
  });
});

test.describe("429 hold and polling", () => {
  test("only a spent quota holds « Générer », until Retry-After", () => {
    expect(heldUntil({ code: "COACH_AI_RATE_LIMIT", scope: "link", retryAfterSeconds: 60 }, 1000)).toBe(61_000);
    expect(heldUntil({ code: "COACH_AI_RATE_LIMIT", scope: "coach", retryAfterSeconds: null }, 1000)).toBeNull();
    expect(heldUntil({ code: "COACH_AI_BUSY", retryAfterSeconds: 60 }, 1000)).toBeNull();
  });
  test("2 s while the api's 120 s bound runs (plus margin), then 10 s; never a local timeout", () => {
    expect(pollDelayMs(0)).toBe(POLL_FAST_MS);
    expect(pollDelayMs(129_999)).toBe(POLL_FAST_MS);
    expect(pollDelayMs(130_000)).toBe(POLL_SLOW_MS);
    expect(pollDelayMs(3_600_000)).toBe(POLL_SLOW_MS);
  });
});

test.describe("BUG-867 — a refused Discard's sentence, and no line twice", () => {
  const FAILED = "We couldn't prepare this suggestion. Nothing was changed. Try again.";
  const DISCARD_FAILED = "We couldn't confirm this suggestion was discarded. Try again.";
  const START_FAILED = "We couldn't confirm this request was received. Your plan was not changed. Try again.";
  const UNAVAILABLE = "AI suggestions are switched off on this server.";

  test("generic codes take the given sentence; a code with its own row keeps it", () => {
    for (const code of ["FAILED", "COACH_AI_TIMEOUT", "SOMETHING_NEW"]) {
      expect(routineAiSentence({ code }, "Lina", en, en.routineAi.discardFailed)).toBe(DISCARD_FAILED);
      expect(routineAiSentence({ code }, "Lina", en)).toBe(FAILED);
    }
    expect(routineAiSentence({ code: "COACH_AI_UNAVAILABLE" }, "Lina", en, en.routineAi.discardFailed)).toBe(UNAVAILABLE);
    expect(routineAiSentence({ code: "FAILED" }, "Lina", fr, fr.routineAi.discardFailed)).toBe(
      "Impossible de confirmer que cette suggestion a été écartée. Réessayez."
    );
    // Staff B1: a refused START has its own generic sentence too.
    expect(routineAiSentence({ code: "FAILED" }, "Lina", en, en.routineAi.startFailed)).toBe(START_FAILED);
    expect(routineAiSentence({ code: "FAILED" }, "Lina", fr, fr.routineAi.startFailed)).toBe(
      "Impossible de confirmer que cette demande a été reçue. Votre programme n'a pas été modifié. Réessayez."
    );
  });

  test("a press's sentences are not the run's, nor each other's, in either language", () => {
    for (const c of [en, fr]) {
      const lines = [c.routineAi.failed, c.routineAi.discardFailed, c.routineAi.startFailed];
      expect(new Set(lines).size).toBe(3);
    }
  });

  test("staff B1: a press line is NEVER dropped, even when its words equal the view's (a new event)", () => {
    expect(routineAiNoticeLines(UNAVAILABLE, null, UNAVAILABLE)).toEqual({ shown: UNAVAILABLE, extra: null });
    expect(routineAiNoticeLines(FAILED, null, FAILED)).toEqual({ shown: FAILED, extra: null });
    expect(routineAiNoticeLines(DISCARD_FAILED, null, FAILED)).toEqual({ shown: DISCARD_FAILED, extra: null });
  });

  test("hold lines: alone it is the alert; beside another press it is second; equal to the press, once", () => {
    expect(routineAiNoticeLines(null, "HOLD", null)).toEqual({ shown: "HOLD", extra: null });
    expect(routineAiNoticeLines("PRESS", "HOLD", FAILED)).toEqual({ shown: "PRESS", extra: "HOLD" });
    expect(routineAiNoticeLines("HOLD", "HOLD", null)).toEqual({ shown: "HOLD", extra: null });
    // The press equals the view: still drawn, with the hold second.
    expect(routineAiNoticeLines(FAILED, "HOLD", FAILED)).toEqual({ shown: FAILED, extra: "HOLD" });
    // The hold is standing state: dropped when the view already says it, alone or beside a press.
    expect(routineAiNoticeLines(null, "HOLD", "HOLD")).toEqual({ shown: null, extra: null });
    expect(routineAiNoticeLines("PRESS", "HOLD", "HOLD")).toEqual({ shown: "PRESS", extra: null });
    expect(routineAiNoticeLines(null, null, FAILED)).toEqual({ shown: null, extra: null });
  });
});
