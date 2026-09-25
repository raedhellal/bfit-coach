import { expect, test } from "@playwright/test";
import {
  addressOf,
  blankRecipe,
  forSave,
  localProblems,
  nameLength,
  normaliseName,
  parseQuantity,
  parseWhole,
  recipeFieldOf,
  serverProblem,
  type RecipeDraft,
  type RecipeFailure,
} from "../src/lib/recipeDocument";

/**
 * EV-256b — the recipe editor's rules, driven WITHOUT a browser.
 *
 * Two things live here because the UI cannot reach them, and neither may therefore go
 * untested:
 *
 *   1. **Bean Validation's refusal shape.** The editor refuses a fraction, a bound and an
 *      over-long name BEFORE it sends, so from the browser the api's own
 *      `VALIDATION_ERROR` for those is unreachable by design. But it is the shape the
 *      live api answers with — no details, the field at the START of `message`
 *      (`RestExceptionHandler.handleValidation`) — and the portal must still address it
 *      to the right control on the day a local check and the api disagree.
 *   2. **The counting unit of the name bound**, where "the same rule as the server" is a
 *      claim about UTF-16 units and Unicode categories that one ASCII example cannot
 *      witness.
 *
 * Sentences are LITERALS, never imported from `copy.ts` (the suite's rule: a fixture
 * derived from its subject cannot witness it).
 */

const filled = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({
  name: "Chicken rice bowl",
  ingredients: [{ key: "chicken_breast", label: "chicken breast", quantity: "150", unit: "g" }],
  kcal: "560",
  proteinG: "50",
  carbsG: "62",
  fatG: "12",
  steps: ["Cook the rice."],
  ...over,
});

const none = { field: null, key: null, computedKcal: null };

test.describe("the name is counted the way the api counts it", () => {
  test("80 UTF-16 units after normalisation is the bound, emoji counting 2", () => {
    expect(nameLength("a".repeat(80))).toBe(80);
    // U+1F957 (green salad) is outside the BMP: Java String.length() and JS .length both say 2.
    expect(nameLength(`${"a".repeat(78)}\u{1F957}`)).toBe(80);
    expect(localProblems(filled({ name: `${"a".repeat(78)}\u{1F957}` }))).toEqual([]);
    expect(localProblems(filled({ name: `${"a".repeat(79)}\u{1F957}` })).map((p) => p.message)).toEqual([
      "A recipe name is at most 80 characters.",
    ]);
  });

  test("zero-width format characters are removed and Unicode spaces fold, as normalise does", () => {
    // ZWSP/ZWJ are Cf: removed, not counted. NBSP is Zs: folded, then stripped at the ends.
    const padded = `\u00A0\u200B${"b".repeat(80)}\u200D\u00A0`;
    expect(normaliseName(padded)).toBe("b".repeat(80));
    expect(localProblems(filled({ name: padded }))).toEqual([]);
    // A name made ONLY of invisible characters is no name.
    expect(normaliseName("\u200B\u00A0\u200D")).toBeNull();
    // The Arabic tatweel is a LETTER (Lm) and is kept, as the api keeps it.
    expect(normaliseName("مـــرحبا")).toBe("مـــرحبا");
  });

  test("a line break or control character is refused", () => {
    expect(localProblems(filled({ name: "Chicken\trice" })).map((p) => p.message)).toEqual([
      "Keep this on one line, with no special characters.",
    ]);
  });
});

test.describe("numbers", () => {
  test("a macro is a WHOLE number: 50.7 is refused, never truncated; 50.0 is accepted", () => {
    expect(parseWhole("50.7")).toEqual({ kind: "fraction", value: 50.7 });
    expect(parseWhole("50.0")).toEqual({ kind: "whole", value: 50 });
    const refused = localProblems(filled({ proteinG: "50.7" }));
    expect(refused).toEqual([{ at: "proteinG", message: "Whole numbers only. Use 50 or 51." }]);
    expect(localProblems(filled({ proteinG: "50.0" }))).toEqual([]);
    expect(forSave(filled({ proteinG: "50.0" })).proteinG).toBe(50);
  });

  test("the bounds are the api's: kcal 1..3000, each macro 0..300", () => {
    expect(localProblems(filled({ kcal: "0" }))[0]).toEqual({
      at: "kcal",
      message: "Calories (kcal): a whole number from 1 to 3000.",
    });
    expect(localProblems(filled({ fatG: "301" }))[0]).toEqual({
      at: "fatG",
      message: "Fat (g): a whole number from 0 to 300.",
    });
    expect(localProblems(filled({ carbsG: "0", kcal: "3000" }))).toEqual([]);
  });

  test("a quantity is > 0, ≤ 5000, at most two decimals — 150.000 refused like the api's @Digits", () => {
    expect(parseQuantity("150")).toBe(150);
    expect(parseQuantity("0.25")).toBe(0.25);
    expect(parseQuantity("5000")).toBe(5000);
    for (const bad of ["0", "5000.01", "150.000", "1e3", "-1", ""]) {
      expect(parseQuantity(bad), bad).toBeNull();
    }
  });
});

test("a blank form lists what is missing as hints, not errors, and cannot be sent", () => {
  const problems = localProblems(blankRecipe());
  expect(problems.length).toBeGreaterThan(0);
  expect(problems.every((p) => p.missing)).toBe(true);
});

test("a step is sent stripped, because the api bounds the RAW string at 300", () => {
  const step = `${"s".repeat(300)} `;
  expect(localProblems(filled({ steps: [step] }))).toEqual([]);
  expect(forSave(filled({ steps: [step] })).steps[0]).toHaveLength(300);
});

test.describe("every server refusal is addressed to its field (AC4)", () => {
  const sent = {
    kcal: 500,
    ingredients: [
      { key: "quark", label: "quark" },
      { key: "oats", label: "oats" },
    ],
  };

  test("Bean Validation's shape: no details, the field leads the message", () => {
    expect(recipeFieldOf(null, "proteinG must be a whole number")).toBe("proteinG");
    expect(recipeFieldOf(null, "ingredients[1].quantity must be at most 5000")).toBe(
      "ingredients[1].quantity"
    );
    expect(recipeFieldOf(null, "steps[3] doit faire au plus 300 caractères")).toBe("steps[3]");
    // A sentence that merely STARTS with a field-like word is not a field.
    expect(recipeFieldOf(null, "names must be unique")).toBeNull();
    expect(recipeFieldOf(null, "Request failed (400)")).toBeNull();

    const failure: RecipeFailure = { code: "INVALID_FIELD", ...none, field: "proteinG" };
    expect(serverProblem(failure, sent)).toEqual({
      at: "proteinG",
      message: "Protein (g): a whole number from 0 to 300.",
    });
  });

  test("the rules' shape: details.field wins", () => {
    expect(recipeFieldOf({ field: "steps[0]" }, "must be between 1 and 300 characters")).toBe("steps[0]");
    expect(addressOf("ingredients[1].key")).toBe("ingredients.1");
    expect(
      serverProblem({ code: "INVALID_FIELD", ...none, field: "ingredients[1].key" }, sent)
    ).toEqual({ at: "ingredients.1", message: "This ingredient is already in the recipe." });
  });

  test("an unknown ingredient lands on the LINE the api named, labelled", () => {
    const failure: RecipeFailure = {
      code: "UNKNOWN_INGREDIENT",
      field: "ingredients[0].key",
      key: "quark",
      computedKcal: null,
    };
    expect(serverProblem(failure, sent)).toEqual({
      at: "ingredients.0",
      message: "“quark” is no longer on Evoli's ingredient list. Remove it to save.",
    });
  });

  test("…and a refusal on line 1 lands on line 1, labelled with THAT line (not the first)", () => {
    const failure: RecipeFailure = {
      code: "UNKNOWN_INGREDIENT",
      field: "ingredients[1].key",
      key: "oats",
      computedKcal: null,
    };
    expect(serverProblem(failure, sent)).toEqual({
      at: "ingredients.1",
      message: "“oats” is no longer on Evoli's ingredient list. Remove it to save.",
    });
  });

  test("the macro refusal is AC4's sentence, with computedKcal and the kcal SENT", () => {
    expect(
      serverProblem({ code: "MACROS_INCONSISTENT", ...none, computedKcal: 680 }, sent)
    ).toEqual({
      at: "macros",
      message: "These macros add up to 680 kcal, not 500. Check the numbers.",
    });
  });

  test("name taken → the name; limit, denial and anything else → under Save", () => {
    expect(serverProblem({ code: "NAME_TAKEN", ...none }, sent).at).toBe("name");
    expect(serverProblem({ code: "LIMIT_REACHED", ...none }, sent)).toEqual({
      at: "form",
      message: "You can keep up to 100 recipes. Delete one to make room.",
    });
    expect(serverProblem({ code: "ACCESS_DENIED", ...none }, sent).message).toBe(
      "That recipe is not in your library."
    );
    expect(serverProblem({ code: "FAILED", ...none }, sent).at).toBe("form");
  });
});
