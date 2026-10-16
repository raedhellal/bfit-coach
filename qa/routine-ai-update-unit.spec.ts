import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";
import type { CoachRoutineAiProposalResponse } from "../src/lib/coachApi";
import {
  chipsIn,
  hasVisibleText,
  opsRejectedCount,
  reviseRequest,
  routineAiCapability,
  routineAiSentence,
  updateBlocked,
  withChip,
} from "../src/lib/routineAi";

/**
 * EV-186f — the Update box's pure rules (`src/lib/routineAi.ts`), with no browser and no server.
 * Sentences are LITERALS copied from the story's FR/EN table, never imported from the copy files.
 */

const nb = (text: string) => text.replace(/[  ]/g, " ");
const labels = en.routineAi.chips;

test.describe("U1 — the capability: instruction only with routine, own field, literally true", () => {
  const cases: [string, unknown, boolean][] = [
    ["both true", { routine: true, nutrition: false, instruction: true }, true],
    ["instruction without routine", { routine: false, nutrition: false, instruction: true }, false],
    ["instruction false", { routine: true, nutrition: false, instruction: false }, false],
    ["instruction missing", { routine: true, nutrition: false }, false],
    ["instruction the string 'true'", { routine: true, instruction: "true" }, false],
    ["instruction inherited", Object.assign(Object.create({ instruction: true }), { routine: true }), false],
  ];
  for (const [name, raw, want] of cases) {
    test(`${name} → instruction ${want}`, () => {
      expect(routineAiCapability(raw).instruction).toBe(want);
    });
  }
});

test.describe("U1 — chips pre-fill words; the words decide what is sent", () => {
  test("a chip fills a blank box, then appends on a new line, never twice", () => {
    expect(withChip("", "More upper body")).toBe("More upper body");
    expect(withChip("  \n", "More upper body")).toBe("More upper body");
    expect(withChip("keep it short  ", "Add core")).toBe("keep it short\nAdd core");
    expect(withChip("More upper body\nAdd core", "Add core")).toBe("More upper body\nAdd core");
  });

  test("chipsIn finds each chip whose label is in the box, in the enum order", () => {
    expect(chipsIn("", labels)).toEqual([]);
    expect(chipsIn("Add core\nMore upper body", labels)).toEqual(["MORE_UPPER_BODY", "ADD_CORE"]);
    expect(chipsIn("more upper body", labels)).toEqual([]); // edited words: no longer that chip
    expect(chipsIn("Ajouter du gainage", fr.routineAi.chips)).toEqual(["ADD_CORE"]);
  });

  test("the REVISE body: kind + instruction (+ chips), never a brief or anything about the body", () => {
    expect(reviseRequest("swap Monday and Thursday", labels)).toEqual({
      kind: "REVISE",
      instruction: "swap Monday and Thursday",
    });
    const withChips = reviseRequest("More upper body\nSwap an exercise… bench for push-ups", labels);
    expect(withChips).toEqual({
      kind: "REVISE",
      instruction: "More upper body\nSwap an exercise… bench for push-ups",
      chips: ["MORE_UPPER_BODY", "SWAP_EXERCISE"],
    });
    expect(Object.keys(withChips ?? {}).sort()).toEqual(["chips", "instruction", "kind"]);
  });
});

test.describe("U2/U4 — the send rule: visible text, at most 500 code points after NFC; nothing else refused", () => {
  test("blank and invisible text cannot be sent (the api's EMPTY)", () => {
    for (const blank of ["", "   ", "\n\n", "  ", "​‌‍﻿", "　"]) {
      expect(hasVisibleText(blank)).toBe(false);
      expect(updateBlocked(blank)).toBe("empty");
      expect(reviseRequest(blank, labels)).toBeNull();
    }
    expect(hasVisibleText("​.")).toBe(true);
  });

  test("500 sends, 501 does not; emoji count once, a decomposed é once; never truncated", () => {
    expect(updateBlocked("a".repeat(500))).toBeNull();
    expect(updateBlocked("a".repeat(501))).toBe("tooLong");
    expect(updateBlocked("💪".repeat(500))).toBeNull();
    expect(updateBlocked("💪".repeat(501))).toBe("tooLong");
    expect(updateBlocked("é".repeat(500))).toBeNull();
    expect(reviseRequest("a".repeat(501), labels)).toBeNull();
    expect(reviseRequest("a".repeat(500), labels)?.instruction).toHaveLength(500);
  });

  test("U4: a pain word is just text", () => {
    expect(updateBlocked("genou douloureux, réduire la charge")).toBeNull();
    expect(reviseRequest("genou douloureux, réduire la charge", labels)?.instruction).toBe(
      "genou douloureux, réduire la charge"
    );
  });
});

test.describe("U3 — the rejected-op count", () => {
  const base = { status: "READY", repairs: [], repairMarks: [], equipmentChecked: false, unbindable: [], catalogChecked: true };
  const outcome = (n: number) => ({
    opsReturned: n + 1,
    opsApplied: 1,
    opsRejected: Array.from({ length: n }, (_, index) => ({ index, reason: "EXPECT_NAME_MISMATCH" as const })),
    unbindable: [],
  });
  test("REVISE: opsRejected.length; REGENERATE, absent or malformed: 0", () => {
    const p = (extra: Partial<CoachRoutineAiProposalResponse>) => ({ ...base, ...extra }) as CoachRoutineAiProposalResponse;
    expect(opsRejectedCount(p({ kind: "REVISE", outcome: outcome(3) }))).toBe(3);
    expect(opsRejectedCount(p({ kind: "REVISE", outcome: outcome(0) }))).toBe(0);
    expect(opsRejectedCount(p({ kind: "REGENERATE", outcome: outcome(2) }))).toBe(0);
    expect(opsRejectedCount(p({ kind: "REVISE", outcome: null }))).toBe(0);
    expect(opsRejectedCount(p({ kind: "REVISE", outcome: { opsRejected: "x" } as never }))).toBe(0);
  });

  test("one / many, EN and FR", () => {
    expect(en.routineAi.opsNotApplied(1)).toBe("1 change could not be applied.");
    expect(en.routineAi.opsNotApplied(4)).toBe("4 changes could not be applied.");
    expect(fr.routineAi.opsNotApplied(1)).toBe("1 modification n'a pas pu être appliquée.");
    expect(fr.routineAi.opsNotApplied(4)).toBe("4 modifications n'ont pas pu être appliquées.");
  });
});

test.describe("U5/U6 and the EDIT limb — sentences from the copy table", () => {
  const rows: [string, Parameters<typeof routineAiSentence>[0], string, string][] = [
    [
      "COACH_AI_NOTHING_APPLIED",
      { code: "COACH_AI_NOTHING_APPLIED", kind: "REVISE" },
      "The AI found no change to apply for this request. Nothing was changed. Rephrase it or try again.",
      "L'IA n'a trouvé aucune modification à appliquer pour cette demande. Rien n'a été modifié. Reformulez-la ou réessayez.",
    ],
    [
      "COACH_PLAN_EMPTY",
      { code: "COACH_PLAN_EMPTY", kind: "REVISE" },
      "Inès has no programme to change yet. Use “Regenerate with AI”.",
      "Inès n'a pas encore de programme à modifier. Utilisez « Régénérer avec l'IA ».",
    ],
    [
      "429 link on a REVISE (EDIT)",
      { code: "COACH_AI_RATE_LIMIT", scope: "link", kind: "REVISE" },
      "You've used today's 10 AI edits for Inès. You can still edit by hand, or try again tomorrow.",
      "Vous avez utilisé les 10 modifications IA du jour pour Inès. Vous pouvez modifier à la main, ou réessayer demain.",
    ],
    [
      "429 link on a REGENERATE (REGEN) is unchanged",
      { code: "COACH_AI_RATE_LIMIT", scope: "link", kind: "REGENERATE" },
      "You've used today's 3 AI regenerations for Inès. You can still edit by hand, or try again tomorrow.",
      "Vous avez utilisé les 3 régénérations IA du jour pour Inès. Vous pouvez modifier à la main, ou réessayer demain.",
    ],
    [
      "429 coach on a REVISE",
      { code: "COACH_AI_RATE_LIMIT", scope: "coach", kind: "REVISE" },
      "You've used all of today's AI suggestions across your clients. Try again tomorrow.",
      "Vous avez utilisé toutes vos suggestions IA du jour, pour l'ensemble de vos clients. Réessayez demain.",
    ],
    [
      "COACH_AI_INVALID_OUTPUT has no row: Failed",
      { code: "COACH_AI_INVALID_OUTPUT", kind: "REVISE" },
      "We couldn't prepare this suggestion. Nothing was changed. Try again.",
      "Impossible de préparer cette suggestion. Rien n'a été modifié. Réessayez.",
    ],
  ];
  for (const [name, failure, english, french] of rows) {
    test(name, () => {
      expect(routineAiSentence(failure, "Inès", en)).toBe(english);
      expect(nb(routineAiSentence(failure, "Inès", fr))).toBe(french);
    });
  }

  test("the pain hint, EN and FR, with the elision", () => {
    expect(en.routineAi.painHint("Omar")).toBe(
      "Injuries the plan must always respect come from Omar's profile. This note only shapes this suggestion."
    );
    expect(fr.routineAi.painHint("Omar")).toBe(
      "Les blessures que le programme doit toujours respecter viennent du profil d'Omar. Cette note n'oriente que cette suggestion."
    );
  });
});
