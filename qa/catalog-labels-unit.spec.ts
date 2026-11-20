import { expect, test } from "@playwright/test";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";
import { equipmentLabel, muscleLabel, musclesLabel } from "../src/lib/catalogLabels";

/**
 * BUG-836 — the catalogue labels are an OWN-KEY lookup. `copy.catalog.muscles` and
 * `.equipment` are plain objects, so a plain `table[key]` finds `Object.prototype`'s members:
 * "constructor" labelled as a function and "__proto__" as an object. Only the tables' own keys
 * resolve; anything else falls back exactly as an unknown value already does (a token is
 * humanised, words are shown as served). And a comma list drops a part that labels to "",
 * as the app's `catalogMuscleLabels.ts` does, instead of reading "A, , B".
 *
 * No browser: node only.
 */

/** Raw value → what the existing unknown-value fallback makes of it. */
const PROTOTYPE_KEYS: [string, string][] = [
  ["constructor", "constructor"],
  ["Constructor", "Constructor"],
  [" constructor ", "constructor"],
  ["__proto__", "Proto"], // a token: humanised
  ["__PROTO__", "Proto"],
  ["toString", "toString"],
  ["valueOf", "valueOf"],
  ["hasOwnProperty", "hasOwnProperty"],
];

test.describe("BUG-836 — only the label tables' own keys resolve", () => {
  for (const copy of [en, fr]) {
    test(`${copy.locale}: Object.prototype names fall back to the served value`, () => {
      for (const [raw, expected] of PROTOTYPE_KEYS) {
        for (const label of [muscleLabel, equipmentLabel]) {
          const out = label(raw, copy);
          expect(typeof out, `${label.name}(${JSON.stringify(raw)})`).toBe("string");
          expect(out, `${label.name}(${JSON.stringify(raw)})`).toBe(expected);
        }
      }
    });

    test(`${copy.locale}: a muscle list never carries a prototype member or an empty part`, () => {
      expect(musclesLabel("constructor,__proto__", copy)).toBe("constructor, Proto");
      expect(musclesLabel("biceps,_,calves", copy)).toBe(`${muscleLabel("biceps", copy)}, ${muscleLabel("calves", copy)}`);
      expect(musclesLabel("_, __ ,-_-", copy)).toBe("");
    });
  }

  test("the tables' own keys still resolve", () => {
    expect(muscleLabel("biceps", en)).toBe(en.catalog.muscles.biceps);
    expect(muscleLabel("BICEPS", fr)).toBe(fr.catalog.muscles.biceps);
  });
});
