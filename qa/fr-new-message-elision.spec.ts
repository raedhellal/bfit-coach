import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";

/**
 * BUG-1102 — the French new-message notification elides « de » the house way.
 *
 * `fr.notifications.item.CLIENT_MESSAGE` (copy.fr.ts, the notifications block) used to build
 * « Nouveau message de ${client} » with no elision, so a vowel-initial name read « de Alice ».
 * It now goes through the existing `de()` helper, so it follows the EV-273b PB-4 rule exactly
 * (copy.fr.ts `elides()`): elide before a vowel (accented or not, any case), before Y only when a
 * consonant follows, NEVER before H (« de Hugo » is the house rule's chosen imperfection, pinned by
 * french-polish.spec.ts), and keep « de » + a space before anything else.
 *
 * These tests call the dictionary entry itself, as PB-4 calls `de()`: no page, no server read.
 */
const frMessage = fr.notifications.item.CLIENT_MESSAGE;
const enMessage = en.notifications.item.CLIENT_MESSAGE;

test.describe("BUG-1102 — « Nouveau message de/d' {client} »", () => {
  test("item 1: a vowel-initial name is elided — « Nouveau message d'Alice »", () => {
    expect(frMessage("Alice")).toBe("Nouveau message d'Alice");
  });

  test("item 2: an accented capital, a lower-case vowel and Y before a consonant are elided", () => {
    expect(frMessage("Émilie")).toBe("Nouveau message d'Émilie");
    // The same É, decomposed (E + combining acute), as some keyboards and APIs send it.
    expect(frMessage("Émilie")).toBe("Nouveau message d'Émilie");
    expect(frMessage("olivier")).toBe("Nouveau message d'olivier");
    expect(frMessage("Yves")).toBe("Nouveau message d'Yves");
  });

  test("item 3: a consonant, Y before a vowel and H keep « de » — the house rule, unchanged", () => {
    expect(frMessage("Bruno")).toBe("Nouveau message de Bruno");
    expect(frMessage("Yann")).toBe("Nouveau message de Yann");
    expect(frMessage("Hugo")).toBe("Nouveau message de Hugo");
  });

  test("item 4: a digit, an emoji, punctuation or an empty name keeps « de » + a space, and nothing throws", () => {
    const cases: Array<[string, string]> = [
      ["5x5", "Nouveau message de 5x5"],
      ["😀 Alice", "Nouveau message de 😀 Alice"],
      [".Alice", "Nouveau message de .Alice"],
      ["« Alice »", "Nouveau message de « Alice »"],
      ["(Olivier)", "Nouveau message de (Olivier)"],
      ["", "Nouveau message de "],
    ];
    for (const [client, expected] of cases) {
      let out = "";
      expect(() => {
        out = frMessage(client);
      }, client).not.toThrow();
      expect(out, client).toBe(expected);
    }
  });

  test("item 6: the English string is unchanged — « New message from {client} »", () => {
    for (const client of ["Alice", "Bruno", "Hugo", "Yves", ""]) {
      expect(enMessage(client)).toBe(`New message from ${client}`);
    }
  });
});
