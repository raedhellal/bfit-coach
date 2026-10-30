import { expect, test } from "@playwright/test";
import { mapSelection } from "../src/lib/reseedSelection";

/**
 * BUG-1070 — where a selection goes when a re-seed rewrites the field's text. The two shapes
 * the ruling defines, and the ones it leaves to the browser (null). No browser needed.
 */
test.describe("BUG-1070 mapSelection", () => {
  test("the whole text selected stays the whole new text", () => {
    expect(mapSelection("60.00", 0, 5, "60")).toEqual([0, 2]);
    expect(mapSelection("20,5", 0, 4, "20.5")).toEqual([0, 4]);
    expect(mapSelection("5", 0, 1, "5.5")).toEqual([0, 3]);
  });

  test("a caret at the end stays at the end", () => {
    expect(mapSelection("60.00", 5, 5, "60")).toEqual([2, 2]);
    expect(mapSelection("", 0, 0, "60")).toEqual([2, 2]);
  });

  test("a partial selection or an inner caret is not mapped", () => {
    expect(mapSelection("60.00", 0, 2, "60")).toBeNull();
    expect(mapSelection("60.00", 1, 5, "60")).toBeNull();
    expect(mapSelection("60.00", 3, 3, "60")).toBeNull();
    expect(mapSelection("60.00", 0, 0, "60")).toBeNull();
  });
});
