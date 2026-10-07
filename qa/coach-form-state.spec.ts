import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import {
  editField,
  isDirty,
  markSaved,
  markSent,
  reseedFromServer,
  resetForm,
  seedForm,
} from "../src/lib/coachFormState";

/**
 * EV-342o (B2) — `useCoachForm`'s state rules, without a browser (`src/lib/coachFormState.ts`).
 * The browser half (O.2 adoption, O.3 the guard, O.4 the consumers) is
 * `qa/form-leave-guard.spec.ts`, the last describe of `qa/coach-challenges.spec.ts`, and the
 * consumers' own specs.
 */

const SERVER = { calories: "1800", protein: "150" };

test.describe("EV-342o — the form state behind useCoachForm", () => {
  test("unsaved means 'differs from what the server holds', not 'was typed in'", () => {
    const seeded = seedForm(SERVER);
    expect(isDirty(seeded)).toBe(false);
    const typed = editField(seeded, "calories", "1750");
    expect(isDirty(typed)).toBe(true);
    // Typed back to the stored value: nothing is unsaved, so nothing is asked.
    expect(isDirty(editField(typed, "calories", "1800"))).toBe(false);
  });

  test("a refused save leaves the work unsaved; an accepted one does not", () => {
    const sent = markSent(editField(seedForm(SERVER), "calories", "1750"));
    // Refused: the caller does nothing to the state, so the work is still unsaved.
    expect(isDirty(sent)).toBe(true);
    expect(isDirty(markSaved(sent))).toBe(false);
    expect(markSaved(sent).baseline).toEqual({ calories: "1750", protein: "150" });
  });

  test("a field typed while the save was in flight survives the save and stays unsaved", () => {
    const sent = markSent(editField(seedForm(SERVER), "calories", "1750"));
    const typingDuring = editField(sent, "protein", "160");
    // The server's answer, in the form's terms (a clamp would show here).
    const saved = markSaved(typingDuring, { calories: "1750", protein: "150" });
    expect(saved.values).toEqual({ calories: "1750", protein: "160" });
    expect(isDirty(saved)).toBe(true);
  });

  test("the server's stored value replaces what was sent (a clamp), and re-seeds touched", () => {
    const sent = markSent(editField(seedForm(SERVER), "calories", "900"));
    const saved = markSaved(sent, { calories: "1200", protein: "150" });
    expect(saved.values.calories).toBe("1200");
    expect(saved.touched.calories).toBe(false);
    expect(isDirty(saved)).toBe(false);
  });

  test("props re-seed every field but the one being typed in (ADR-0033 D33.9)", () => {
    const typing = editField(seedForm(SERVER), "calories", "17");
    const pushed = reseedFromServer(typing, { calories: "2000", protein: "155" });
    expect(pushed.values).toEqual({ calories: "17", protein: "155" });
    // The baseline is the server's in full: the field being typed is unsaved against it.
    expect(pushed.baseline).toEqual({ calories: "2000", protein: "155" });
    expect(isDirty(pushed)).toBe(true);
  });

  test("an ended access is not unsaved work; the next keystroke is", () => {
    const typed = editField(seedForm(SERVER), "calories", "1750");
    const ended = { ...typed, abandoned: true };
    expect(isDirty(ended)).toBe(false);
    expect(isDirty(editField(ended, "protein", "151"))).toBe(true);
  });

  test("a typed field's own error goes with the keystroke; the others stay", () => {
    const withErrors = { ...seedForm(SERVER), errors: { calories: "Enter a number above 0.", protein: "x" } };
    const typed = editField(withErrors, "calories", "1700");
    expect(typed.errors).toEqual({ protein: "x" });
  });

  test("a list field compares by its items (the challenge dialog's clients)", () => {
    const seeded = seedForm({ title: "", clientIds: [] as readonly string[] });
    const picked = editField(seeded, "clientIds", ["a"]);
    expect(isDirty(picked)).toBe(true);
    expect(isDirty(editField(picked, "clientIds", []))).toBe(false);
    expect(isDirty(resetForm(picked, { title: "", clientIds: [] }))).toBe(false);
  });
});
